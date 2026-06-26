/**
 * @file Email/password authentication for the external developer portal
 * (developer.musiccloud.io, MC-064). Registered unauthenticated at the root
 * scope in `server.ts`, because these endpoints are how a developer creates an
 * account and obtains a session in the first place. The one authenticated
 * route (`/me`) attaches the {@link FastifyInstance.authenticateDeveloper}
 * guard inline as a `preHandler`.
 *
 * ## Why a separate surface from admin-auth
 *
 * Developer accounts are self-service portal users, not dashboard
 * administrators: a distinct account table, a distinct lifecycle (email
 * verification, self-service password reset) and a distinct session transport.
 * Where the admin dashboard carries its JWT in an `Authorization: Bearer`
 * header, the portal session is an **httpOnly `mc_dev_session` cookie** (set
 * here on login, cleared on logout), so the browser ships it automatically and
 * no token is exposed to portal JavaScript.
 *
 * ## Session JWT
 *
 * Login signs `{ sub: accountId, kind: "developer" }` with a 7-day lifetime
 * (matched by the cookie's `maxAge`, see {@link sessionCookieOptions}). The
 * `kind` claim lets {@link FastifyInstance.authenticateDeveloper} reject an
 * admin token that happens to be presented in the cookie.
 *
 * ## Timing-attack protection
 *
 * Login does not branch on account existence before hashing: {@link verifyPassword}
 * always pays the bcrypt cost (against a dummy hash when no account/credential
 * exists), so response latency cannot be used to enumerate registered emails.
 * `request-reset` likewise always returns `200`, never revealing whether an
 * address has an account.
 *
 * ## Single-use email tokens
 *
 * Verification and reset links carry a raw token whose SHA-256 hash is the only
 * value persisted (see {@link generateEmailToken}). Redemption re-hashes the
 * incoming token, looks up a still-claimable row, and consumes it so it cannot
 * be replayed.
 *
 * ## Brute-force throttle
 *
 * `/login` and `/request-reset` share a dedicated per-IP {@link RateLimiter}
 * ({@link credentialRateLimiter}) — deliberately NOT the global `apiRateLimiter`
 * bucket used by the public resolve/share surface, so portal credential traffic
 * is throttled on its own budget without coupling to public-API limits.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DeveloperAccount } from "../db/developer-repository.js";
import { getDeveloperRepository } from "../db/index.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { RateLimiter } from "../lib/infra/rate-limiter.js";
import {
  AuthProvider,
  clearedSessionCookieOptions,
  generateEmailToken,
  hashEmailToken,
  hashPassword,
  SESSION_COOKIE_NAME,
  SessionKind,
  sessionCookieOptions,
  TokenPurpose,
  verifyPassword,
} from "../services/developer-auth.js";
import { sendDeveloperPasswordResetEmail, sendDeveloperVerificationEmail } from "../services/developer-email.js";

/** Minimum accepted password length, matching the admin surface (admin-auth.ts). */
const PASSWORD_MIN_LENGTH = 8;

/** Maximum accepted password length, matching the admin surface (admin-auth.ts). */
const PASSWORD_MAX_LENGTH = 128;

/** Verification-token lifetime: 24 hours from issuance. */
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Password-reset-token lifetime: 1 hour from issuance. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Postgres SQLSTATE for a `unique_violation`, raised when a concurrent insert collides on a unique constraint. */
const PG_UNIQUE_VIOLATION = "23505";

/** Name of the unique constraint on `developer_accounts.email` (migration 0047). */
const EMAIL_UNIQUE_CONSTRAINT = "developer_accounts_email_unique";

/**
 * Detects whether a thrown error is the Postgres unique-violation raised when
 * two concurrent signups race past the `findByEmail` pre-check and both try to
 * insert the same email. The adapter rethrows the native `pg` error verbatim
 * (no wrapping), so its `code` is the SQLSTATE; the constraint-name check in
 * the message is a defensive fallback for drivers that surface the code
 * differently. Used by `/signup` to translate the race into the same `409`
 * the pre-check returns, rather than a `500`.
 *
 * @param error - The value caught from the account/identity insert.
 * @returns `true` when the error is a duplicate-email unique violation.
 */
function isDuplicateEmailError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === PG_UNIQUE_VIOLATION) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes(EMAIL_UNIQUE_CONSTRAINT);
}

/**
 * Dedicated per-IP throttle for credential endpoints (`/login`,
 * `/request-reset`): 10 requests per 60 seconds. Separate from the global
 * `apiRateLimiter` so portal brute-force protection has its own budget and does
 * not consume (or get consumed by) the public-API quota. Module-scoped so the
 * sliding window persists across requests for the lifetime of the process.
 */
const credentialRateLimiter = new RateLimiter(10, 60_000);

/**
 * `preHandler` that throttles credential endpoints per client IP via
 * {@link credentialRateLimiter}. On exhaustion it sends a `429` with the shared
 * rate-limit envelope and `Retry-After` header; otherwise it passes through.
 *
 * @param request - incoming request; `request.ip` is the throttle key.
 * @param reply - responds with `429` when the per-IP window is exhausted.
 */
async function throttleCredentials(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const check = credentialRateLimiter.check(request.ip);
  if (check.limited) {
    await sendRateLimitError(reply, check);
  }
}

/**
 * Shapes an internal {@link DeveloperAccount} row into the public account
 * payload returned by `/signup`, `/login` and `/me`. Centralized so the
 * endpoints cannot drift apart (the portal store assumes one shape) and so the
 * `passwordHash` field is *never* serialized to the client.
 *
 * @param account - row as returned by the developer repository.
 * @returns The wire-level account object: `emailVerifiedAt` is collapsed to the
 *   boolean `emailVerified`, and `createdAt` (epoch ms) is rendered as an ISO
 *   string for JSON-safe transport. `passwordHash`, `status`, `updatedAt` and
 *   `lastLoginAt` are intentionally omitted.
 */
export function buildAccountResponse(account: DeveloperAccount) {
  return {
    id: account.id,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    plan: account.plan,
    createdAt: new Date(account.createdAt).toISOString(),
  };
}

/**
 * Registers the developer-portal email/password auth routes (signup, verify,
 * login, request-reset, reset-password, logout, me) under `/api/dev/auth/*`.
 *
 * All routes validate their JSON body manually (mirroring `admin-auth.ts`) and
 * return the standard `{ error, message }` envelope on failure. Only `/login`
 * issues a session cookie; only `/logout` and `/me` touch an existing session.
 *
 * @param app - the Fastify instance this route group is registered on. Must
 *   have `@fastify/jwt`, `@fastify/cookie` and the auth plugin
 *   ({@link FastifyInstance.authenticateDeveloper}) registered beforehand.
 */
export async function devAuthRoutes(app: FastifyInstance) {
  /**
   * POST /api/dev/auth/signup
   * Creates an unverified developer account plus its email identity, then sends
   * a verification email. Returns 201 with the account; no session is issued
   * until the email is verified and the developer logs in.
   */
  app.post(ENDPOINTS.dev.auth.signup, async (request, reply) => {
    const body = request.body as { email?: string; password?: string; displayName?: string } | null;

    if (!body?.email || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "email and password are required." });
    }

    const email = body.email.trim().toLowerCase();
    const password = body.password;
    const displayName = body.displayName?.trim() || null;

    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        message: `password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      });
    }

    const repo = await getDeveloperRepository();
    const existing = await repo.findDeveloperAccountByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: "EMAIL_TAKEN", message: "An account with this email already exists." });
    }

    const passwordHash = await hashPassword(password);

    // The findByEmail pre-check above is the fast path. Two concurrent signups
    // can still both pass it and race to insert the same email; the unique
    // constraint then rejects the loser with a 23505. Catch that here and
    // return the same 409 the pre-check returns, so a race yields EMAIL_TAKEN
    // rather than a 500. Any other error is a genuine failure and rethrows.
    let account: DeveloperAccount;
    try {
      account = await repo.createDeveloperAccount({ email, passwordHash, displayName });
      await repo.createDeveloperIdentity({ accountId: account.id, provider: AuthProvider.Email });
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return reply.status(409).send({ error: "EMAIL_TAKEN", message: "An account with this email already exists." });
      }
      throw error;
    }

    const { raw, hash } = generateEmailToken();
    await repo.createDeveloperEmailToken({
      accountId: account.id,
      purpose: TokenPurpose.Verify,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    });
    await sendDeveloperVerificationEmail(account, raw);

    app.log.info("[Developer] Account created (unverified)");
    return reply.status(201).send({ account: buildAccountResponse(account) });
  });

  /**
   * POST /api/dev/auth/verify-email
   * Redeems a verification token: marks the account's email verified and
   * consumes the token. Returns 400 for an unknown, expired or already-used
   * token.
   */
  app.post(ENDPOINTS.dev.auth.verifyEmail, async (request, reply) => {
    const body = request.body as { token?: string } | null;
    if (!body?.token) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "token is required." });
    }

    const repo = await getDeveloperRepository();
    const record = await repo.findActiveDeveloperEmailToken(hashEmailToken(body.token), TokenPurpose.Verify);
    if (!record) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "Verification token is invalid or expired." });
    }

    // Claim-then-act: the atomic UPDATE … WHERE consumed_at IS NULL in the
    // adapter is the gate. Consuming first (and only acting on success) closes
    // the check-then-act window where two concurrent requests carrying the same
    // token could both pass the find above and apply the effect twice.
    const consumed = await repo.consumeDeveloperEmailToken(record.id);
    if (!consumed) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "Verification token is invalid or expired." });
    }

    await repo.markDeveloperEmailVerified(record.accountId);

    return reply.send({ ok: true });
  });

  /**
   * POST /api/dev/auth/login
   * Authenticates a developer (verified accounts only), sets the session
   * cookie and returns the account. Timing-safe against email enumeration;
   * unverified accounts get 403 so the portal can prompt for re-verification.
   */
  app.post(ENDPOINTS.dev.auth.login, { preHandler: throttleCredentials }, async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | null;
    if (!body?.email || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "email and password are required." });
    }

    const email = body.email.trim().toLowerCase();
    const repo = await getDeveloperRepository();
    const account = await repo.findDeveloperAccountByEmail(email);

    // Always hash-compare (dummy hash when no account) to keep latency constant.
    const isValid = await verifyPassword(body.password, account?.passwordHash ?? null);
    if (!account || !isValid) {
      return reply.status(401).send({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    }

    if (account.emailVerifiedAt === null) {
      return reply.status(403).send({ error: "EMAIL_NOT_VERIFIED", message: "Please verify your email first." });
    }

    const token = app.jwt.sign({ sub: account.id, kind: SessionKind.Developer }, { expiresIn: "7d" });
    reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());

    // Update last login timestamp (fire and forget): a failed stat write must
    // not block or fail the login response.
    repo.updateDeveloperLastLogin(account.id).catch(() => undefined);

    return reply.send({ account: buildAccountResponse(account) });
  });

  /**
   * POST /api/dev/auth/request-reset
   * Sends a password-reset email when the address has an account. Always
   * returns 200 regardless of existence, so the response never leaks whether an
   * email is registered.
   */
  app.post(ENDPOINTS.dev.auth.requestReset, { preHandler: throttleCredentials }, async (request, reply) => {
    const body = request.body as { email?: string } | null;
    if (!body?.email) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "email is required." });
    }

    const email = body.email.trim().toLowerCase();
    const repo = await getDeveloperRepository();
    const account = await repo.findDeveloperAccountByEmail(email);

    if (account) {
      const { raw, hash } = generateEmailToken();
      await repo.createDeveloperEmailToken({
        accountId: account.id,
        purpose: TokenPurpose.Reset,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });
      await sendDeveloperPasswordResetEmail(account, raw);
    }

    return reply.send({ ok: true });
  });

  /**
   * POST /api/dev/auth/reset-password
   * Redeems a reset token, sets the new password and consumes the token. Also
   * marks the email verified if it was not already: redeeming a reset link
   * proves control of the mailbox, so a still-unverified account is implicitly
   * confirmed. Returns 400 for an unknown, expired or already-used token.
   */
  app.post(ENDPOINTS.dev.auth.resetPassword, async (request, reply) => {
    const body = request.body as { token?: string; password?: string } | null;
    if (!body?.token || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "token and password are required." });
    }
    if (body.password.length < PASSWORD_MIN_LENGTH || body.password.length > PASSWORD_MAX_LENGTH) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        message: `password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      });
    }

    const repo = await getDeveloperRepository();
    const record = await repo.findActiveDeveloperEmailToken(hashEmailToken(body.token), TokenPurpose.Reset);
    if (!record) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "Reset token is invalid or expired." });
    }

    // Claim-then-act: consume the token before applying any effect. The atomic
    // UPDATE … WHERE consumed_at IS NULL in the adapter guarantees exactly one
    // caller wins, closing the replay window where two concurrent requests with
    // the same token could both set a (different) password.
    const consumed = await repo.consumeDeveloperEmailToken(record.id);
    if (!consumed) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "Reset token is invalid or expired." });
    }

    const passwordHash = await hashPassword(body.password);
    const account = await repo.setDeveloperPassword(record.accountId, passwordHash);

    // Redeeming a reset link proves mailbox control; verify the email if it was
    // still pending so the developer is not locked out at login.
    if (account && account.emailVerifiedAt === null) {
      await repo.markDeveloperEmailVerified(account.id);
    }

    return reply.send({ ok: true });
  });

  /**
   * POST /api/dev/auth/logout
   * Clears the session cookie. Idempotent and unauthenticated: a request with
   * no session still returns 200.
   */
  app.post(ENDPOINTS.dev.auth.logout, async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());
    return reply.send({ ok: true });
  });

  /**
   * GET /api/dev/auth/me
   * Returns the currently authenticated developer account, resolved from the
   * `mc_dev_session` cookie by {@link FastifyInstance.authenticateDeveloper}.
   * Returns 401 without a valid session.
   */
  app.get(ENDPOINTS.dev.auth.me, { preHandler: app.authenticateDeveloper }, async (request, reply) => {
    const repo = await getDeveloperRepository();
    const account = await repo.findDeveloperAccountById(request.developerAccountId as string);
    if (!account) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
    }

    return reply.send({ account: buildAccountResponse(account) });
  });
}
