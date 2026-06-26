/**
 * @file Route tests for the developer-portal email/password auth surface
 * (`/api/dev/auth/*`, MC-064). Drives the real {@link devAuthRoutes} handlers
 * through `app.inject` against a Fastify instance wired exactly like
 * `server.ts`: `@fastify/jwt` → {@link authPlugin} → `@fastify/cookie` →
 * routes (so `app.jwt.sign`, the `mc_dev_session` cookie and
 * `app.authenticateDeveloper` all behave as in production).
 *
 * ## What is real vs. mocked
 *
 * - **Real:** route logic, JWT signing/verification, cookie set/clear, the
 *   pure auth primitives from `developer-auth.ts` (bcrypt hashing,
 *   timing-safe verify, SHA-256 token hashing) and the `authenticateDeveloper`
 *   guard. Exercising these end-to-end is the point of a route test.
 * - **Mocked:** the persistence layer (`getDeveloperRepository` from
 *   `../db/index.js`) so no Postgres pool is built, and the transactional
 *   emails (`../services/developer-email.js`) so nothing is sent and the
 *   SMTP2GO provider is never touched. Both the guard and the routes import
 *   `getDeveloperRepository` from the same module, so one mock covers both.
 *
 * The mocked repository ({@link makeRepo}) returns a fresh, per-test-configurable
 * stub: each test wires only the methods it needs (e.g. `findByEmail` resolving
 * to `null`, a verified, or an unverified account).
 */

import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeveloperAccount, DeveloperEmailToken, DeveloperRepository } from "../db/developer-repository.js";
import { getDeveloperRepository } from "../db/index.js";
import authPlugin from "../plugins/auth.js";
import { hashEmailToken, hashPassword, SESSION_COOKIE_NAME } from "../services/developer-auth.js";
import { sendDeveloperPasswordResetEmail, sendDeveloperVerificationEmail } from "../services/developer-email.js";
import { devAuthRoutes } from "./developer-auth.js";

vi.mock("../db/index.js", () => ({
  getDeveloperRepository: vi.fn(),
}));

vi.mock("../services/developer-email.js", () => ({
  sendDeveloperVerificationEmail: vi.fn(async () => undefined),
  sendDeveloperPasswordResetEmail: vi.fn(async () => undefined),
}));

/** JWT secret used to sign/verify session tokens in these tests. */
const TEST_JWT_SECRET = "test-developer-auth-secret-key-do-not-use-in-prod";

/** Plaintext password reused across login/reset scenarios (meets the 8-char minimum). */
const VALID_PASSWORD = "correct horse battery staple";

/**
 * Builds a complete {@link DeveloperAccount} DTO with sensible defaults that
 * any test can override field-by-field. Defaults to a *verified* account so
 * the common "happy path" needs no override; pass `emailVerifiedAt: null` for
 * the unverified cases.
 *
 * @param overrides - Partial account fields to override the defaults.
 * @returns A fully populated developer-account DTO.
 */
function makeAccount(overrides: Partial<DeveloperAccount> = {}): DeveloperAccount {
  return {
    id: "dev-acc-1",
    email: "dev@example.com",
    emailVerifiedAt: 1_700_000_000_000,
    passwordHash: null,
    displayName: null,
    avatarUrl: null,
    plan: "free",
    status: "active",
    createdAt: 1_699_000_000_000,
    updatedAt: 1_699_000_000_000,
    lastLoginAt: null,
    ...overrides,
  };
}

/**
 * Builds a still-claimable {@link DeveloperEmailToken} DTO for verify/reset
 * redemption tests.
 *
 * @param overrides - Partial token fields to override the defaults.
 * @returns A fully populated email-token DTO.
 */
function makeToken(overrides: Partial<DeveloperEmailToken> = {}): DeveloperEmailToken {
  return {
    id: "tok-1",
    accountId: "dev-acc-1",
    purpose: "verify",
    tokenHash: "hash",
    expiresAt: Date.now() + 60_000,
    consumedAt: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a fully-stubbed {@link DeveloperRepository} where every method is a
 * `vi.fn()`. Tests override only the calls relevant to the scenario; the
 * defaults resolve to benign "not found"/no-op values so an unconfigured call
 * never throws.
 *
 * @returns A repository whose methods are all spies, typed as a real
 *   `DeveloperRepository` so it satisfies the consumers.
 */
function makeRepo(): DeveloperRepository {
  return {
    createDeveloperAccount: vi.fn(async () => makeAccount()),
    findDeveloperAccountById: vi.fn(async () => null),
    findDeveloperAccountByEmail: vi.fn(async () => null),
    markDeveloperEmailVerified: vi.fn(async () => makeAccount()),
    updateDeveloperLastLogin: vi.fn(async () => undefined),
    setDeveloperPassword: vi.fn(async () => makeAccount()),
    createDeveloperIdentity: vi.fn(async () => ({
      id: "id-1",
      accountId: "dev-acc-1",
      provider: "email",
      providerUserId: null,
      createdAt: Date.now(),
    })),
    findDeveloperIdentity: vi.fn(async () => null),
    createDeveloperEmailToken: vi.fn(async () => makeToken()),
    findActiveDeveloperEmailToken: vi.fn(async () => null),
    consumeDeveloperEmailToken: vi.fn(async () => true),
  };
}

/**
 * Wires a Fastify instance the same way `server.ts` does (jwt → authPlugin →
 * cookie → devAuthRoutes) so the session cookie, JWT and developer guard all
 * work against the real handlers.
 *
 * @returns The started, ready-to-inject Fastify instance.
 */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(jwt, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(cookie);
  await app.register(devAuthRoutes);
  await app.ready();
  return app;
}

/**
 * Extracts the `mc_dev_session` cookie value from an inject response's
 * `set-cookie` header(s).
 *
 * @param raw - The `set-cookie` header value(s) from `res.headers`.
 * @returns The raw cookie attribute string (name + value + attributes) for the
 *   session cookie, or `undefined` if it was not set.
 */
function findSessionSetCookie(raw: string | string[] | undefined): string | undefined {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
}

let repo: DeveloperRepository;

beforeEach(() => {
  vi.clearAllMocks();
  // The credential RateLimiter is module-scoped in developer-auth.ts and shared
  // across these tests; disable it so repeated login / request-reset calls from
  // the same loopback IP are not throttled mid-suite.
  vi.stubEnv("DISABLE_RATE_LIMIT", "true");
  repo = makeRepo();
  vi.mocked(getDeveloperRepository).mockResolvedValue(repo);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/dev/auth/signup", () => {
  it("creates an account, returns 201 without passwordHash, and sends one verification email", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "new@example.com", password: VALID_PASSWORD, displayName: "New Dev" },
    });

    expect(res.statusCode).toBe(201);
    const account = res.json().account;
    expect(account.id).toBe("dev-acc-1");
    expect(account).not.toHaveProperty("passwordHash");
    expect(account).not.toHaveProperty("status");
    expect(vi.mocked(sendDeveloperVerificationEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repo.createDeveloperIdentity)).toHaveBeenCalledWith({
      accountId: "dev-acc-1",
      provider: "email",
    });
  });

  it("normalizes the email to lowercase before persisting", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "MixedCase@Example.COM", password: VALID_PASSWORD },
    });

    expect(vi.mocked(repo.findDeveloperAccountByEmail)).toHaveBeenCalledWith("mixedcase@example.com");
    const createArg = vi.mocked(repo.createDeveloperAccount).mock.calls[0]![0];
    expect(createArg.email).toBe("mixedcase@example.com");
  });

  it("returns 409 EMAIL_TAKEN when an account already exists", async () => {
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(makeAccount());
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "dev@example.com", password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("EMAIL_TAKEN");
    expect(vi.mocked(repo.createDeveloperAccount)).not.toHaveBeenCalled();
    expect(vi.mocked(sendDeveloperVerificationEmail)).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_REQUEST when required fields are missing", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "dev@example.com" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("INVALID_REQUEST");
  });

  it("returns 400 INVALID_REQUEST when the password is too short", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "dev@example.com", password: "short" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("INVALID_REQUEST");
  });
});

describe("POST /api/dev/auth/verify-email", () => {
  it("marks the email verified and consumes the token on a valid token", async () => {
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValueOnce(makeToken({ purpose: "verify" }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.verifyEmail,
      payload: { token: "raw-verify-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    // The route looks the token up by its SHA-256 hash, not the raw value.
    expect(vi.mocked(repo.findActiveDeveloperEmailToken)).toHaveBeenCalledWith(
      hashEmailToken("raw-verify-token"),
      "verify",
    );
    expect(vi.mocked(repo.markDeveloperEmailVerified)).toHaveBeenCalledWith("dev-acc-1");
    expect(vi.mocked(repo.consumeDeveloperEmailToken)).toHaveBeenCalledWith("tok-1");
  });

  it("returns 400 INVALID_TOKEN for an unknown or expired token", async () => {
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.verifyEmail,
      payload: { token: "stale" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("INVALID_TOKEN");
    expect(vi.mocked(repo.markDeveloperEmailVerified)).not.toHaveBeenCalled();
  });
});

describe("POST /api/dev/auth/login", () => {
  it("logs in a verified account, sets an httpOnly session cookie and records last login", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(makeAccount({ passwordHash }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.login,
      payload: { email: "dev@example.com", password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().account.id).toBe("dev-acc-1");

    const setCookie = findSessionSetCookie(res.headers["set-cookie"]);
    expect(setCookie).toBeDefined();
    expect(setCookie!.toLowerCase()).toContain("httponly");
    // Cookie carries an actual token, not an empty value.
    expect(setCookie).not.toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));

    // updateDeveloperLastLogin is fire-and-forget; it should still be invoked.
    expect(vi.mocked(repo.updateDeveloperLastLogin)).toHaveBeenCalledWith("dev-acc-1");
  });

  it("returns 401 INVALID_CREDENTIALS for a wrong password (no cookie set)", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(makeAccount({ passwordHash }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.login,
      payload: { email: "dev@example.com", password: "wrong-password" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("INVALID_CREDENTIALS");
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeUndefined();
  });

  it("returns 401 INVALID_CREDENTIALS for an unknown email without leaking existence", async () => {
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.login,
      payload: { email: "nobody@example.com", password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("INVALID_CREDENTIALS");
  });

  it("returns 403 EMAIL_NOT_VERIFIED for a correct password on an unverified account", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(
      makeAccount({ passwordHash, emailVerifiedAt: null }),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.login,
      payload: { email: "dev@example.com", password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("EMAIL_NOT_VERIFIED");
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeUndefined();
  });
});

describe("POST /api/dev/auth/request-reset", () => {
  it("returns 200 and sends a reset email for a known account", async () => {
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(makeAccount());
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.requestReset,
      payload: { email: "dev@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(sendDeveloperPasswordResetEmail)).toHaveBeenCalledTimes(1);
  });

  it("returns 200 without sending email for an unknown account (no enumeration)", async () => {
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.requestReset,
      payload: { email: "nobody@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(sendDeveloperPasswordResetEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(repo.createDeveloperEmailToken)).not.toHaveBeenCalled();
  });
});

describe("POST /api/dev/auth/reset-password", () => {
  it("sets the new password and consumes the token on a valid token", async () => {
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValueOnce(makeToken({ purpose: "reset" }));
    vi.mocked(repo.setDeveloperPassword).mockResolvedValueOnce(makeAccount());
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.resetPassword,
      payload: { token: "raw-reset-token", password: "a-brand-new-password" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(vi.mocked(repo.findActiveDeveloperEmailToken)).toHaveBeenCalledWith(
      hashEmailToken("raw-reset-token"),
      "reset",
    );
    expect(vi.mocked(repo.setDeveloperPassword)).toHaveBeenCalledWith("dev-acc-1", expect.any(String));
    expect(vi.mocked(repo.consumeDeveloperEmailToken)).toHaveBeenCalledWith("tok-1");
  });

  it("returns 400 INVALID_TOKEN for an unknown or expired token", async () => {
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.resetPassword,
      payload: { token: "stale", password: "a-brand-new-password" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("INVALID_TOKEN");
    expect(vi.mocked(repo.setDeveloperPassword)).not.toHaveBeenCalled();
  });
});

describe("POST /api/dev/auth/logout", () => {
  it("returns 200 and clears the session cookie", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: ENDPOINTS.dev.auth.logout });

    expect(res.statusCode).toBe(200);
    const setCookie = findSessionSetCookie(res.headers["set-cookie"]);
    expect(setCookie).toBeDefined();
    // A cleared cookie carries an empty value and an immediate expiry.
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
    expect(setCookie!.toLowerCase()).toMatch(/expires=|max-age=0/);
  });
});

describe("GET /api/dev/auth/me", () => {
  /**
   * Signs a session JWT and returns it as the `mc_dev_session` cookie header
   * value, mirroring what login sets. `kind` defaults to `"developer"`.
   *
   * @param app - The app whose `jwt` signer is used.
   * @param sub - The account id to embed as the `sub` claim.
   * @param kind - The `kind` claim; pass a non-developer value to assert rejection.
   * @returns A `Cookie` header string of the form `mc_dev_session=<jwt>`.
   */
  function sessionCookie(app: FastifyInstance, sub: string, kind = "developer"): string {
    const token = app.jwt.sign({ sub, kind });
    return `${SESSION_COOKIE_NAME}=${token}`;
  }

  it("returns 200 and the account for a valid developer session cookie", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: ENDPOINTS.dev.auth.me,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().account.id).toBe("dev-acc-1");
    expect(res.json().account).not.toHaveProperty("passwordHash");
  });

  it("returns 401 without a session cookie", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: ENDPOINTS.dev.auth.me });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  it("returns 401 when the session JWT has a non-developer kind", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: ENDPOINTS.dev.auth.me,
      headers: { cookie: sessionCookie(app, "dev-acc-1", "admin") },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });
});
