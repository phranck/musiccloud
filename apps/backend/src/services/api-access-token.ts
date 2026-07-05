/**
 * @file Token-generation and hashing service for the API-access system
 * (MC-025/MC-077). Framework-free: produces UUID v4 bearer tokens
 * developers send as `X-API-Key`, and the SHA-256 hash that is the only
 * form ever persisted. The route layer owns persistence and authorization;
 * this module owns only the token shape.
 */
import crypto from "node:crypto";

/** UUID v4 regex — matches the exact format produced by `crypto.randomUUID()`. */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A freshly generated token: `raw` is returned to the caller exactly once
 * (the API response body of a create/rotate call) and never stored;
 * `prefix` (first 8 hex chars) and `hash` are what gets persisted.
 */
export interface GeneratedApiToken {
  /** Full UUID v4 token, shown to the caller once. */
  raw: string;
  /** First 8 hex chars of the UUID, stored in the clear for display. */
  prefix: string;
  /** Hex-encoded SHA-256 of `raw`; the only form persisted. */
  hash: string;
}

/**
 * Generates a new API-access token as a UUID v4 string.
 *
 * @returns The raw UUID plus its display prefix and SHA-256 hash.
 */
export function generateApiToken(): GeneratedApiToken {
  const raw = crypto.randomUUID();
  return { raw, prefix: raw.substring(0, 8), hash: hashApiToken(raw) };
}

/**
 * Hashes a raw token for persistence and lookup-equality comparison. Never
 * log or persist the raw token itself — only this hash and the `prefix`.
 *
 * @param rawToken - The full UUID v4 token.
 * @returns Hex-encoded SHA-256 digest.
 */
export function hashApiToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Tells whether an incoming `X-API-Key` value has the shape of an issued
 * API-access token (UUID v4), so the auth layer can route it to the
 * token-hash lookup instead of the internal-key comparison. Shape check
 * only — validity is decided by the DB lookup.
 *
 * @param value - The raw header value.
 * @returns `true` when the value matches UUID v4 format.
 */
export function looksLikeApiAccessToken(value: string): boolean {
  return UUID_V4_RE.test(value);
}

/**
 * Formats a token prefix for display in a list (developer's own key list,
 * or the admin client-detail view). Never touches the full token.
 *
 * @param prefix - The token's stored `tokenPrefix` (first 8 hex chars).
 * @returns A masked display string, e.g. `6121de17-...`.
 */
export function formatApiTokenForDisplay(prefix: string): string {
  return `${prefix}-...`;
}
