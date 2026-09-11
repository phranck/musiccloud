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
 * `/login` and `/request-reset` share a dedicated per-IP {@link RateLimiter}
 * ({@link credentialRateLimiter}) — deliberately NOT the global `apiRateLimiter`
 * bucket used by the public resolve/share surface, so portal credential traffic
 * is throttled on its own budget without coupling to public-API limits.
 */
import {
  EmailAction,
  EmailRecipientKind,
  ENDPOINTS,
  MAX_DISPLAY_NAME_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DeveloperAccount } from "../db/developer-repository.js";
import { getDeveloperRepository, getTierRepository } from "../db/index.js";
import { isValidEmailAddress } from "../lib/email-address.js";
import { requireEnv } from "../lib/env.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
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
  sha256Hex,
  TokenPurpose,
  verifyPassword,
} from "../services/developer-auth.js";
import { triggerEmailAction } from "../services/email-actions.js";
import { erasePersonalData } from "../services/gdpr-erase.js";
import { buildPersonalDataExport } from "../services/gdpr-export.js";
import { resolveSignupTierId } from "../services/signup-tier.js";

/** Verification-token lifetime: 24 hours from issuance. */
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Password-reset-token lifetime: 1 hour from issuance. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * How long a confirmation link for a new sign-in address lives.
 *
 * A day, like the verification link it resembles: both ask somebody to prove
 * they can read a mailbox, and both are followed from wherever that mailbox is
 * rather than straight away.
 */
const CHANGE_EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Postgres SQLSTATE for a `unique_violation`, raised when a concurrent insert collides on a unique constraint. */
const PG_UNIQUE_VIOLATION = "23505";

/** Name of the unique constraint on `developer_accounts.email` (migration 0047). */
const EMAIL_UNIQUE_CONSTRAINT = "developer_accounts_email_unique";

/**
 * The two refusals that are about the address a developer typed.
 *
 * Both carry their own code rather than the generic `MC-REQ-0001` and
 * `MC-REQ-0002`, because the portal decides from the code which field the
 * message belongs under, and a plain `INVALID_EMAIL` would not survive:
 * `normalizeApiErrorPayload` replaces any code outside the `MC-` scheme with
 * the one that matches the status.
 */
const INVALID_EMAIL_CODE = "MC-REQ-0006";

/** Signup with an address that already has an account. See {@link INVALID_EMAIL_CODE}. */
const EMAIL_TAKEN_CODE = "MC-REQ-0007";

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
 * @param tierName - Display name of the account's assigned tier, or `null`.
 *   Only `/me` resolves it (the portal renders every protected page from a
 *   fresh `/me`); the signup/login/OAuth responses pass the default `null`.
 * @returns The wire-level account object: `emailVerifiedAt` is collapsed to the
 *   boolean `emailVerified`, `passwordHash` is collapsed to the boolean
 *   `hasPassword` (lets the portal decide whether `/delete-account` needs a
 *   password confirmation — `false` for a GitHub-only account), and `createdAt`
 *   (epoch ms) is rendered as an ISO string for JSON-safe transport. The raw
 *   `passwordHash`, `status` and `updatedAt`/`lastLoginAt` are intentionally
 *   omitted.
 */
export function buildAccountResponse(account: DeveloperAccount, tierName: string | null = null) {
  return {
    id: account.id,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    hasPassword: account.passwordHash !== null,
    displayName: account.displayName,
    pendingEmail: account.pendingEmail,
    firstName: account.firstName,
    lastName: account.lastName,
    avatarUrl: resolveAvatarUrl(account),
    providerAvatarUrl: account.avatarUrl,
    uploadedAvatarUrl: account.uploadedAvatarUrl,
    gravatarUrl: account.gravatarUrl,
    avatarSource: account.avatarSource,
    technicalContactEmail: account.technicalContactEmail,
    tierName,
    createdAt: new Date(account.createdAt).toISOString(),
  };
}

/** What `avatarSource` may hold, which is also what the check constraint allows. */
export const AvatarSource = {
  /** The picture an identity provider handed over, which today means GitHub. */
  Provider: "provider",
  /** The picture the developer uploaded. */
  Upload: "upload",
  /** The picture Gravatar answered with. */
  Gravatar: "gravatar",
} as const;

/** One of the sources in {@link AvatarSource}. */
export type AvatarSourceValue = (typeof AvatarSource)[keyof typeof AvatarSource];

/**
 * Whether a value from a request body names one of the three sources.
 *
 * @param value - What the body carried.
 * @returns Whether it is a source the column accepts.
 */
function isAvatarSource(value: unknown): value is AvatarSourceValue {
  return typeof value === "string" && (Object.values(AvatarSource) as string[]).includes(value);
}

/** Image formats an uploaded picture may be in, matching the dashboard's. */
const UPLOAD_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,/;

/** What an uploaded picture may weigh once decoded. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** What the request body may weigh, with room for base64's third. */
const MAX_UPLOAD_BODY_BYTES = 8 * 1024 * 1024;

/** Base64 carries three bytes in every four characters. */
const BASE64_BYTES_PER_CHAR = 0.75;

/** Where a Gravatar lives. Nothing outside this host is stored as one. */
const GRAVATAR_PREFIX = "https://www.gravatar.com/avatar/";

/**
 * The host a stored Gravatar may come from.
 *
 * A profile answers with an address of its own, on any of Gravatar's numbered
 * hosts, and that address is then stored and rendered. Checking the host is
 * what keeps the column from becoming a request to somewhere else entirely.
 */
const GRAVATAR_HOST = /^([0-9]+\.)?gravatar\.com$/;

/** Where a profile is asked for, which is the second place a picture can be. */
const GRAVATAR_PROFILE = "https://gravatar.com";

/** How long to wait for Gravatar before giving up on the lookup. */
const GRAVATAR_TIMEOUT_MS = 4_000;

/** How wide a Gravatar is asked for, which is what the portal draws it at. */
const GRAVATAR_SIZE = 256;

/**
 * The picture that is actually shown.
 *
 * A developer may hold three at once and chooses between them. Where they have
 * not chosen, or where the one they chose is gone, the first of the three that
 * exists is shown rather than nothing: an account with a picture should not
 * look like one without.
 *
 * @param account - The account as stored.
 * @returns The picture to show, or `null` where there is none.
 */
function resolveAvatarUrl(account: DeveloperAccount): string | null {
  const chosen =
    account.avatarSource === AvatarSource.Upload
      ? account.uploadedAvatarUrl
      : account.avatarSource === AvatarSource.Gravatar
        ? account.gravatarUrl
        : account.avatarSource === AvatarSource.Provider
          ? account.avatarUrl
          : null;

  return chosen ?? account.uploadedAvatarUrl ?? account.gravatarUrl ?? account.avatarUrl;
}

/**
 * Finds the picture Gravatar holds for one hashed address.
 *
 * Two questions, because Gravatar answers them differently. The first asks
 * whether that address has a picture of its own, with `d=404` so the answer is
 * a yes or a no rather than a placeholder image. The second asks the profile,
 * because an account holds several addresses and assigns its picture to one of
 * them: an address that is on the account without being the one the picture
 * hangs on answers no to the first question whilst its owner can see their own
 * face on gravatar.com. Asking only the first reports "no Gravatar" to somebody
 * who plainly has one.
 *
 * @param hash - The SHA-256 of the lowercased address.
 * @returns The picture's address, or `null` where there is none.
 * @throws When Gravatar could not be reached, which is not the same as no.
 */
async function findGravatar(hash: string): Promise<string | null> {
  const direct = `${GRAVATAR_PREFIX}${hash}?s=${GRAVATAR_SIZE}`;
  const response = await fetch(`${direct}&d=404`, {
    method: "HEAD",
    signal: AbortSignal.timeout(GRAVATAR_TIMEOUT_MS),
  });
  if (response.ok) return direct;
  if (response.status !== 404) throw new Error(`gravatar answered ${response.status}`);

  const profile = await fetch(`${GRAVATAR_PROFILE}/${hash}.json`, {
    signal: AbortSignal.timeout(GRAVATAR_TIMEOUT_MS),
  });
  if (profile.status === 404) return null;
  if (!profile.ok) throw new Error(`gravatar answered ${profile.status}`);

  const payload = (await profile.json()) as { entry?: { thumbnailUrl?: unknown }[] };
  const thumbnail = payload.entry?.[0]?.thumbnailUrl;
  if (typeof thumbnail !== "string") return null;

  // The address comes from Gravatar rather than from this code, so it is
  // checked before it is stored and rendered.
  let parsed: URL;
  try {
    parsed = new URL(thumbnail);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !GRAVATAR_HOST.test(parsed.hostname)) return null;

  parsed.searchParams.set("s", String(GRAVATAR_SIZE));
  return parsed.toString();
}

/**
 * Normalises an address taken from a request body and refuses anything that
 * cannot be one.
 *
 * Signup and the reset request both read an address a person typed, and both
 * act on it by sending mail to it. An address that cannot receive mail leaves a
 * signup with an account nobody can verify, and it occupies the unique index on
 * `developer_accounts.email` so nothing else can take that string either.
 *
 * The shape rule itself lives in {@link isValidEmailAddress}, which the profile
 * route asks as well, so the portal cannot accept as a login address what it
 * refuses as a technical contact.
 *
 * @param raw - The value from the request body, untrimmed.
 * @returns The lowercased, trimmed address, or `null` when it cannot be one.
 */
function readRequestEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return isValidEmailAddress(email) ? email : null;
}

/**
 * Registers the developer-portal email/password auth routes (signup, verify,
 * login, request-reset, reset-password, logout, me, delete-account) under
 * `/api/dev/auth/*`.
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

    const email = readRequestEmail(body.email);
    if (!email) {
      return reply.status(400).send(createApiErrorResponse(INVALID_EMAIL_CODE));
    }

    const password = body.password;
    const displayName = body.displayName?.trim() || null;

    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        message: `password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      });
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

    // Refusing a malformed address here leaks nothing about who holds an
    // account, because no account can hold a string that is not an address.
    const email = readRequestEmail(body.email);
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

    // Resolve the assigned tier's display name for the portal dashboard;
    // the tiers table is tiny, so list + find beats a dedicated query.
    let tierName: string | null = null;
    if (account.tierId) {
      const tiers = await (await getTierRepository()).listTiers();
      tierName = tiers.find((t) => t.id === account.tierId)?.name ?? null;
    }

    return reply.send({ account: buildAccountResponse(account, tierName) });
  });

  /**
   * PATCH /api/dev/auth/profile
   * Sets or clears the caller's display name and technical contact address.
   *
   * Each field is optional and only what the body carries is written, so the
   * two screens that edit them do not overwrite each other. Sending `null`
   * clears a field.
   *
   * The contact address is where the operator writes when an application on
   * this account needs a person who can act. It is not verified, and nothing
   * that only the account holder may read is sent to it. The portal says so
   * where the field is entered, so a developer is not led to believe it can
   * receive a password reset.
   */
  app.patch(ENDPOINTS.dev.auth.profile, { preHandler: app.authenticateDeveloper }, async (request, reply) => {
    const body = request.body as {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      avatarSource?: string | null;
      technicalContactEmail?: string | null;
    } | null;
    const named =
      body &&
      (body.displayName !== undefined ||
        body.firstName !== undefined ||
        body.lastName !== undefined ||
        body.avatarSource !== undefined ||
        body.technicalContactEmail !== undefined);
    if (!named) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        message: "displayName, firstName, lastName, avatarSource or technicalContactEmail is required.",
      });
    }

    const changes: {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      avatarSource?: string | null;
      technicalContactEmail?: string | null;
    } = {};

    // The two names follow the display name in every respect, including that an
    // empty field and an absent one are the same state.
    for (const field of ["firstName", "lastName"] as const) {
      const value = body[field];
      if (value === undefined) continue;
      if (value === null) {
        changes[field] = null;
        continue;
      }
      if (typeof value !== "string") {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: `${field} must be a string.` });
      }
      const trimmed = value.trim();
      if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
        return reply.status(400).send({
          error: "INVALID_REQUEST",
          message: `${field} may be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
        });
      }
      changes[field] = trimmed === "" ? null : trimmed;
    }

    if (body.avatarSource !== undefined) {
      if (body.avatarSource !== null && !isAvatarSource(body.avatarSource)) {
        return reply.status(400).send({
          error: "INVALID_REQUEST",
          message: `avatarSource must be one of ${Object.values(AvatarSource).join(", ")}.`,
        });
      }
      changes.avatarSource = body.avatarSource;
    }

    if (body.displayName !== undefined) {
      if (body.displayName === null) {
        changes.displayName = null;
      } else {
        if (typeof body.displayName !== "string") {
          return reply.status(400).send({ error: "INVALID_REQUEST", message: "displayName must be a string." });
        }
        const trimmed = body.displayName.trim();
        if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
          return reply.status(400).send({
            error: "INVALID_REQUEST",
            message: `displayName may be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
          });
        }
        // An empty field means "no display name", which is the same state as an
        // absent one, so both store null rather than an empty string.
        changes.displayName = trimmed === "" ? null : trimmed;
      }
    }

    if (body.technicalContactEmail !== undefined) {
      let technicalContactEmail: string | null = null;
      if (body.technicalContactEmail !== null) {
        if (typeof body.technicalContactEmail !== "string") {
          return reply
            .status(400)
            .send({ error: "INVALID_REQUEST", message: "technicalContactEmail must be a string." });
        }
        const trimmed = body.technicalContactEmail.trim();
        // An empty field means "no technical contact", which is the same state
        // as an absent one, so both store null rather than an empty string.
        if (trimmed !== "") {
          if (!isValidEmailAddress(trimmed)) {
            return reply.status(400).send({ error: "INVALID_REQUEST", message: "technicalContactEmail is not valid." });
          }
          technicalContactEmail = trimmed;
        }
      }
      changes.technicalContactEmail = technicalContactEmail;
    }

    const repo = await getDeveloperRepository();
    const updated = await repo.updateDeveloperAccount(request.developerAccountId as string, changes);
    if (!updated) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
    }
    return reply.send({ account: buildAccountResponse(updated, null) });
  });

  /**
   * POST /api/dev/auth/change-email
   * Asks to sign in with a different address.
   *
   * Nothing moves here. The account keeps its address until the link sent to
   * the new one is followed, so a typo costs a second attempt rather than the
   * account. The password is required because a session left open on a
   * borrowed machine must not be enough to take an account over by moving its
   * address.
   *
   * The new address hears that it has to confirm; the old one hears that a
   * change was asked for, which is how a change nobody asked for gets noticed.
   */
  app.post(
    ENDPOINTS.dev.auth.changeEmail,
    { preHandler: [app.authenticateDeveloper, throttleCredentials] },
    async (request, reply) => {
      const account = request.developerAccount!;
      const body = request.body as { email?: string; password?: string } | null;

      if (!body?.email) {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: "email is required." });
      }

      // A GitHub-only account has no password to confirm with, so it cannot take
      // this path. Offering it without the confirmation would be the weaker door
      // on the same house.
      if (account.passwordHash === null) {
        return reply.status(403).send({
          error: "PASSWORD_REQUIRED",
          message: "This account signs in through GitHub, so its address is the one GitHub holds.",
        });
      }
      if (!body.password || !(await verifyPassword(body.password, account.passwordHash))) {
        return reply.status(403).send({ error: "INVALID_CREDENTIALS", message: "That password is not right." });
      }

      const email = readRequestEmail(body.email);
      if (!email) {
        return reply.status(400).send(createApiErrorResponse(INVALID_EMAIL_CODE));
      }
      if (email === account.email) {
        return reply
          .status(400)
          .send({ error: "INVALID_REQUEST", message: "That is already the address you sign in with." });
      }

      const repo = await getDeveloperRepository();
      if (await repo.findDeveloperAccountByEmail(email)) {
        return reply.status(409).send(createApiErrorResponse(EMAIL_TAKEN_CODE));
      }

      const { raw, hash } = generateEmailToken();
      await repo.createDeveloperEmailToken({
        accountId: account.id,
        purpose: TokenPurpose.ChangeEmail,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + CHANGE_EMAIL_TOKEN_TTL_MS),
      });
      const updated = await repo.updateDeveloperAccount(account.id, {
        pendingEmail: email,
        pendingEmailRequestedAt: new Date(),
      });
      if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });

      // A pending address nobody was told about is worse than no change at all:
      // the page would report a link that never left the building. Where the
      // confirmation cannot be sent, the request is taken back.
      try {
        await triggerEmailAction(EmailAction.DeveloperEmailChangeRequested, {
          to: { email },
          recipient: { kind: EmailRecipientKind.DeveloperAccount, email, displayName: account.displayName },
          context: { confirmUrl: `${requireEnv("DEVELOPER_URL")}/confirm-email?token=${raw}`, newEmail: email },
        });
      } catch (error) {
        request.log.error({ err: error }, "failed to send the address-change confirmation");
        await repo.updateDeveloperAccount(account.id, { pendingEmail: null, pendingEmailRequestedAt: null });
        return reply.status(503).send({
          error: "EMAIL_UNAVAILABLE",
          message: "The confirmation could not be sent, so nothing was changed. Please try again.",
        });
      }

      // The old address is told, never asked. A failure to reach it must not
      // stop a change the account holder did ask for.
      try {
        await triggerEmailAction(EmailAction.DeveloperEmailChangeNotified, {
          to: { email: account.email },
          recipient: {
            kind: EmailRecipientKind.DeveloperAccount,
            email: account.email,
            displayName: account.displayName,
          },
          context: { newEmail: email },
        });
      } catch (error) {
        request.log.error({ err: error }, "failed to notify the previous address of a change");
      }

      return reply.send({ account: buildAccountResponse(updated, null) });
    },
  );

  /**
   * DELETE /api/dev/auth/change-email
   * Drops a change that has not been confirmed.
   *
   * The token is left to expire rather than hunted down: following it after
   * this finds no pending address and changes nothing.
   */
  app.delete(ENDPOINTS.dev.auth.changeEmail, { preHandler: app.authenticateDeveloper }, async (request, reply) => {
    const repo = await getDeveloperRepository();
    const updated = await repo.updateDeveloperAccount(request.developerAccountId as string, {
      pendingEmail: null,
      pendingEmailRequestedAt: null,
    });
    if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
    return reply.send({ account: buildAccountResponse(updated, null) });
  });

  /**
   * POST /api/dev/auth/confirm-email-change
   * Redeems the confirmation token and moves the address.
   *
   * No session is required: the token is the proof, which is what lets somebody
   * confirm from the device their new mailbox is on.
   */
  app.post(ENDPOINTS.dev.auth.confirmEmailChange, { preHandler: throttleCredentials }, async (request, reply) => {
    const body = request.body as { token?: string } | null;
    if (!body?.token) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "token is required." });
    }

    const repo = await getDeveloperRepository();
    const record = await repo.findActiveDeveloperEmailToken(hashEmailToken(body.token), TokenPurpose.ChangeEmail);
    if (!record) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "That link is invalid or has expired." });
    }

    const account = await repo.findDeveloperAccountById(record.accountId);
    if (!account?.pendingEmail) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "That link is invalid or has expired." });
    }

    // Claim first, act second, so two requests carrying the same link cannot
    // both pass and move the address twice.
    if (!(await repo.consumeDeveloperEmailToken(record.id))) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "That link is invalid or has expired." });
    }

    // The address may have been taken between the request and the
    // confirmation, and the unique index is what actually decides.
    if (await repo.findDeveloperAccountByEmail(account.pendingEmail)) {
      return reply.status(409).send(createApiErrorResponse(EMAIL_TAKEN_CODE));
    }

    const updated = await repo.updateDeveloperAccount(account.id, {
      email: account.pendingEmail,
      pendingEmail: null,
      pendingEmailRequestedAt: null,
    });
    if (!updated)
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "That link is invalid or has expired." });

    return reply.send({ ok: true });
  });

  /**
   * POST /api/dev/auth/avatar
   * Stores a picture the caller uploaded, as a `data:` URL, and shows it.
   *
   * The same formats and the same two caps the dashboard's avatar route uses,
   * for the same reasons: SVG is refused because it can carry script, and the
   * decoded size is checked from the base64 length rather than by decoding.
   */
  app.post(
    ENDPOINTS.dev.auth.avatar,
    { preHandler: app.authenticateDeveloper, bodyLimit: MAX_UPLOAD_BODY_BYTES },
    async (request, reply) => {
      const body = request.body as { dataUrl?: string } | null;
      if (!body?.dataUrl) {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: "dataUrl is required." });
      }
      if (!UPLOAD_DATA_URL.test(body.dataUrl)) {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: "Only JPEG, PNG or WebP." });
      }

      const base64Part = body.dataUrl.slice(body.dataUrl.indexOf(",") + 1);
      if (Math.ceil(base64Part.length * BASE64_BYTES_PER_CHAR) > MAX_UPLOAD_BYTES) {
        return reply
          .status(400)
          .send({ error: "INVALID_REQUEST", message: `Picture may be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` });
      }

      const repo = await getDeveloperRepository();
      // Uploading is choosing: nobody uploads a picture to keep looking like
      // whatever they looked like before.
      const updated = await repo.updateDeveloperAccount(request.developerAccountId as string, {
        uploadedAvatarUrl: body.dataUrl,
        avatarSource: AvatarSource.Upload,
      });
      if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
      return reply.send({ account: buildAccountResponse(updated, null) });
    },
  );

  /**
   * DELETE /api/dev/auth/avatar
   * Removes the uploaded picture and leaves the other two sources alone.
   *
   * The source falls back to whatever is left rather than to nothing, so
   * removing an upload where a Gravatar exists shows the Gravatar.
   */
  app.delete(ENDPOINTS.dev.auth.avatar, { preHandler: app.authenticateDeveloper }, async (request, reply) => {
    const account = request.developerAccount!;
    const repo = await getDeveloperRepository();
    const updated = await repo.updateDeveloperAccount(account.id, {
      uploadedAvatarUrl: null,
      avatarSource: account.avatarSource === AvatarSource.Upload ? null : account.avatarSource,
    });
    if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
    return reply.send({ account: buildAccountResponse(updated, null) });
  });

  /**
   * POST /api/dev/auth/avatar/gravatar
   * Asks Gravatar whether the caller's address has a picture.
   *
   * On the server, and only when the caller asks. The request tells Automattic
   * that an account exists here for that address, which is not something to do
   * quietly whilst a page renders. `d=404` is what makes the answer a yes or a
   * no rather than a placeholder image dressed as a picture.
   */
  app.post(
    ENDPOINTS.dev.auth.gravatar,
    { preHandler: [app.authenticateDeveloper, throttleCredentials] },
    async (request, reply) => {
      const account = request.developerAccount!;
      const hash = sha256Hex(account.email.trim().toLowerCase());

      let url: string | null;
      try {
        url = await findGravatar(hash);
      } catch {
        return reply.status(502).send({ error: "GRAVATAR_UNAVAILABLE", message: "Gravatar could not be asked." });
      }
      const found = url !== null;

      const repo = await getDeveloperRepository();

      if (!found) {
        // A stored answer is stale the moment this one says there is none, and
        // a source pointing at a picture that is gone would show nothing.
        const cleared = await repo.updateDeveloperAccount(account.id, {
          gravatarUrl: null,
          avatarSource: account.avatarSource === AvatarSource.Gravatar ? null : account.avatarSource,
        });
        if (!cleared) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
        return reply.send({ found: false, account: buildAccountResponse(cleared, null) });
      }

      const updated = await repo.updateDeveloperAccount(account.id, {
        gravatarUrl: url as string,
        avatarSource: AvatarSource.Gravatar,
      });
      if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
      return reply.send({ found: true, account: buildAccountResponse(updated, null) });
    },
  );

  /**
   * GET /api/dev/auth/export
   * The caller's complete personal-data package (GDPR Art. 15/20) as a JSON
   * attachment: account (without secrets), auth identities, and the caller's
   * registrations with token metadata.
   */
  app.get(ENDPOINTS.dev.auth.export, { preHandler: app.authenticateDeveloper }, async (request, reply) => {
    const account = request.developerAccount!;
    const pkg = await buildPersonalDataExport({ developerAccountId: account.id, email: account.email });
    reply.header("content-disposition", 'attachment; filename="musiccloud-data-export.json"');
    return reply.send(pkg);
  });

  /**
   * POST /api/dev/auth/delete-account
   * Permanently deletes the caller's own account (the dashboard's "Danger
   * Zone"). Cascades to the account's identities, email tokens, API-access
   * requests and clients (see `deleteDeveloperAccount`), then clears the
   * session cookie. When the account has a password set, `body.password`
   * must match it (401 `INVALID_CREDENTIALS` otherwise) — an extra
   * confirmation for an irreversible action. A GitHub-only account
   * (`hasPassword: false` on `/me`) has no password to confirm, so the body
   * is not required.
   */
  app.post(ENDPOINTS.dev.auth.deleteAccount, { preHandler: app.authenticateDeveloper }, async (request, reply) => {
    const account = request.developerAccount!;

    if (account.passwordHash !== null) {
      const body = request.body as { password?: string } | null;
      const isValid = await verifyPassword(body?.password ?? "", account.passwordHash);
      if (!isValid) {
        return reply.status(401).send({ error: "INVALID_CREDENTIALS", message: "Incorrect password." });
      }
    }

    // Optional farewell notification (MC-084): fired BEFORE the delete while
    // the account data still exists; a mail failure must never block the
    // deletion itself (mirrors the invite route's resilience semantics).
    try {
      await triggerEmailAction(EmailAction.DeveloperAccountDeleted, {
        to: { email: account.email },
        recipient: {
          kind: EmailRecipientKind.DeveloperAccount,
          email: account.email,
          displayName: account.displayName,
        },
        context: {},
      });
    } catch (error) {
      request.log.error({ err: error }, "failed to send account-deleted notification");
    }

    // GDPR-complete erasure (MC-085): delete the authenticated account; DB
    // cascades clear identities, email tokens and API-access data.
    await erasePersonalData(account.id);
    reply.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());

    app.log.info("[Developer] Account deleted");
    return reply.send({ ok: true });
  });
}
