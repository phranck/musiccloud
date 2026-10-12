/**
 * @file Token-generation and hashing service for the API-access system
 * (MC-025/MC-077). Framework-free: produces live API tokens developers
 * send as `X-API-Key`, the SHA-256 hash that is the only form ever persisted,
 * and the shape a token takes in a response. The route layer owns persistence
 * and authorization; this module owns only the token shape.
 */
import crypto from "node:crypto";
import { API_TOKEN_PREFIX } from "@musiccloud/shared";
import type { ApiClientToken } from "../db/api-access-repository.js";

const LIVE_API_TOKEN_RE = new RegExp(`^${API_TOKEN_PREFIX}_[a-z0-9]{12}_[A-Za-z0-9_-]{32,}$`);

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
  const raw = `${API_TOKEN_PREFIX}_${prefix}_${randomUrlSafe(32)}`;
  return { raw, prefix, hash: hashApiToken(raw) };
}

/**
 * Hashes a raw token for persistence and lookup-equality comparison. Never
 * log or persist the raw token itself, only this hash and the `prefix`.
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
 * token-hash lookup instead of the internal-key comparison. This checks the
 * shape only, and the database lookup decides whether the token is valid.
 *
 * @param value - The raw header value.
 * @returns `true` when the value matches the released live-token format.
 */
export function looksLikeApiAccessToken(value: string): boolean {
  return LIVE_API_TOKEN_RE.test(value);
}

/**
 * A token as both the developer routes and the admin routes answer with it.
 *
 * It never carries `tokenHash`. The create and rotate handlers add the one-time
 * raw token to their own response beside this.
 *
 * @param token - The stored token.
 * @returns The response shape, with timestamps as ISO-8601 strings.
 */
export function toTokenResponse(token: ApiClientToken) {
  return {
    id: token.id,
    tokenPrefix: token.tokenPrefix,
    status: token.status,
    createdAt: new Date(token.createdAt).toISOString(),
    lastUsedAt: token.lastUsedAt ? new Date(token.lastUsedAt).toISOString() : null,
    revokedAt: token.revokedAt ? new Date(token.revokedAt).toISOString() : null,
  };
}
