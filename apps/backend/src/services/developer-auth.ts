/**
 * @file Pure auth primitives for the external developer-account system
 * (MC-064). Deliberately framework-free: nothing here touches the Fastify
 * instance, so the functions stay unit-testable in isolation and reusable
 * across routes and the {@link authenticateDeveloper} guard.
 *
 * Two concerns live here:
 *
 * 1. **Secret hashing.** Password hashing/verification (bcrypt, work factor
 *    12, timing-safe verify) and single-use email-token generation/hashing
 *    (`crypto.randomBytes` + SHA-256). Only hashes are ever persisted; the
 *    raw token exists solely in the emailed link. The admin routes hash and
 *    verify their passwords with {@link hashPassword} and
 *    {@link verifyPassword} as well, so both surfaces share one work factor
 *    and one timing protection.
 * 2. **Cookie mechanics.** The names, lifetimes and serialize options of the
 *    `mc_dev_session` cookie and of the invitation pass, which opens sign-up
 *    while the portal is closed.
 *
 * The session **JWT** is signed through a signer the route passes in, because
 * signing needs the Fastify instance (`app.jwt.sign`) and this module does not
 * import it. {@link issueDeveloperSession} decides whether an account may hold
 * a session at all and builds the token and the cookie from one lifetime; the
 * guard verifies the token and asks {@link isDeveloperAccountActive} the same
 * question on every request.
 */
import crypto from "node:crypto";
import type { CookieSerializeOptions } from "@fastify/cookie";
import bcrypt from "bcryptjs";
import type { DeveloperAccount } from "../db/developer-repository.js";

/**
 * bcrypt work factor for every account password, developer and admin alike.
 * It is two rungs above the library default of 10, which makes a hash about
 * four times slower, and trades per-login latency for brute-force resistance.
 */
const BCRYPT_WORK_FACTOR = 12;

/** The dummy hash, once {@link dummyPasswordHash} has started making it. */
let dummyPasswordHashPromise: Promise<string> | undefined;

/**
 * The hash compared against when no real one exists, such as for an unknown
 * address or a GitHub-only account with `password_hash IS NULL`.
 *
 * It has to be a real bcrypt hash at {@link BCRYPT_WORK_FACTOR}, because
 * bcryptjs rejects a malformed hash at once without hashing anything, and a
 * comparison that skips the cost lets the response time tell which addresses
 * have an account. It is the hash of 32 random bytes that are never kept, so
 * no password matches it. It is made on first use rather than at import,
 * which keeps importing this module free of a bcrypt computation, and it is
 * kept for the life of the process.
 *
 * @returns A promise resolving to the dummy hash.
 */
function dummyPasswordHash(): Promise<string> {
  dummyPasswordHashPromise ??= bcrypt.hash(crypto.randomBytes(32).toString("hex"), BCRYPT_WORK_FACTOR);
  return dummyPasswordHashPromise;
}

/**
 * Name of the httpOnly session cookie issued on developer login. Read by
 * {@link sessionCookieOptions} when set and by the `authenticateDeveloper`
 * guard when validating a request.
 */
export const SESSION_COOKIE_NAME = "mc_dev_session";

/**
 * Session lifetime in seconds (7 days). {@link issueDeveloperSession} builds
 * both the token's expiry and the cookie's `maxAge` from it, so the cookie and
 * the JWT it carries expire together rather than leaving a stale cookie that
 * always 401s.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Discriminant for the `kind` claim carried by the developer session JWT.
 * {@link issueDeveloperSession} stamps {@link SessionKind.Developer} into the token and the
 * `authenticateDeveloper` guard rejects any token whose `kind` differs, so an
 * admin JWT presented in the `mc_dev_session` cookie cannot pass. Centralized
 * here so the produced and the checked literal can never drift apart.
 */
export const SessionKind = {
  /** Marks a JWT as a developer-portal session (vs. an admin dashboard token). */
  Developer: "developer",
} as const;

/**
 * Purpose discriminant for single-use email tokens, persisted in
 * `developer_email_tokens.purpose` and matched at redemption. A verify token
 * confirms mailbox ownership at signup; a reset token authorizes a password
 * change. The schema's `check (purpose IN ('verify','reset'))` constraint is
 * the database-side guard; this namespace is the application-side source of
 * truth for the same two strings.
 */
export const TokenPurpose = {
  /** Email-verification token issued at signup. */
  Verify: "verify",
  /** Password-reset token issued by the request-reset flow. */
  Reset: "reset",
  /**
   * Confirmation token for a change of sign-in address.
   *
   * Sent to the address being moved to, because that is the one whose owner
   * has to prove they can read it. The account keeps signing in with the old
   * address until this is redeemed.
   */
  ChangeEmail: "change-email",
} as const;

/**
 * Authentication-provider discriminant, persisted in
 * `developer_identities.provider`. `Email` is the built-in email/password
 * provider (a `null` `provider_user_id`); `GitHub` is the OAuth provider
 * landing in MC-065. Mirrors the schema's `check (provider IN ('email',
 * 'github'))` constraint as the application-side source of truth.
 */
export const AuthProvider = {
  /** Built-in email/password identity. */
  Email: "email",
  /** GitHub OAuth identity (MC-065). */
  GitHub: "github",
} as const;

/**
 * Hashes a plaintext password with bcrypt at {@link BCRYPT_WORK_FACTOR}.
 *
 * @param password - The plaintext password to hash.
 * @returns A promise resolving to the bcrypt hash string for persistence.
 */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_WORK_FACTOR);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash in a timing-safe
 * manner.
 *
 * When `hash` is `null` (unknown account, or an account that has never set a
 * password), the comparison still runs against {@link dummyPasswordHash}, so
 * the bcrypt cost is the same as on the real-hash path and the response time
 * does not tell "no such account" from "wrong password". A `null` hash
 * therefore always resolves to `false`.
 *
 * @param password - The plaintext password supplied at login.
 * @param hash - The stored bcrypt hash, or `null` if none exists.
 * @returns A promise resolving to `true` only when a real hash exists and the
 *   password matches it; `false` otherwise.
 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    // Pay the bcrypt cost against the dummy hash to keep timing constant, then
    // always reject, because there is no real credential to match.
    await bcrypt.compare(password, await dummyPasswordHash());
    return false;
  }
  return bcrypt.compare(password, hash);
}

/**
 * SHA-256 hex digest helper shared by token generation, token verification and
 * the Gravatar lookup, so the raw to hash transform is defined in exactly one
 * place.
 *
 * @param value - The value to digest.
 * @returns The lowercase hex-encoded SHA-256 digest.
 */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Generates a single-use email token pair for verification or password reset.
 *
 * The `raw` value (256 bits of entropy, URL-safe base64) is what goes into the
 * emailed link; only its `hash` is persisted. At redemption the incoming raw
 * token is re-hashed via {@link hashEmailToken} and matched against the stored
 * hash, so a database leak never exposes a usable token.
 *
 * @returns An object with the `raw` token (for the email link) and its
 *   `hash` (for persistence).
 */
export function generateEmailToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: sha256Hex(raw) };
}

/**
 * Hashes a raw email token for lookup against the persisted `token_hash`.
 * Deterministic counterpart to {@link generateEmailToken} used when a verify
 * or reset link is redeemed.
 *
 * @param raw - The raw token taken from the email link.
 * @returns The lowercase hex-encoded SHA-256 digest.
 */
export function hashEmailToken(raw: string): string {
  return sha256Hex(raw);
}

/**
 * The attributes every portal cookie the backend sets carries: httpOnly (no
 * JS access), `secure` in production (HTTPS-only; left off in dev so it works
 * over plain-HTTP localhost), `sameSite: "lax"` (sent on top-level navigations
 * but not cross-site POSTs, a sensible CSRF baseline for a portal session) and
 * scoped to `/`. Setting and clearing differ only in `maxAge`, so the browser
 * matches the cookie it clears to the one it holds.
 *
 * @param maxAge - Lifetime in seconds, `0` to expire the cookie at once.
 * @returns Cookie serialize options.
 */
function portalCookieOptions(maxAge: number): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/**
 * Serialize options for **setting** the developer session cookie, lived for
 * {@link SESSION_MAX_AGE_SECONDS}.
 *
 * @returns Cookie serialize options for `reply.setCookie(SESSION_COOKIE_NAME, …)`.
 */
export function sessionCookieOptions(): CookieSerializeOptions {
  return portalCookieOptions(SESSION_MAX_AGE_SECONDS);
}

/**
 * Serialize options for **clearing** the developer session cookie on logout.
 *
 * @returns Cookie serialize options for `reply.clearCookie` / an expiring
 *   `reply.setCookie(SESSION_COOKIE_NAME, "", …)`.
 */
export function clearedSessionCookieOptions(): CookieSerializeOptions {
  return portalCookieOptions(0);
}

/**
 * How long a pass lives, in seconds. A day, because it only has to survive one
 * sign-up; the access itself is written onto the account the pass ends on.
 */
export const INVITATION_PASS_MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * The `kind` claim of an invitation pass. The session guard and the GitHub
 * state verifier each accept only their own kind, and {@link readInvitationPass}
 * only this one, so the three tokens the backend signs with one key cannot
 * stand in for each other.
 */
export const INVITATION_PASS_KIND = "portal-invitation";

/** Signs a pass the way `app.jwt.sign` does. Passed in so this module stays framework-free. */
export type InvitationPassSigner = (
  payload: { kind: typeof INVITATION_PASS_KIND; invitationId: string },
  options: { expiresIn: number },
) => string;

/**
 * Issues the pass for an invitation that has just been redeemed.
 *
 * It says which invitation it came from and nothing about the person, because
 * when it is issued nobody knows who they are.
 *
 * @param invitationId - The redeemed invitation.
 * @param sign - The signer, `(payload, options) => app.jwt.sign(payload, options)`.
 * @returns The token and the options to set its cookie with.
 */
export function issueInvitationPass(
  invitationId: string,
  sign: InvitationPassSigner,
): { token: string; cookieOptions: CookieSerializeOptions } {
  return {
    token: sign({ kind: INVITATION_PASS_KIND, invitationId }, { expiresIn: INVITATION_PASS_MAX_AGE_SECONDS }),
    cookieOptions: portalCookieOptions(INVITATION_PASS_MAX_AGE_SECONDS),
  };
}

/**
 * Reads the invitation a pass names.
 *
 * Whether that invitation still opens anything is a separate question for the
 * database; this answers only whether the token is a pass at all.
 *
 * @param token - The cookie's value, or `undefined` where there is none.
 * @param verify - The verifier, `(token) => app.jwt.verify(token)`, which
 *   throws on a bad signature or an expired token.
 * @returns The invitation id, or `null` for anything that is not a valid pass.
 */
export function readInvitationPass(token: string | undefined, verify: (token: string) => unknown): string | null {
  if (!token) return null;
  try {
    const payload = verify(token) as { kind?: unknown; invitationId?: unknown };
    if (payload.kind !== INVITATION_PASS_KIND || typeof payload.invitationId !== "string") return null;
    return payload.invitationId;
  } catch {
    return null;
  }
}

/**
 * Serialize options for clearing the pass once it has done its work.
 *
 * @returns Cookie serialize options for `reply.clearCookie(INVITATION_PASS_COOKIE_NAME, …)`.
 */
export function clearedInvitationPassCookieOptions(): CookieSerializeOptions {
  return portalCookieOptions(0);
}

/**
 * Whether a developer account may hold a session.
 *
 * Signing in and every guarded request ask this one question, so the status
 * that opens a session and the status that keeps it open cannot differ.
 *
 * @param account - The account as stored.
 * @returns `true` only for an active account.
 */
export function isDeveloperAccountActive(account: Pick<DeveloperAccount, "status">): boolean {
  return account.status === "active";
}

/** The refusal both sign-in routes send to an account that is not active. */
export const ACCOUNT_SUSPENDED_BODY = { error: "ACCOUNT_SUSPENDED", message: "This account is not active." } as const;

/** Signs a session token the way `app.jwt.sign` does. Passed in so this module stays framework-free. */
export type DeveloperSessionSigner = (
  payload: { sub: string; kind: typeof SessionKind.Developer },
  options: { expiresIn: number },
) => string;

/**
 * Issues a developer session, or refuses to.
 *
 * Email login and GitHub login both end here, so a suspended account is
 * refused the same way on both. The token expires after
 * {@link SESSION_MAX_AGE_SECONDS}, passed as a number because `@fastify/jwt`
 * reads a numeric `expiresIn` as seconds, and the cookie is given the same
 * lifetime.
 *
 * @param account - The account signing in, already authenticated.
 * @param sign - The signer, `(payload, options) => app.jwt.sign(payload, options)`.
 * @returns The token and the options to set its cookie with, or `null` when
 *   the account may not hold a session.
 */
export function issueDeveloperSession(
  account: Pick<DeveloperAccount, "id" | "status">,
  sign: DeveloperSessionSigner,
): { token: string; cookieOptions: CookieSerializeOptions } | null {
  if (!isDeveloperAccountActive(account)) return null;
  return {
    token: sign({ sub: account.id, kind: SessionKind.Developer }, { expiresIn: SESSION_MAX_AGE_SECONDS }),
    cookieOptions: sessionCookieOptions(),
  };
}
