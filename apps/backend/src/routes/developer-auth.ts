/**
 * @file Email/password authentication for the external developer portal
 * (developer.musiccloud.io, MC-064). Registered unauthenticated at the root
 * scope in `server.ts`, because these endpoints are how a developer creates an
 * account and obtains a session in the first place. The routes that act on a
 * signed-in account attach the
 * {@link FastifyInstance.authenticateDeveloper} guard inline as a
 * `preValidation` hook, so a request without a session is refused before its
 * body is validated, and after the rate limiter has counted it.
 *
 * The profile, sign-in address and picture routes live in
 * `developer-profile.ts`, and the GDPR export and account deletion in
 * `developer-account-data.ts`. {@link devAuthRoutes} registers both, so every
 * route keeps the scope it had. The account payload lives in
 * `developer-account-response.ts` and is re-exported here.
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
 * Login signs `{ sub: accountId, kind: "developer" }` through
 * {@link issueDeveloperSession}, which gives the token and the cookie one
 * lifetime and refuses an account that is not active. The `kind` claim lets
 * {@link FastifyInstance.authenticateDeveloper} reject an admin token that
 * happens to be presented in the cookie.
 *
 * ## Timing-attack protection
 *
 * Login does not branch on account existence before hashing: {@link verifyPassword}
 * always pays the bcrypt cost (against a dummy hash when no account/credential
 * exists), so response latency cannot be used to enumerate registered emails.
 * `request-reset` likewise returns `200` for every address it can use, never
 * revealing whether one has an account. It refuses a string that cannot be an
 * address at all, which is a statement about the string rather than about who
 * holds an account.
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
 * `/login` and `/request-reset` share a dedicated per-IP `RateLimiter`, the
 * `credentialRateLimiter` in `developer-credential-throttle.ts`. It is
 * deliberately NOT the global `apiRateLimiter` bucket used by the public
 * resolve/share surface, so portal credential traffic is throttled on its own
 * budget without coupling to public-API limits.
 */
import { EmailAction, EmailRecipientKind, ENDPOINTS, validatePasswordLength } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import type { DeveloperAccount } from "../db/developer-repository.js";
import { getDeveloperRepository, getTierRepository } from "../db/index.js";
import { EMAIL_TAKEN_CODE, INVALID_EMAIL_CODE, normalizeEmailAddress } from "../lib/email-address.js";
import { requireEnv } from "../lib/env.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import {
  ACCOUNT_SUSPENDED_BODY,
  AuthProvider,
  clearedSessionCookieOptions,
  generateEmailToken,
  hashEmailToken,
  hashPassword,
  issueDeveloperSession,
  SESSION_COOKIE_NAME,
  TokenPurpose,
  verifyPassword,
} from "../services/developer-auth.js";
import { mayCreateDeveloperAccount, PORTAL_CLOSED_CODE } from "../services/developer-portal-access.js";
import { triggerEmailAction } from "../services/email-actions.js";
import { resolveSignupTierId } from "../services/signup-tier.js";
import { devAccountDataRoutes } from "./developer-account-data.js";
import { buildAccountResponse } from "./developer-account-response.js";
import { throttleCredentials } from "./developer-credential-throttle.js";
import { applyInvitationPass, readRequestInvitationPass } from "./developer-portal-invitations.js";
import { devProfileRoutes } from "./developer-profile.js";

export {
  AvatarSource,
  type AvatarSourceValue,
  buildAccountResponse,
  isAvatarSource,
  resolveAvatarUrl,
} from "./developer-account-response.js";

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
 * Registers the developer-portal email/password auth routes (signup, verify,
 * login, request-reset, reset-password, logout, me) under `/api/dev/auth/*`,
 * and the route groups of `developer-profile.ts` and
 * `developer-account-data.ts` beside them.
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
    const body = request.body as { email?: string; password?: string; displayName?: string; tierId?: string } | null;

    if (!body?.email || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "email and password are required." });
    }

    // While the portal is closed, only the holder of an invitation pass opens
    // an account. Asked before the address is looked up, so a refusal says
    // nothing about who already has one.
    if (!(await mayCreateDeveloperAccount(readRequestInvitationPass(app, request)))) {
      return reply.status(403).send(createApiErrorResponse(PORTAL_CLOSED_CODE));
    }

    const email = normalizeEmailAddress(body.email);
    if (!email) {
      return reply.status(400).send(createApiErrorResponse(INVALID_EMAIL_CODE));
    }

    const password = body.password;
    const displayName = body.displayName?.trim() || null;

    const passwordRefusal = validatePasswordLength(password);
    if (passwordRefusal) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: passwordRefusal });
    }

    // Every signup is assigned a tier via the shared resolver (MC-109).
    // If the request carries a valid free-tier id it is honoured; any paid
    // tier, unknown id, or missing value falls back to tier_free so the
    // account is never left tier-less.
    const tierId = await resolveSignupTierId(body.tierId);

    const repo = await getDeveloperRepository();
    const existing = await repo.findDeveloperAccountByEmail(email);
    if (existing) {
      return reply.status(409).send(createApiErrorResponse(EMAIL_TAKEN_CODE));
    }

    const passwordHash = await hashPassword(password);

    // The findByEmail pre-check above is the fast path. Two concurrent signups
    // can still both pass it and race to insert the same email; the unique
    // constraint then rejects the loser with a 23505. Catch that here and
    // return the same 409 the pre-check returns, so a race yields EMAIL_TAKEN
    // rather than a 500. Any other error is a genuine failure and rethrows.
    let account: DeveloperAccount;
    try {
      account = await repo.createDeveloperAccount({ email, passwordHash, displayName, tierId });
      await repo.createDeveloperIdentity({ accountId: account.id, provider: AuthProvider.Email });
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return reply.status(409).send(createApiErrorResponse(EMAIL_TAKEN_CODE));
      }
      throw error;
    }

    // Somebody who followed an invitation link signs up holding its pass,
    // and the access it gives lands on the account they have just created.
    await applyInvitationPass(app, request, reply, account.id);

    const { raw, hash } = generateEmailToken();
    await repo.createDeveloperEmailToken({
      accountId: account.id,
      purpose: TokenPurpose.Verify,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    });
    await triggerEmailAction(EmailAction.DeveloperVerificationRequested, {
      to: { email: account.email },
      recipient: {
        kind: EmailRecipientKind.DeveloperAccount,
        email: account.email,
        displayName: account.displayName,
      },
      // The raw token is embedded in the URL here; only its SHA-256 hash is
      // ever persisted (see generateEmailToken).
      context: { verifyUrl: `${requireEnv("DEVELOPER_URL")}/verify?token=${raw}` },
    });

    // Optional welcome notification (MC-085 follow-up): unlike the required
    // verification mail above, this must never fail the signup.
    try {
      await triggerEmailAction(EmailAction.DeveloperAccountCreated, {
        to: { email: account.email },
        recipient: {
          kind: EmailRecipientKind.DeveloperAccount,
          email: account.email,
          displayName: account.displayName,
        },
        context: {},
      });
    } catch (error) {
      request.log.error({ err: error }, "failed to send account-created notification");
    }

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
   * unverified accounts get 403 so the portal can prompt for re-verification,
   * and a suspended account gets 403 `ACCOUNT_SUSPENDED` and no cookie, as on
   * GitHub sign-in.
   */
  app.post(ENDPOINTS.dev.auth.login, { preHandler: throttleCredentials }, async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | null;
    if (!body?.email || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "email and password are required." });
    }

    // A value that cannot be an address finds no account, and still pays the
    // comparison below, so the response time is the same as for any miss.
    const email = normalizeEmailAddress(body.email);
    const repo = await getDeveloperRepository();
    const account = email ? await repo.findDeveloperAccountByEmail(email) : null;

    // Always hash-compare (dummy hash when no account) to keep latency constant.
    const isValid = await verifyPassword(body.password, account?.passwordHash ?? null);
    if (!account || !isValid) {
      return reply.status(401).send({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    }

    if (account.emailVerifiedAt === null) {
      return reply.status(403).send({ error: "EMAIL_NOT_VERIFIED", message: "Please verify your email first." });
    }

    const session = issueDeveloperSession(account, (payload, options) => app.jwt.sign(payload, options));
    if (!session) {
      return reply.status(403).send(ACCOUNT_SUSPENDED_BODY);
    }
    reply.setCookie(SESSION_COOKIE_NAME, session.token, session.cookieOptions);
    await applyInvitationPass(app, request, reply, account.id);

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

    // Refusing a malformed address here leaks nothing about who holds an
    // account, because no account can hold a string that is not an address.
    const email = normalizeEmailAddress(body.email);
    if (!email) {
      return reply.status(400).send(createApiErrorResponse(INVALID_EMAIL_CODE));
    }

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
      await triggerEmailAction(EmailAction.DeveloperPasswordResetRequested, {
        to: { email: account.email },
        recipient: {
          kind: EmailRecipientKind.DeveloperAccount,
          email: account.email,
          displayName: account.displayName,
        },
        context: { resetUrl: `${requireEnv("DEVELOPER_URL")}/reset?token=${raw}` },
      });
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
    const passwordRefusal = validatePasswordLength(body.password);
    if (passwordRefusal) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: passwordRefusal });
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
   * `mc_dev_session` cookie by {@link FastifyInstance.authenticateDeveloperSession}.
   * Returns 401 without a valid session. It answers an account the closed
   * portal does not admit as well, because the portal's gate reads the grant
   * from here.
   */
  app.get(ENDPOINTS.dev.auth.me, { preValidation: app.authenticateDeveloperSession }, async (request, reply) => {
    const repo = await getDeveloperRepository();
    const account = await repo.findDeveloperAccountById(request.developerAccountId as string);
    if (!account) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
    }

    // Resolve the assigned tier's display name for the portal dashboard;
    // the tiers table is tiny, so list + find beats a dedicated query.
    let tierName: string | null = null;
    if (account.tierId) {
      const tiers = await (await getTierRepository()).listTiers();
      tierName = tiers.find((t) => t.id === account.tierId)?.name ?? null;
    }

    return reply.send({ account: buildAccountResponse(account, tierName) });
  });

  // Registered from here rather than from `server.ts`, so every test and every
  // server that registers `devAuthRoutes` serves the whole `/api/dev/auth/*`
  // surface, as it did before the routes moved to modules of their own.
  await app.register(devProfileRoutes);
  await app.register(devAccountDataRoutes);
}
