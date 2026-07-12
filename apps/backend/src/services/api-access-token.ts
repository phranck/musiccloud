/**
 * @file Token-generation and hashing service for the API-access system
 * (MC-025/MC-077). Framework-free: produces live API tokens developers
 * send as `X-API-Key`, and the SHA-256 hash that is the only
 * form ever persisted. The route layer owns persistence and authorization;
 * this module owns only the token shape.
 */
import crypto from "node:crypto";

const TOKEN_PREFIX = "mc_live";
const LIVE_API_TOKEN_RE = /^mc_live_[a-z0-9]{12}_[A-Za-z0-9_-]{32,}$/;

function randomUrlSafe(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

/**
 * A freshly generated token: `raw` is returned to the caller exactly once
 * (the API response body of a create/rotate call) and never stored;
 * `prefix` (the non-secret 12-character segment) and `hash` are what gets persisted.
 */
export interface GeneratedApiToken {
  /** Full live API token, shown to the caller once. */
  raw: string;
  /** Non-secret token prefix, stored in the clear for display. */
  prefix: string;
  /** Hex-encoded SHA-256 of `raw`; the only form persisted. */
  hash: string;
}

/**
 * Generates a new live API-access token.
 *
 * @returns The raw token plus its display prefix and SHA-256 hash.
 */
export function generateApiToken(): GeneratedApiToken {
  const prefix = randomUrlSafe(9)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .padEnd(12, "0")
    .slice(0, 12);
  const raw = `${TOKEN_PREFIX}_${prefix}_${randomUrlSafe(32)}`;
  return { raw, prefix, hash: hashApiToken(raw) };
}

/**
 * Hashes a raw token for persistence and lookup-equality comparison. Never
 * log or persist the raw token itself — only this hash and the `prefix`.
 *
 * @param rawToken - The full raw token.
 * @returns Hex-encoded SHA-256 digest.
 */
export function hashApiToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Tells whether an incoming `X-API-Key` value has the shape of an issued
 * live API-access token, so the auth layer can route it to the
 * token-hash lookup instead of the internal-key comparison. Shape check
 * only — validity is decided by the DB lookup.
 *
 * @param value - The raw header value.
 * @returns `true` when the value matches the released live-token format.
 */
export function looksLikeApiAccessToken(value: string): boolean {
  return LIVE_API_TOKEN_RE.test(value);
}

/**
 * Formats a token prefix for display in a list (developer's own key list,
 * or the admin client-detail view). Never touches the full token.
 *
 * @param prefix - The token's stored `tokenPrefix`.
 * @returns A masked display string, e.g. `mc_live_abc123def456_...`.
 */
export function formatApiTokenForDisplay(prefix: string): string {
  return `${TOKEN_PREFIX}_${prefix}_...`;
}
