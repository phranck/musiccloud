/**
 * @file Token-generation and hashing service for the API-access system
 * (MC-025/MC-077). Framework-free: produces the opaque
 * `mc_live_<prefix>_<secret>` bearer token developers send as `X-API-Key`
 * (already shown in the live landing/docs pages), and the SHA-256 hash
 * that is the only form ever persisted. The route layer owns persistence
 * and authorization; this module owns only the token shape.
 */
import crypto from "node:crypto";

/** Label every issued API-access token starts with. */
const TOKEN_LABEL = "mc_live";

/**
 * A freshly generated token: `raw` is returned to the caller exactly once
 * (the API response body of a create/rotate call) and never stored;
 * `prefix` and `hash` are what gets persisted.
 */
export interface GeneratedApiToken {
  /** Full token, shown to the caller once. */
  raw: string;
  /** Short, non-secret identifier stored in the clear for display/lookup. */
  prefix: string;
  /** Hex-encoded SHA-256 of `raw`; the only form persisted. */
  hash: string;
}

/**
 * Generates a new opaque API-access token in the form
 * `mc_live_<prefix>_<secret>`: `prefix` is a short, display-safe lookup
 * identifier; `secret` is the high-entropy part that makes the token
 * unguessable. Both are `crypto.randomBytes`-derived.
 *
 * @returns The raw token plus its stored prefix and hash.
 */
export function generateApiToken(): GeneratedApiToken {
  const prefix = crypto.randomBytes(6).toString("base64url");
  const secret = crypto.randomBytes(24).toString("base64url");
  const raw = `${TOKEN_LABEL}_${prefix}_${secret}`;
  return { raw, prefix, hash: hashApiToken(raw) };
}

/**
 * Hashes a raw token for persistence and lookup-equality comparison. Never
 * log or persist the raw token itself — only this hash and the `prefix`.
 *
 * @param rawToken - The full `mc_live_...` token.
 * @returns Hex-encoded SHA-256 digest.
 */
export function hashApiToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Formats a token prefix for display in a list (developer's own key list,
 * or the admin client-detail view). Never touches the secret half.
 *
 * @param prefix - The token's stored `tokenPrefix`.
 * @returns A masked display string, e.g. `mc_live_AbC123••••••••`.
 */
export function formatApiTokenForDisplay(prefix: string): string {
  return `${TOKEN_LABEL}_${prefix}••••••••`;
}
