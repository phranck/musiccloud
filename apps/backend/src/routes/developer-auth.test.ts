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
 *   emails (`../services/email-actions.js` triggerEmailAction) so nothing is sent and the
 *   SMTP2GO provider is never touched. Both the guard and the routes import
 *   `getDeveloperRepository` from the same module, so one mock covers both.
 *
 * The mocked repository ({@link makeRepo}) returns a fresh, per-test-configurable
 * stub: each test wires only the methods it needs (e.g. `findByEmail` resolving
 * to `null`, a verified, or an unverified account).
 */

import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { EmailAction, EmailRecipientKind, ENDPOINTS, MAX_DISPLAY_NAME_LENGTH } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeveloperAccount, DeveloperEmailToken, DeveloperRepository } from "../db/developer-repository.js";
import { getDeveloperRepository, getTierRepository } from "../db/index.js";
import type { Tier, TierRepository } from "../db/tiers-repository.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import authPlugin from "../plugins/auth.js";
import { hashEmailToken, hashPassword, SESSION_COOKIE_NAME } from "../services/developer-auth.js";
import { triggerEmailAction } from "../services/email-actions.js";
import { erasePersonalData } from "../services/gdpr-erase.js";
import { buildPersonalDataExport } from "../services/gdpr-export.js";
import { devAuthRoutes } from "./developer-auth.js";

vi.mock("../db/index.js", () => ({
  getDeveloperRepository: vi.fn(),
  getTierRepository: vi.fn(),
}));

vi.mock("../services/email-actions.js", () => ({
  triggerEmailAction: vi.fn(async () => undefined),
}));

vi.mock("../services/gdpr-erase.js", () => ({
  erasePersonalData: vi.fn(async () => ({ accountDeleted: true })),
}));

vi.mock("../services/gdpr-export.js", () => ({
  buildPersonalDataExport: vi.fn(async () => ({
    version: 1,
    exportedAt: "2026-07-04T00:00:00.000Z",
    subject: { developerAccountId: "dev-acc-1", email: "dev@example.com" },
  })),
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
    firstName: null,
    lastName: null,
    uploadedAvatarUrl: null,
    gravatarUrl: null,
    avatarSource: null,
    avatarUrl: null,
    technicalContactEmail: null,
    pendingEmail: null,
    pendingEmailRequestedAt: null,
    tierId: null,
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
    listDeveloperAccounts: vi.fn(async () => []),
    markDeveloperEmailVerified: vi.fn(async () => makeAccount()),
    updateDeveloperLastLogin: vi.fn(async () => undefined),
    setDeveloperPassword: vi.fn(async () => makeAccount()),
    clearDeveloperPassword: vi.fn(async () => undefined),
    deleteDeveloperAccount: vi.fn(async () => true),
    createDeveloperIdentity: vi.fn(async () => ({
      id: "id-1",
      accountId: "dev-acc-1",
      provider: "email",
      providerUserId: null,
      createdAt: Date.now(),
    })),
    findDeveloperIdentity: vi.fn(async () => null),
    listDeveloperIdentitiesByAccount: vi.fn(async () => []),
    createDeveloperEmailToken: vi.fn(async () => makeToken()),
    findActiveDeveloperEmailToken: vi.fn(async () => null),
    consumeDeveloperEmailToken: vi.fn(async () => true),
    updateDeveloperAccount: vi.fn(async () => null),
  };
}

/**
 * Wires a Fastify instance the same way `server.ts` does (jwt → authPlugin →
 * cookie → error handling → devAuthRoutes) so the session cookie, JWT and
 * developer guard all work against the real handlers.
 *
 * {@link registerApiErrorHandling} belongs in that list because it rewrites
 * every failure response: a code outside the `MC-` scheme is replaced with the
 * one that matches the status, and the code is appended to the message. A test
 * app without it asserts an envelope no client ever receives.
 *
 * @returns The started, ready-to-inject Fastify instance.
 */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(jwt, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(cookie);
  registerApiErrorHandling(app);
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

let repo: DeveloperRepository;

beforeEach(() => {
  vi.clearAllMocks();
  // The credential RateLimiter is module-scoped in developer-auth.ts and shared
  // across these tests; disable it so repeated login / request-reset calls from
  // the same loopback IP are not throttled mid-suite.
  vi.stubEnv("DISABLE_RATE_LIMIT", "true");
  // The routes build verify/reset context URLs from DEVELOPER_URL themselves
  // (the mail send is fully mocked via triggerEmailAction).
  vi.stubEnv("DEVELOPER_URL", "https://developer.musiccloud.example");
  repo = makeRepo();
  vi.mocked(getDeveloperRepository).mockResolvedValue(repo);
  vi.mocked(getTierRepository).mockResolvedValue({ listTiers: vi.fn(async () => []) } as unknown as TierRepository);
});

/**
 * Builds a complete {@link Tier} DTO (enabled by default) that tests can
 * override field-by-field — used by the signup tier-pre-selection cases.
 *
 * @param overrides - Partial tier fields to override the defaults.
 * @returns A fully populated tier DTO.
 */
function makeTier(overrides: Partial<Tier> = {}): Tier {
  return {
    id: "tier-pro",
    name: "Pro",
    requestsPerMinute: 120,
    requestsPerDay: 50000,
    attributionRequired: false,
    price: null,
    priceYearly: null,
    color: "#3b82f6",
    icon: null,
    buttonLabel: null,
    description: "",
    enabled: true,
    disableReason: "",
    recommended: false,
    sortOrder: 1,
    features: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

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
    expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledTimes(2);
    const [actionKey, input] = vi.mocked(triggerEmailAction).mock.calls[0]!;
    expect(actionKey).toBe(EmailAction.DeveloperVerificationRequested);
    expect(vi.mocked(triggerEmailAction).mock.calls[1]![0]).toBe(EmailAction.DeveloperAccountCreated);
    // The repo stub's createDeveloperAccount always returns makeAccount()
    // (email dev@example.com); the route correctly addresses the CREATED
    // account's canonical email, not the raw payload value.
    expect(input.to).toEqual({ email: "dev@example.com" });
    expect(input.recipient).toEqual({
      kind: EmailRecipientKind.DeveloperAccount,
      email: "dev@example.com",
      displayName: null,
    });
    expect(input.context.verifyUrl).toMatch(/^https:\/\/developer\.musiccloud\.example\/verify\?token=.+/);
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

  it("refuses an address that already has an account", async () => {
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(makeAccount());
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "dev@example.com", password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("MC-REQ-0007");
    expect(vi.mocked(repo.createDeveloperAccount)).not.toHaveBeenCalled();
    expect(vi.mocked(triggerEmailAction)).not.toHaveBeenCalled();
  });

  it("refuses a body without the required fields", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "dev@example.com" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0001");
  });

  it("refuses a password shorter than the minimum", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "dev@example.com", password: "short" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0001");
  });

  it("refuses an address that cannot be one, before anything is created", async () => {
    const app = await buildApp();

    for (const candidate of ["not-an-address", "dev@", "@example.com", "dev@example", "dev @example.com"]) {
      const res = await app.inject({
        method: "POST",
        url: ENDPOINTS.dev.auth.signup,
        payload: { email: candidate, password: VALID_PASSWORD },
      });

      expect(res.statusCode, candidate).toBe(400);
      expect(res.json().error, candidate).toBe("MC-REQ-0006");
    }
    expect(vi.mocked(repo.createDeveloperAccount)).not.toHaveBeenCalled();
    expect(vi.mocked(triggerEmailAction)).not.toHaveBeenCalled();
  });

  it("refuses an address longer than SMTP carries", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: `${"a".repeat(250)}@example.com`, password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0006");
    expect(vi.mocked(repo.createDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("refuses a malformed address without saying whether an account exists", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "not-an-address", password: VALID_PASSWORD },
    });

    expect(res.json().message).toBe("This is not a valid email address. (MC-REQ-0006)");
    expect(vi.mocked(repo.findDeveloperAccountByEmail)).not.toHaveBeenCalled();
  });

  it("assigns tier_free when a paid tier is requested (Plan A: only free tier is assignable)", async () => {
    // Plan A: resolveSignupTierId only allows tier_free. A paid tier request
    // falls back to tier_free so no tier can be granted for free.
    vi.mocked(getTierRepository).mockResolvedValue({
      listTiers: vi.fn(async () => [makeTier({ id: "tier_free", name: "Free" }), makeTier()]),
    } as unknown as TierRepository);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "new@example.com", password: VALID_PASSWORD, tierId: "tier-pro" },
    });

    expect(res.statusCode).toBe(201);
    const createArg = vi.mocked(repo.createDeveloperAccount).mock.calls[0]![0];
    expect(createArg.tierId).toBe("tier_free");
  });

  it("falls back to tier_free when the requested tierId is unknown (resolver guarantees non-null)", async () => {
    vi.mocked(getTierRepository).mockResolvedValue({
      listTiers: vi.fn(async () => [makeTier({ id: "tier_free", name: "Free" })]),
    } as unknown as TierRepository);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "new@example.com", password: VALID_PASSWORD, tierId: "tier-unknown" },
    });

    expect(res.statusCode).toBe(201);
    const createArg = vi.mocked(repo.createDeveloperAccount).mock.calls[0]![0];
    expect(createArg.tierId).toBe("tier_free");
  });

  it("assigns tier_free when no tierId is provided in the request body", async () => {
    vi.mocked(getTierRepository).mockResolvedValue({
      listTiers: vi.fn(async () => [makeTier({ id: "tier_free", name: "Free" })]),
    } as unknown as TierRepository);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.signup,
      payload: { email: "new@example.com", password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(201);
    const createArg = vi.mocked(repo.createDeveloperAccount).mock.calls[0]![0];
    expect(createArg.tierId).toBe("tier_free");
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

  it("refuses an unknown or expired token", async () => {
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.verifyEmail,
      payload: { token: "stale" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0001");
    expect(vi.mocked(repo.markDeveloperEmailVerified)).not.toHaveBeenCalled();
  });

  it("does not verify when the consume races and loses", async () => {
    // Claim-then-act: the token is found, but a concurrent request already
    // consumed it, so the atomic consume returns false. The effect must not run.
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValueOnce(makeToken({ purpose: "verify" }));
    vi.mocked(repo.consumeDeveloperEmailToken).mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.verifyEmail,
      payload: { token: "raced-verify-token" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0001");
    expect(vi.mocked(repo.consumeDeveloperEmailToken)).toHaveBeenCalledWith("tok-1");
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

  it("refuses a wrong password without setting a cookie", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(makeAccount({ passwordHash }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.login,
      payload: { email: "dev@example.com", password: "wrong-password" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("MC-AUTH-0001");
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeUndefined();
  });

  it("refuses an unknown email without leaking existence", async () => {
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.login,
      payload: { email: "nobody@example.com", password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("MC-AUTH-0001");
  });

  it("refuses a correct password on an account whose email is unverified", async () => {
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
    expect(res.json().error).toBe("MC-AUTH-0002");
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
    expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledTimes(1);
    const [actionKey, input] = vi.mocked(triggerEmailAction).mock.calls[0]!;
    expect(actionKey).toBe(EmailAction.DeveloperPasswordResetRequested);
    expect(input.recipient).toEqual({
      kind: EmailRecipientKind.DeveloperAccount,
      email: "dev@example.com",
      displayName: null,
    });
    expect(input.context.resetUrl).toMatch(/^https:\/\/developer\.musiccloud\.example\/reset\?token=.+/);
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
    expect(vi.mocked(triggerEmailAction)).not.toHaveBeenCalled();
    expect(vi.mocked(repo.createDeveloperEmailToken)).not.toHaveBeenCalled();
  });

  it("refuses an address that cannot be one, which leaks nothing because no account can hold it", async () => {
    const app = await buildApp();

    for (const candidate of ["not-an-address", "dev@", `${"a".repeat(250)}@example.com`]) {
      const res = await app.inject({
        method: "POST",
        url: ENDPOINTS.dev.auth.requestReset,
        payload: { email: candidate },
      });

      expect(res.statusCode, candidate).toBe(400);
      expect(res.json().error, candidate).toBe("MC-REQ-0006");
    }
    expect(vi.mocked(repo.findDeveloperAccountByEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(triggerEmailAction)).not.toHaveBeenCalled();
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

  it("refuses an unknown or expired token", async () => {
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.resetPassword,
      payload: { token: "stale", password: "a-brand-new-password" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0001");
    expect(vi.mocked(repo.setDeveloperPassword)).not.toHaveBeenCalled();
  });

  it("does not set the password when the consume races and loses", async () => {
    // Claim-then-act guards a real replay window here: without consuming first,
    // two concurrent requests could each set a different password. A lost race
    // (consume → false) must leave the password untouched.
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValueOnce(makeToken({ purpose: "reset" }));
    vi.mocked(repo.consumeDeveloperEmailToken).mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.resetPassword,
      payload: { token: "raced-reset-token", password: "a-brand-new-password" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0001");
    expect(vi.mocked(repo.consumeDeveloperEmailToken)).toHaveBeenCalledWith("tok-1");
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
    expect(res.json().error).toBe("MC-AUTH-0001");
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
    expect(res.json().error).toBe("MC-AUTH-0001");
  });
});

describe("changing the address you sign in with", () => {
  const PASSWORD = "correct horse battery staple";

  async function withPassword() {
    const hash = await import("../services/developer-auth.js").then((module) => module.hashPassword(PASSWORD));
    return makeAccount({ passwordHash: hash });
  }

  it("moves nothing until the link is followed, and tells both addresses", async () => {
    const account = await withPassword();
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(account);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValue(null);
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ pendingEmail: "new@example.com" }));
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.changeEmail,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { email: "  NEW@example.com ", password: PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    // The address is pending, not moved.
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith(
      "dev-acc-1",
      expect.objectContaining({ pendingEmail: "new@example.com" }),
    );
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalledWith(
      "dev-acc-1",
      expect.objectContaining({ email: expect.anything() }),
    );

    const actions = vi.mocked(triggerEmailAction).mock.calls.map(([action]) => action);
    expect(actions).toContain(EmailAction.DeveloperEmailChangeRequested);
    expect(actions).toContain(EmailAction.DeveloperEmailChangeNotified);
    // The confirmation goes to the new address, the notice to the old one.
    const confirmation = vi
      .mocked(triggerEmailAction)
      .mock.calls.find(([action]) => action === EmailAction.DeveloperEmailChangeRequested);
    const notice = vi
      .mocked(triggerEmailAction)
      .mock.calls.find(([action]) => action === EmailAction.DeveloperEmailChangeNotified);
    expect((confirmation?.[1] as { to: { email: string } }).to.email).toBe("new@example.com");
    expect((notice?.[1] as { to: { email: string } }).to.email).toBe("dev@example.com");
  });

  it("takes the request back when the confirmation cannot be sent", async () => {
    const account = await withPassword();
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(account);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValue(null);
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ pendingEmail: "new@example.com" }));
    vi.mocked(triggerEmailAction).mockRejectedValueOnce(new Error("no template bound"));
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.changeEmail,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { email: "new@example.com", password: PASSWORD },
    });

    // A pending address nobody was told about would be a link that never left
    // the building, so the request is taken back rather than left half done.
    expect(res.statusCode).toBe(503);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenLastCalledWith("dev-acc-1", {
      pendingEmail: null,
      pendingEmailRequestedAt: null,
    });
  });

  it("refuses without the password, which a borrowed session cannot supply", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(await withPassword());
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.changeEmail,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { email: "new@example.com", password: "not the password" },
    });

    expect(res.statusCode).toBe(403);
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("refuses an address somebody already holds", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(await withPassword());
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValue(makeAccount({ id: "dev-acc-2" }));
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.changeEmail,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { email: "taken@example.com", password: PASSWORD },
    });

    expect(res.statusCode).toBe(409);
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("moves the address when the link is followed, once", async () => {
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValue({
      id: "token-1",
      accountId: "dev-acc-1",
      purpose: "change-email",
      tokenHash: "hash",
      expiresAt: Date.now() + 60_000,
      consumedAt: null,
      createdAt: Date.now(),
    });
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ pendingEmail: "new@example.com" }));
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValue(null);
    vi.mocked(repo.consumeDeveloperEmailToken).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ email: "new@example.com" }));
    const app = await buildApp();

    const first = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.confirmEmailChange,
      payload: { token: "raw-token" },
    });
    const second = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.confirmEmailChange,
      payload: { token: "raw-token" },
    });

    expect(first.statusCode).toBe(200);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith("dev-acc-1", {
      email: "new@example.com",
      pendingEmail: null,
      pendingEmailRequestedAt: null,
    });
    // The claim is what stops the second one, so the address moves once.
    expect(second.statusCode).toBe(400);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledTimes(1);
  });

  it("refuses a link whose account has nothing pending", async () => {
    vi.mocked(repo.findActiveDeveloperEmailToken).mockResolvedValue({
      id: "token-1",
      accountId: "dev-acc-1",
      purpose: "change-email",
      tokenHash: "hash",
      expiresAt: Date.now() + 60_000,
      consumedAt: null,
      createdAt: Date.now(),
    });
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ pendingEmail: null }));
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.confirmEmailChange,
      payload: { token: "raw-token" },
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(repo.consumeDeveloperEmailToken)).not.toHaveBeenCalled();
  });

  it("drops a pending change when it is cancelled", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ pendingEmail: "new@example.com" }));
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount());
    const app = await buildApp();

    const res = await app.inject({
      method: "DELETE",
      url: ENDPOINTS.dev.auth.changeEmail,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith("dev-acc-1", {
      pendingEmail: null,
      pendingEmailRequestedAt: null,
    });
  });
});

describe("the account's picture", () => {
  it("stores an upload and shows it", async () => {
    const dataUrl = `data:image/png;base64,${"A".repeat(64)}`;
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(
      makeAccount({ uploadedAvatarUrl: dataUrl, avatarSource: "upload" }),
    );
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.avatar,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { dataUrl },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().account.avatarUrl).toBe(dataUrl);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith("dev-acc-1", {
      uploadedAvatarUrl: dataUrl,
      avatarSource: "upload",
    });
  });

  it("refuses an SVG, which can carry script", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.avatar,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("refuses a picture past the size cap", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.avatar,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { dataUrl: `data:image/jpeg;base64,${"A".repeat(7 * 1024 * 1024)}` },
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("removing an upload falls back to whatever else the account holds", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(
      makeAccount({
        uploadedAvatarUrl: "data:image/png;base64,AAAA",
        gravatarUrl: "https://www.gravatar.com/avatar/x",
        avatarSource: "upload",
      }),
    );
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(
      makeAccount({ gravatarUrl: "https://www.gravatar.com/avatar/x", avatarSource: null }),
    );
    const app = await buildApp();

    const res = await app.inject({
      method: "DELETE",
      url: ENDPOINTS.dev.auth.avatar,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith("dev-acc-1", {
      uploadedAvatarUrl: null,
      avatarSource: null,
    });
    // The Gravatar is what is left, so it is what is shown.
    expect(res.json().account.avatarUrl).toBe("https://www.gravatar.com/avatar/x");
  });

  it("refuses a source it does not know", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();

    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.dev.auth.profile,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { avatarSource: "somewhere-else" },
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("finds the account's picture when the address itself carries none", async () => {
    // An account holds several addresses and assigns its picture to one of
    // them. Asking only "does this address have a picture" reports no to
    // somebody who can see their own face on gravatar.com.
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ avatarSource: "gravatar" }));
    const app = await buildApp();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ entry: [{ thumbnailUrl: "https://2.gravatar.com/avatar/abc123" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.gravatar,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().found).toBe(true);
    const stored = vi.mocked(repo.updateDeveloperAccount).mock.calls.at(-1)?.[1] as { gravatarUrl?: string };
    expect(stored.gravatarUrl).toContain("https://2.gravatar.com/avatar/abc123");

    fetchMock.mockRestore();
  });

  it("refuses a profile picture hosted anywhere but Gravatar", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount());
    const app = await buildApp();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ entry: [{ thumbnailUrl: "https://evil.example/avatar/abc" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.gravatar,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
    });

    // The address comes from a third party, so it is checked before it is
    // stored and rendered.
    expect(res.json().found).toBe(false);

    fetchMock.mockRestore();
  });

  it("stores what Gravatar answers, and clears it when there is none", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ avatarSource: "gravatar" }));
    const app = await buildApp();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const found = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.gravatar,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
    });

    expect(found.statusCode).toBe(200);
    expect(found.json().found).toBe(true);
    // Only the hash reaches Gravatar, never the address itself.
    const asked = String(fetchMock.mock.calls[0]?.[0]);
    expect(asked).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/[0-9a-f]{64}\?/);
    expect(asked).not.toContain("dev@example.com");
    expect(asked).toContain("d=404");

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const missing = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.gravatar,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
    });

    expect(missing.statusCode).toBe(200);
    expect(missing.json().found).toBe(false);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenLastCalledWith("dev-acc-1", {
      gravatarUrl: null,
      avatarSource: null,
    });

    fetchMock.mockRestore();
  });
});

describe("PATCH /api/dev/auth/profile", () => {
  it("stores a trimmed technical contact address", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ technicalContactEmail: "ops@example.com" }));
    const app = await buildApp();

    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.dev.auth.profile,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { technicalContactEmail: "  ops@example.com  " },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().account.technicalContactEmail).toBe("ops@example.com");
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith("dev-acc-1", {
      technicalContactEmail: "ops@example.com",
    });
  });

  it("treats an empty value as no technical contact", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ technicalContactEmail: null }));
    const app = await buildApp();

    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.dev.auth.profile,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { technicalContactEmail: "   " },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith("dev-acc-1", {
      technicalContactEmail: null,
    });
  });

  it("stores a trimmed display name and leaves the contact address alone", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ displayName: "Ada" }));
    const app = await buildApp();

    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.dev.auth.profile,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { displayName: "  Ada  " },
    });

    expect(res.statusCode).toBe(200);
    // Only what the body carries is written, so the two screens that edit this
    // account cannot clear each other's field.
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith("dev-acc-1", { displayName: "Ada" });
  });

  it("treats an empty display name as none", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    vi.mocked(repo.updateDeveloperAccount).mockResolvedValue(makeAccount({ displayName: null }));
    const app = await buildApp();

    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.dev.auth.profile,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { displayName: "   " },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(repo.updateDeveloperAccount)).toHaveBeenCalledWith("dev-acc-1", { displayName: null });
  });

  it("refuses a display name longer than the shared limit", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();

    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.dev.auth.profile,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { displayName: "a".repeat(MAX_DISPLAY_NAME_LENGTH + 1) },
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("refuses a value that cannot be an address", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();

    for (const candidate of ["ops", "ops@", "@example.com", "ops@example", "ops @example.com"]) {
      const res = await app.inject({
        method: "PATCH",
        url: ENDPOINTS.dev.auth.profile,
        headers: { cookie: sessionCookie(app, "dev-acc-1") },
        payload: { technicalContactEmail: candidate },
      });
      expect(res.statusCode, candidate).toBe(400);
    }
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("refuses an address longer than SMTP carries", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();

    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.dev.auth.profile,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { technicalContactEmail: `${"a".repeat(250)}@example.com` },
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(repo.updateDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("refuses without a session cookie", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.dev.auth.profile,
      payload: { technicalContactEmail: "ops@example.com" },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/dev/auth/export", () => {
  it("returns the caller's personal-data package as an attachment", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount());
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: ENDPOINTS.dev.auth.export,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain('attachment; filename="musiccloud-data-export.json"');
    expect(res.json().version).toBe(1);
    expect(vi.mocked(buildPersonalDataExport)).toHaveBeenCalledWith({
      developerAccountId: "dev-acc-1",
      email: "dev@example.com",
    });
  });

  it("requires an authenticated session", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: ENDPOINTS.dev.auth.export });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/dev/auth/delete-account", () => {
  it("triggers the optional account-deleted notification for the account being removed", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ passwordHash }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.deleteAccount,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledTimes(1);
    const [actionKey, input] = vi.mocked(triggerEmailAction).mock.calls[0]!;
    expect(actionKey).toBe(EmailAction.DeveloperAccountDeleted);
    expect(input.to).toEqual({ email: "dev@example.com" });
    expect(input.recipient).toEqual({
      kind: EmailRecipientKind.DeveloperAccount,
      email: "dev@example.com",
      displayName: null,
    });
    expect(input.context).toEqual({});
  });

  it("does not fail the deletion when the notification trigger throws", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ passwordHash }));
    vi.mocked(triggerEmailAction).mockRejectedValueOnce(new Error("smtp down"));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.deleteAccount,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(erasePersonalData)).toHaveBeenCalled();
  });

  it("deletes the account, clears the session cookie and returns ok on a correct password", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ passwordHash }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.deleteAccount,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { password: VALID_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(vi.mocked(erasePersonalData)).toHaveBeenCalledWith("dev-acc-1");
    const setCookie = findSessionSetCookie(res.headers["set-cookie"]);
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
  });

  it("returns 401 INVALID_CREDENTIALS and does not delete on a wrong password", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ passwordHash }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.deleteAccount,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: { password: "wrong-password" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("MC-AUTH-0001");
    expect(vi.mocked(erasePersonalData)).not.toHaveBeenCalled();
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeUndefined();
  });

  it("returns 401 INVALID_CREDENTIALS and does not delete when the password is omitted", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ passwordHash }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.deleteAccount,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("MC-AUTH-0001");
    expect(vi.mocked(erasePersonalData)).not.toHaveBeenCalled();
  });

  it("deletes a GitHub-only account (no password set) without requiring a password", async () => {
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValue(makeAccount({ passwordHash: null }));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.deleteAccount,
      headers: { cookie: sessionCookie(app, "dev-acc-1") },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(vi.mocked(erasePersonalData)).toHaveBeenCalledWith("dev-acc-1");
  });

  it("returns 401 without a session cookie", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: ENDPOINTS.dev.auth.deleteAccount, payload: {} });

    expect(res.statusCode).toBe(401);
    expect(vi.mocked(erasePersonalData)).not.toHaveBeenCalled();
  });
});
