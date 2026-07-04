/**
 * @file Route tests for the developer-portal GitHub OAuth surface
 * (`/api/dev/auth/github/*`, MC-065). Drives the real {@link devGitHubRoutes}
 * handlers through `app.inject` against a Fastify instance wired exactly like
 * `server.ts`: `@fastify/jwt` → {@link authPlugin} → `@fastify/cookie` →
 * routes (so `app.jwt.sign`/`verify` and the `mc_dev_session` cookie behave as
 * in production).
 *
 * ## What is real vs. mocked
 *
 * - **Real:** route logic, state-JWT signing/verification, cookie set, the
 *   `GitHubOAuth` constants and `buildGitHubAuthorizeUrl` (so `start` produces
 *   a genuine authorize URL and a verifiable state).
 * - **Mocked:** the two secret-bearing GitHub HTTP calls
 *   (`exchangeGitHubCode`, `fetchGitHubProfile`) so no network is touched, and
 *   the persistence layer (`getDeveloperRepository` from `../db/index.js`) so
 *   no Postgres pool is built. Account-resolution branches are driven entirely
 *   through the stubbed repo.
 */
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { EmailAction, ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeveloperAccount, DeveloperRepository } from "../db/developer-repository.js";
import { getDeveloperRepository } from "../db/index.js";
import authPlugin from "../plugins/auth.js";
import { SESSION_COOKIE_NAME } from "../services/developer-auth.js";
import { exchangeGitHubCode, fetchGitHubProfile, GitHubOAuth } from "../services/developer-github.js";
import { triggerEmailAction } from "../services/email-actions.js";
import { devGitHubRoutes } from "./developer-github.js";

vi.mock("../services/email-actions.js", () => ({
  triggerEmailAction: vi.fn(async () => undefined),
}));

vi.mock("../db/index.js", () => ({
  getDeveloperRepository: vi.fn(),
}));

// Mock only the two secret-bearing HTTP calls; keep GitHubOAuth and the
// authorize-URL builder real so `start` mints a genuine, verifiable state and
// the route/test share the same StateKind literal.
vi.mock("../services/developer-github.js", async (importActual) => {
  const actual = await importActual<typeof import("../services/developer-github.js")>();
  return {
    ...actual,
    exchangeGitHubCode: vi.fn(),
    fetchGitHubProfile: vi.fn(),
  };
});

/** JWT secret used to sign/verify state + session tokens in these tests. */
const TEST_JWT_SECRET = "test-developer-github-secret-key-do-not-use-in-prod";

/**
 * Builds a complete {@link DeveloperAccount} DTO with verified-account
 * defaults that any test can override field-by-field.
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
 * Builds a normalized GitHub profile (as {@link fetchGitHubProfile} would
 * return) with a verified primary email by default.
 *
 * @param overrides - Partial profile fields to override the defaults.
 * @returns A GitHub profile object for the exchange flow.
 */
function makeProfile(overrides: Partial<Awaited<ReturnType<typeof fetchGitHubProfile>>> = {}) {
  return {
    id: "gh-42",
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "https://avatars.example/octocat.png",
    email: "octo@example.com",
    ...overrides,
  };
}

/**
 * Creates a fully-stubbed {@link DeveloperRepository} where every method is a
 * `vi.fn()`. Tests override only the calls relevant to the scenario; the
 * defaults resolve to benign "not found"/no-op values.
 *
 * @returns A repository whose methods are all spies, typed as a real
 *   `DeveloperRepository`.
 */
function makeRepo(): DeveloperRepository {
  return {
    createDeveloperAccount: vi.fn(async () => makeAccount()),
    findDeveloperAccountById: vi.fn(async () => null),
    findDeveloperAccountByEmail: vi.fn(async () => null),
    markDeveloperEmailVerified: vi.fn(async () => makeAccount()),
    updateDeveloperLastLogin: vi.fn(async () => undefined),
    setDeveloperPassword: vi.fn(async () => makeAccount()),
    clearDeveloperPassword: vi.fn(async () => undefined),
    deleteDeveloperAccount: vi.fn(async () => true),
    createDeveloperIdentity: vi.fn(async () => ({
      id: "id-1",
      accountId: "dev-acc-1",
      provider: "github",
      providerUserId: "gh-42",
      createdAt: Date.now(),
    })),
    findDeveloperIdentity: vi.fn(async () => null),
    listDeveloperIdentitiesByAccount: vi.fn(async () => []),
    createDeveloperEmailToken: vi.fn(async () => ({
      id: "tok-1",
      accountId: "dev-acc-1",
      purpose: "verify",
      tokenHash: "hash",
      expiresAt: Date.now() + 60_000,
      consumedAt: null,
      createdAt: Date.now(),
    })),
    findActiveDeveloperEmailToken: vi.fn(async () => null),
    consumeDeveloperEmailToken: vi.fn(async () => true),
  };
}

/**
 * Wires a Fastify instance the same way `server.ts` does (jwt → authPlugin →
 * cookie → devGitHubRoutes).
 *
 * @returns The started, ready-to-inject Fastify instance.
 */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(jwt, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(cookie);
  await app.register(devGitHubRoutes);
  await app.ready();
  return app;
}

/**
 * Extracts the `mc_dev_session` cookie value from an inject response's
 * `set-cookie` header(s).
 *
 * @param raw - The `set-cookie` header value(s) from `res.headers`.
 * @returns The session cookie attribute string, or `undefined` if not set.
 */
function findSessionSetCookie(raw: string | string[] | undefined): string | undefined {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
}

let repo: DeveloperRepository;

beforeEach(() => {
  vi.clearAllMocks();
  // The exchange RateLimiter is module-scoped in developer-github.ts and shared
  // across these tests; disable it so repeated exchange calls from the same
  // loopback IP are not throttled mid-suite.
  vi.stubEnv("DISABLE_RATE_LIMIT", "true");
  // `start` builds a real authorize URL via the un-mocked buildGitHubAuthorizeUrl,
  // which reads these via requireEnv; stub them so it does not throw a 500.
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "client-id-123");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "client-secret-456");
  vi.stubEnv("DEVELOPER_URL", "https://developer.musiccloud.io");
  repo = makeRepo();
  vi.mocked(getDeveloperRepository).mockResolvedValue(repo);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/dev/auth/github/start", () => {
  it("returns the authorize URL and a verifiable state JWT", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: ENDPOINTS.dev.auth.github.start });

    expect(res.statusCode).toBe(200);
    const { authorizeUrl, state } = res.json() as { authorizeUrl: string; state: string };
    expect(authorizeUrl).toContain("github.com/login/oauth/authorize");
    expect(authorizeUrl).toContain(`state=${state}`);

    // The state is a real JWT signed by the app, carrying the OAuth state kind.
    const payload = app.jwt.verify(state) as { kind?: string };
    expect(payload.kind).toBe(GitHubOAuth.StateKind);
  });
});

describe("POST /api/dev/auth/github/exchange", () => {
  /**
   * Signs a state JWT the same way `start` does. `kind` defaults to the valid
   * OAuth state kind; pass a different value to assert rejection.
   *
   * @param app - The app whose `jwt` signer is used.
   * @param kind - The `kind` claim to stamp.
   * @returns A signed state JWT string.
   */
  function signState(app: FastifyInstance, kind: string = GitHubOAuth.StateKind): string {
    return app.jwt.sign({ nonce: "n", kind }, { expiresIn: "10m" });
  }

  it("returns 400 INVALID_REQUEST when code or state is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("INVALID_REQUEST");
  });

  it("returns 401 INVALID_STATE for an unparseable state", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: "garbage" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("INVALID_STATE");
    expect(vi.mocked(exchangeGitHubCode)).not.toHaveBeenCalled();
  });

  it("returns 401 INVALID_STATE for a JWT signed with the wrong kind", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: signState(app, "not-oauth-state") },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("INVALID_STATE");
    expect(vi.mocked(exchangeGitHubCode)).not.toHaveBeenCalled();
  });

  it("returns 502 GITHUB_ERROR when the code exchange throws", async () => {
    vi.mocked(exchangeGitHubCode).mockRejectedValueOnce(new Error("token exchange failed (401)"));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: signState(app) },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("GITHUB_ERROR");
  });

  it("logs in a returning GitHub user (identity already linked) and sets the session cookie", async () => {
    vi.mocked(exchangeGitHubCode).mockResolvedValueOnce("gho_token");
    vi.mocked(fetchGitHubProfile).mockResolvedValueOnce(makeProfile());
    vi.mocked(repo.findDeveloperIdentity).mockResolvedValueOnce({
      id: "id-1",
      accountId: "dev-acc-1",
      provider: "github",
      providerUserId: "gh-42",
      createdAt: Date.now(),
    });
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValueOnce(makeAccount());

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: signState(app) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().account.id).toBe("dev-acc-1");
    expect(res.json().account).not.toHaveProperty("passwordHash");

    const setCookie = findSessionSetCookie(res.headers["set-cookie"]);
    expect(setCookie).toBeDefined();
    expect(setCookie!.toLowerCase()).toContain("httponly");

    // A returning user is neither created nor newly linked.
    expect(vi.mocked(repo.createDeveloperAccount)).not.toHaveBeenCalled();
    expect(vi.mocked(repo.createDeveloperIdentity)).not.toHaveBeenCalled();
    expect(vi.mocked(repo.updateDeveloperLastLogin)).toHaveBeenCalledWith("dev-acc-1");
  });

  it("links GitHub to an UNVERIFIED email account, clears its password and marks it verified", async () => {
    vi.mocked(exchangeGitHubCode).mockResolvedValueOnce("gho_token");
    vi.mocked(fetchGitHubProfile).mockResolvedValueOnce(makeProfile({ email: "Existing@Example.com" }));
    // No linked identity yet, but an (unverified) email account exists.
    vi.mocked(repo.findDeveloperIdentity).mockResolvedValueOnce(null);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(
      makeAccount({ id: "dev-acc-2", email: "existing@example.com", emailVerifiedAt: null }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: signState(app) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().account.id).toBe("dev-acc-2");

    // Email is normalized to lowercase before lookup.
    expect(vi.mocked(repo.findDeveloperAccountByEmail)).toHaveBeenCalledWith("existing@example.com");
    expect(vi.mocked(repo.createDeveloperIdentity)).toHaveBeenCalledWith({
      accountId: "dev-acc-2",
      provider: "github",
      providerUserId: "gh-42",
    });
    // Unverified → the unproven password is discarded and the email is verified.
    expect(vi.mocked(repo.clearDeveloperPassword)).toHaveBeenCalledWith("dev-acc-2");
    expect(vi.mocked(repo.markDeveloperEmailVerified)).toHaveBeenCalledWith("dev-acc-2");
    expect(vi.mocked(repo.createDeveloperAccount)).not.toHaveBeenCalled();
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeDefined();
  });

  it("links GitHub to an ALREADY-VERIFIED email account without clearing its password or re-verifying", async () => {
    vi.mocked(exchangeGitHubCode).mockResolvedValueOnce("gho_token");
    vi.mocked(fetchGitHubProfile).mockResolvedValueOnce(makeProfile({ email: "verified@example.com" }));
    // No linked identity yet, but a VERIFIED email account (with a legitimately
    // set password) exists — a genuine second account of the same person.
    vi.mocked(repo.findDeveloperIdentity).mockResolvedValueOnce(null);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(
      makeAccount({
        id: "dev-acc-3",
        email: "verified@example.com",
        emailVerifiedAt: 1_700_000_000_000,
        passwordHash: "$2b$bcrypt-hash",
      }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: signState(app) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().account.id).toBe("dev-acc-3");

    // Identity is attached and a session is issued …
    expect(vi.mocked(repo.createDeveloperIdentity)).toHaveBeenCalledWith({
      accountId: "dev-acc-3",
      provider: "github",
      providerUserId: "gh-42",
    });
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeDefined();
    // … but the legitimately-set password and verification state stay untouched.
    expect(vi.mocked(repo.clearDeveloperPassword)).not.toHaveBeenCalled();
    expect(vi.mocked(repo.markDeveloperEmailVerified)).not.toHaveBeenCalled();
    expect(vi.mocked(repo.createDeveloperAccount)).not.toHaveBeenCalled();
  });

  it("creates a new OAuth-only account (no password) when the email is unknown", async () => {
    vi.mocked(exchangeGitHubCode).mockResolvedValueOnce("gho_token");
    vi.mocked(fetchGitHubProfile).mockResolvedValueOnce(makeProfile({ email: "fresh@example.com" }));
    vi.mocked(repo.findDeveloperIdentity).mockResolvedValueOnce(null);
    vi.mocked(repo.findDeveloperAccountByEmail).mockResolvedValueOnce(null);
    vi.mocked(repo.createDeveloperAccount).mockResolvedValueOnce(makeAccount({ id: "dev-acc-new" }));

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: signState(app) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().account.id).toBe("dev-acc-new");

    const createArg = vi.mocked(repo.createDeveloperAccount).mock.calls[0]![0];
    expect(createArg.email).toBe("fresh@example.com");
    expect(createArg.displayName).toBe("The Octocat");
    expect(createArg).not.toHaveProperty("passwordHash");
    expect(vi.mocked(repo.createDeveloperIdentity)).toHaveBeenCalledWith({
      accountId: "dev-acc-new",
      provider: "github",
      providerUserId: "gh-42",
    });
    expect(vi.mocked(repo.markDeveloperEmailVerified)).toHaveBeenCalledWith("dev-acc-new");
    expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledWith(
      EmailAction.DeveloperAccountCreated,
      expect.objectContaining({ to: { email: "dev@example.com" } }),
    );
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeDefined();
  });

  it("returns 422 NO_VERIFIED_EMAIL when GitHub reports no verified primary email", async () => {
    vi.mocked(exchangeGitHubCode).mockResolvedValueOnce("gho_token");
    vi.mocked(fetchGitHubProfile).mockResolvedValueOnce(makeProfile({ email: null }));
    vi.mocked(repo.findDeveloperIdentity).mockResolvedValueOnce(null);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: signState(app) },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("NO_VERIFIED_EMAIL");
    expect(vi.mocked(repo.createDeveloperAccount)).not.toHaveBeenCalled();
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeUndefined();
  });

  it("returns 403 ACCOUNT_SUSPENDED for a suspended account and sets no session cookie", async () => {
    vi.mocked(exchangeGitHubCode).mockResolvedValueOnce("gho_token");
    vi.mocked(fetchGitHubProfile).mockResolvedValueOnce(makeProfile());
    // Returning user whose linked account has since been suspended.
    vi.mocked(repo.findDeveloperIdentity).mockResolvedValueOnce({
      id: "id-1",
      accountId: "dev-acc-9",
      provider: "github",
      providerUserId: "gh-42",
      createdAt: Date.now(),
    });
    vi.mocked(repo.findDeveloperAccountById).mockResolvedValueOnce(
      makeAccount({ id: "dev-acc-9", status: "suspended" }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.dev.auth.github.exchange,
      payload: { code: "c", state: signState(app) },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("ACCOUNT_SUSPENDED");
    expect(findSessionSetCookie(res.headers["set-cookie"])).toBeUndefined();
    // No session-side effects for a suspended account.
    expect(vi.mocked(repo.updateDeveloperLastLogin)).not.toHaveBeenCalled();
  });
});
