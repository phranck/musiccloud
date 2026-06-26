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
 *    raw token exists solely in the emailed link.
 * 2. **Session-cookie mechanics.** The cookie name, lifetime, and the
 *    serialize options for setting and clearing the `mc_dev_session` cookie.
 *
 * The session **JWT** itself is intentionally NOT signed or verified here.
 * That requires the Fastify instance (`app.jwt.sign` / `app.jwt.verify`) and
 * happens in the route layer and the guard. This module only owns the cookie
 * envelope and the cryptographic helpers.
 */
import crypto from "node:crypto";
import type { CookieSerializeOptions } from "@fastify/cookie";
import bcrypt from "bcryptjs";

/**
 * bcrypt work factor for developer-account passwords. Matches the admin
 * surface (`admin-auth.ts`): two rungs above the library default of 10
 * (~4x slower), a deliberate trade of per-login latency against brute-force
 * resistance.
 */
const BCRYPT_WORK_FACTOR = 12;

/**
 * Constant-shape bcrypt hash compared against when no real hash exists (e.g.
 * unknown email, or a pure-OAuth account with `password_hash IS NULL`). It is
 * a syntactically valid bcrypt string that no password can ever match, so the
 * `bcrypt.compare` cost is paid either way and login latency does not leak
 * whether an account exists. Mirrors the admin-auth dummy hash verbatim.
 */
const DUMMY_PASSWORD_HASH = "$2a$12$invalidhashfortimingprotection000000000000000000000000";

/**
 * Name of the httpOnly session cookie issued on developer login. Read by
 * {@link sessionCookieOptions} when set and by the `authenticateDeveloper`
 * guard when validating a request.
 */
export const SESSION_COOKIE_NAME = "mc_dev_session";

/**
 * Session cookie lifetime in seconds (7 days). Kept in lockstep with the
 * `expiresIn: "7d"` passed to `app.jwt.sign` in the login route, so the cookie
 * and the JWT it carries expire together rather than leaving a stale cookie
 * that always 401s.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

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
 * password), the comparison still runs against {@link DUMMY_PASSWORD_HASH} so
 * the bcrypt cost is identical to the real-hash path — an attacker cannot
 * distinguish "no such account" from "wrong password" by response latency. A
 * `null` hash therefore always resolves to `false`.
 *
 * @param password - The plaintext password supplied at login.
 * @param hash - The stored bcrypt hash, or `null` if none exists.
 * @returns A promise resolving to `true` only when a real hash exists and the
 *   password matches it; `false` otherwise.
 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    // Pay the bcrypt cost against a dummy hash to keep timing constant, then
    // always reject — there is no real credential to match.
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

/**
 * SHA-256 hex digest helper shared by token generation and verification, so
 * the raw → hash transform is defined in exactly one place.
 *
 * @param value - The value to digest.
 * @returns The lowercase hex-encoded SHA-256 digest.
 */
function sha256Hex(value: string): string {
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
 * Serialize options for **setting** the developer session cookie. The cookie
 * is httpOnly (no JS access), `secure` in production (HTTPS-only; left off in
 * dev so it works over plain-HTTP localhost), `sameSite: "lax"` (sent on
 * top-level navigations but not cross-site POSTs, a sensible CSRF baseline for
 * a portal session), scoped to `/`, and lived for {@link SESSION_MAX_AGE_SECONDS}.
 *
 * @returns Cookie serialize options for `reply.setCookie(SESSION_COOKIE_NAME, …)`.
 */
export function sessionCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Serialize options for **clearing** the developer session cookie on logout.
 * Identical attributes to {@link sessionCookieOptions} (so the browser matches
 * and overwrites the existing cookie) but with `maxAge: 0`, expiring it
 * immediately.
 *
 * @returns Cookie serialize options for `reply.clearCookie` / an expiring
 *   `reply.setCookie(SESSION_COOKIE_NAME, "", …)`.
 */
export function clearedSessionCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}
