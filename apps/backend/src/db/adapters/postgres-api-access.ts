/**
 * API-access domain: persistence for requests, clients, tokens and the
 * audit trail (MC-025/MC-077). New ids are nanoid-generated here, matching
 * `postgres-developer.ts`. Timestamp columns are mapped to epoch
 * milliseconds via {@link dateToMs}.
 */

import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type { ApiAccessAuditEvent, ApiAccessRequest, ApiClient, ApiClientToken } from "../api-access-repository.js";
import { FALLBACK_REQUESTS_PER_DAY, FALLBACK_REQUESTS_PER_MINUTE } from "../tiers-repository.js";
import { dateToMs } from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

interface ApiAccessRequestRow {
  id: string;
  developer_account_id: string;
  contact_email: string;
  app_name: string;
  app_description: string;
  estimated_requests_per_day: number;
  status: string;
  submitted_at: Date;
  reviewed_at: Date | null;
  reviewed_by_admin_id: string | null;
  review_note: string | null;
}

/**
 * Raw shape of the client JOIN used by every client read: the `api_clients`
 * row plus the owning account's tier columns (all `null` when the account
 * has no tier assigned).
 */
interface ApiClientRow {
  id: string;
  request_id: string | null;
  developer_account_id: string;
  app_name: string;
  contact_email: string;
  description: string;
  status: string;
  requests_per_minute: number | null;
  requests_per_day: number | null;
  tier_id: string | null;
  tier_name: string | null;
  tier_requests_per_minute: number | null;
  tier_requests_per_day: number | null;
  created_at: Date;
  updated_at: Date;
  created_by_admin_id: string | null;
}

interface ApiClientTokenRow {
  id: string;
  client_id: string;
  token_prefix: string;
  token_hash: string;
  token_raw: string | null;
  status: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  rotated_from_token_id: string | null;
}

interface ApiAccessAuditEventRow {
  id: string;
  client_id: string | null;
  request_id: string | null;
  token_id: string | null;
  event_type: string;
  actor_admin_id: string | null;
  actor_developer_account_id: string | null;
  occurred_at: Date;
  event_data: Record<string, unknown>;
}

const REQUEST_COLUMNS = `id, developer_account_id, contact_email, app_name, app_description,
            estimated_requests_per_day, status, submitted_at, reviewed_at, reviewed_by_admin_id, review_note`;
/**
 * Every client read goes through this JOIN so the DTO always carries the
 * owning account's tier limits next to the per-key overrides (MC-100). The
 * account join is INNER (every client has an account, FK NOT NULL); the
 * tier join is LEFT (accounts may be unassigned).
 */
const CLIENT_JOIN_SELECT = `SELECT c.id, c.request_id, c.developer_account_id, c.app_name, c.contact_email,
            c.description, c.status, c.requests_per_minute, c.requests_per_day, c.created_at, c.updated_at,
            c.created_by_admin_id, da.tier_id AS tier_id, t.name AS tier_name,
            t.requests_per_minute AS tier_requests_per_minute, t.requests_per_day AS tier_requests_per_day
     FROM api_clients c
     JOIN developer_accounts da ON da.id = c.developer_account_id
     LEFT JOIN tiers t ON t.id = da.tier_id`;
const TOKEN_COLUMNS = `id, client_id, token_prefix, token_hash, token_raw, status, created_at, last_used_at,
            revoked_at, rotated_from_token_id`;
const AUDIT_COLUMNS = `id, client_id, request_id, token_id, event_type, actor_admin_id,
            actor_developer_account_id, occurred_at, event_data`;

// ============================================================================
// MAPPERS
// ============================================================================

function rowToApiAccessRequest(row: ApiAccessRequestRow): ApiAccessRequest {
  return {
    id: row.id,
    developerAccountId: row.developer_account_id,
    contactEmail: row.contact_email,
    appName: row.app_name,
    appDescription: row.app_description,
    estimatedRequestsPerDay: row.estimated_requests_per_day,
    status: row.status,
    submittedAt: dateToMs(row.submitted_at),
    reviewedAt: row.reviewed_at ? dateToMs(row.reviewed_at) : null,
    reviewedByAdminId: row.reviewed_by_admin_id,
    reviewNote: row.review_note,
  };
}

/**
 * Maps a client JOIN row to the {@link ApiClient} DTO. The effective limits
 * are resolved here — in exactly one place — as
 * `per-key override ?? tier limit ?? conservative fallback`.
 */
function rowToApiClient(row: ApiClientRow): ApiClient {
  return {
    id: row.id,
    requestId: row.request_id,
    developerAccountId: row.developer_account_id,
    appName: row.app_name,
    contactEmail: row.contact_email,
    description: row.description,
    status: row.status,
    requestsPerMinute: row.requests_per_minute,
    requestsPerDay: row.requests_per_day,
    tierId: row.tier_id,
    tierName: row.tier_name,
    tierRequestsPerMinute: row.tier_requests_per_minute,
    tierRequestsPerDay: row.tier_requests_per_day,
    effectiveRequestsPerMinute: row.requests_per_minute ?? row.tier_requests_per_minute ?? FALLBACK_REQUESTS_PER_MINUTE,
    effectiveRequestsPerDay: row.requests_per_day ?? row.tier_requests_per_day ?? FALLBACK_REQUESTS_PER_DAY,
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
    createdByAdminId: row.created_by_admin_id,
  };
}

function rowToApiClientToken(row: ApiClientTokenRow): ApiClientToken {
  return {
    id: row.id,
    clientId: row.client_id,
    tokenPrefix: row.token_prefix,
    tokenHash: row.token_hash,
    rawToken: row.token_raw,
    status: row.status,
    createdAt: dateToMs(row.created_at),
    lastUsedAt: row.last_used_at ? dateToMs(row.last_used_at) : null,
    revokedAt: row.revoked_at ? dateToMs(row.revoked_at) : null,
    rotatedFromTokenId: row.rotated_from_token_id,
  };
}

function rowToApiAccessAuditEvent(row: ApiAccessAuditEventRow): ApiAccessAuditEvent {
  return {
    id: row.id,
    clientId: row.client_id,
    requestId: row.request_id,
    tokenId: row.token_id,
    eventType: row.event_type,
    actorAdminId: row.actor_admin_id,
    actorDeveloperAccountId: row.actor_developer_account_id,
    occurredAt: dateToMs(row.occurred_at),
    eventData: row.event_data ?? {},
  };
}

// ============================================================================
// REQUESTS
// ============================================================================

export async function createApiAccessRequest(
  pool: Pool,
  data: {
    developerAccountId: string;
    contactEmail: string;
    appName: string;
    appDescription: string;
    estimatedRequestsPerDay: number;
  },
): Promise<ApiAccessRequest> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_access_requests
       (id, developer_account_id, contact_email, app_name, app_description, estimated_requests_per_day, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${REQUEST_COLUMNS}`,
    [
      nanoid(),
      data.developerAccountId,
      data.contactEmail,
      data.appName,
      data.appDescription,
      data.estimatedRequestsPerDay,
      now,
    ],
  );
  return rowToApiAccessRequest(result.rows[0] as ApiAccessRequestRow);
}

export async function findApiAccessRequestById(pool: Pool, id: string): Promise<ApiAccessRequest | null> {
  const result = await pool.query(`SELECT ${REQUEST_COLUMNS} FROM api_access_requests WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToApiAccessRequest(result.rows[0] as ApiAccessRequestRow);
}

export async function listApiAccessRequestsByDeveloperAccount(
  pool: Pool,
  developerAccountId: string,
): Promise<ApiAccessRequest[]> {
  const result = await pool.query(
    `SELECT ${REQUEST_COLUMNS} FROM api_access_requests WHERE developer_account_id = $1 ORDER BY submitted_at DESC`,
    [developerAccountId],
  );
  return result.rows.map((row) => rowToApiAccessRequest(row as ApiAccessRequestRow));
}

export async function listApiAccessRequests(pool: Pool, status?: string): Promise<ApiAccessRequest[]> {
  const result = status
    ? await pool.query(
        `SELECT ${REQUEST_COLUMNS} FROM api_access_requests WHERE status = $1 ORDER BY submitted_at DESC`,
        [status],
      )
    : await pool.query(`SELECT ${REQUEST_COLUMNS} FROM api_access_requests ORDER BY submitted_at DESC`);
  return result.rows.map((row) => rowToApiAccessRequest(row as ApiAccessRequestRow));
}

export async function reviewApiAccessRequest(
  pool: Pool,
  id: string,
  data: { status: "approved" | "rejected"; reviewedByAdminId: string; reviewNote?: string | null },
): Promise<ApiAccessRequest | null> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE api_access_requests
     SET status = $1, reviewed_at = $2, reviewed_by_admin_id = $3, review_note = $4
     WHERE id = $5
     RETURNING ${REQUEST_COLUMNS}`,
    [data.status, now, data.reviewedByAdminId, data.reviewNote ?? null, id],
  );
  if (result.rows.length === 0) return null;
  return rowToApiAccessRequest(result.rows[0] as ApiAccessRequestRow);
}

// ============================================================================
// CLIENTS
// ============================================================================

/**
 * Inserts a new client. Rate-limit fields default to `NULL` (= inherit the
 * owning account's tier limits); the full JOIN shape is re-read after the
 * insert so the returned DTO carries the resolved tier/effective fields.
 */
export async function createApiClient(
  pool: Pool,
  data: {
    requestId?: string | null;
    developerAccountId: string;
    appName: string;
    contactEmail: string;
    description: string;
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
    createdByAdminId?: string | null;
  },
): Promise<ApiClient> {
  const now = new Date();
  const id = nanoid();
  await pool.query(
    `INSERT INTO api_clients
       (id, request_id, developer_account_id, app_name, contact_email, description,
        requests_per_minute, requests_per_day, created_at, updated_at, created_by_admin_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)`,
    [
      id,
      data.requestId ?? null,
      data.developerAccountId,
      data.appName,
      data.contactEmail,
      data.description,
      data.requestsPerMinute ?? null,
      data.requestsPerDay ?? null,
      now,
      data.createdByAdminId ?? null,
    ],
  );
  const created = await findApiClientById(pool, id);
  if (!created) throw new Error(`api_client vanished right after insert: ${id}`);
  return created;
}

export async function findApiClientById(pool: Pool, id: string): Promise<ApiClient | null> {
  const result = await pool.query(`${CLIENT_JOIN_SELECT} WHERE c.id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToApiClient(result.rows[0] as ApiClientRow);
}

export async function listApiClientsByDeveloperAccount(pool: Pool, developerAccountId: string): Promise<ApiClient[]> {
  const result = await pool.query(
    `${CLIENT_JOIN_SELECT} WHERE c.developer_account_id = $1 ORDER BY c.created_at DESC`,
    [developerAccountId],
  );
  return result.rows.map((row) => rowToApiClient(row as ApiClientRow));
}

export async function listApiClients(pool: Pool, status?: string): Promise<ApiClient[]> {
  const result = status
    ? await pool.query(`${CLIENT_JOIN_SELECT} WHERE c.status = $1 ORDER BY c.created_at DESC`, [status])
    : await pool.query(`${CLIENT_JOIN_SELECT} ORDER BY c.created_at DESC`);
  return result.rows.map((row) => rowToApiClient(row as ApiClientRow));
}

/**
 * Patches a client. `undefined` fields stay untouched; an explicit `null`
 * for a rate-limit field clears the per-key override (the client inherits
 * the tier limit again) — which is why this builds the SET list dynamically
 * instead of using `COALESCE`. The JOIN shape is re-read after the update.
 */
export async function updateApiClient(
  pool: Pool,
  id: string,
  data: { status?: string; requestsPerMinute?: number | null; requestsPerDay?: number | null },
): Promise<ApiClient | null> {
  const sets: string[] = ["updated_at = $1"];
  const values: unknown[] = [new Date()];
  let idx = 2;

  if (data.status !== undefined) {
    sets.push(`status = $${idx++}`);
    values.push(data.status);
  }
  if (data.requestsPerMinute !== undefined) {
    sets.push(`requests_per_minute = $${idx++}`);
    values.push(data.requestsPerMinute);
  }
  if (data.requestsPerDay !== undefined) {
    sets.push(`requests_per_day = $${idx++}`);
    values.push(data.requestsPerDay);
  }

  values.push(id);
  const result = await pool.query(`UPDATE api_clients SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`, values);
  if (result.rows.length === 0) return null;
  return findApiClientById(pool, id);
}

// ============================================================================
// TOKENS
// ============================================================================

export async function createApiClientToken(
  pool: Pool,
  data: {
    clientId: string;
    tokenPrefix: string;
    tokenHash: string;
    rawToken: string;
    rotatedFromTokenId?: string | null;
  },
): Promise<ApiClientToken> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_client_tokens (id, client_id, token_prefix, token_hash, token_raw, created_at, rotated_from_token_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${TOKEN_COLUMNS}`,
    [nanoid(), data.clientId, data.tokenPrefix, data.tokenHash, data.rawToken, now, data.rotatedFromTokenId ?? null],
  );
  return rowToApiClientToken(result.rows[0] as ApiClientTokenRow);
}

export async function listApiClientTokensByClient(pool: Pool, clientId: string): Promise<ApiClientToken[]> {
  const result = await pool.query(
    `SELECT ${TOKEN_COLUMNS} FROM api_client_tokens WHERE client_id = $1 ORDER BY created_at DESC`,
    [clientId],
  );
  return result.rows.map((row) => rowToApiClientToken(row as ApiClientTokenRow));
}

export async function findApiClientTokenById(pool: Pool, id: string): Promise<ApiClientToken | null> {
  const result = await pool.query(`SELECT ${TOKEN_COLUMNS} FROM api_client_tokens WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToApiClientToken(result.rows[0] as ApiClientTokenRow);
}

/**
 * Resolves a raw-token hash to its active client for public-API auth
 * (MC-088). Two indexed reads: token by `uq_api_client_tokens_hash`, then
 * the client JOIN (client → account → tier) by PK, so the returned client
 * carries the effective limits that `authenticatePublic` enforces (MC-100).
 * Misses (unknown hash, non-active token, non-active client) all return
 * `null`.
 */
export async function findActiveApiClientByTokenHash(
  pool: Pool,
  tokenHash: string,
): Promise<{ client: ApiClient; token: ApiClientToken } | null> {
  const tokenResult = await pool.query(
    `SELECT ${TOKEN_COLUMNS} FROM api_client_tokens WHERE token_hash = $1 AND status = 'active'`,
    [tokenHash],
  );
  if (tokenResult.rows.length === 0) return null;
  const token = rowToApiClientToken(tokenResult.rows[0] as ApiClientTokenRow);

  const clientResult = await pool.query(`${CLIENT_JOIN_SELECT} WHERE c.id = $1 AND c.status = 'active'`, [
    token.clientId,
  ]);
  if (clientResult.rows.length === 0) return null;
  return { client: rowToApiClient(clientResult.rows[0] as ApiClientRow), token };
}

/**
 * Stamps a token's `last_used_at` to now. Single cheap UPDATE — called
 * fire-and-forget from the auth hot path, so it must not grow heavier.
 */
export async function touchApiClientTokenLastUsed(pool: Pool, tokenId: string): Promise<void> {
  await pool.query(`UPDATE api_client_tokens SET last_used_at = $1 WHERE id = $2`, [new Date(), tokenId]);
}

export async function revokeApiClientToken(pool: Pool, id: string): Promise<ApiClientToken | null> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE api_client_tokens SET status = 'revoked', revoked_at = COALESCE(revoked_at, $1)
     WHERE id = $2
     RETURNING ${TOKEN_COLUMNS}`,
    [now, id],
  );
  if (result.rows.length === 0) return null;
  return rowToApiClientToken(result.rows[0] as ApiClientTokenRow);
}

export async function activateApiClientToken(pool: Pool, id: string): Promise<ApiClientToken | null> {
  const result = await pool.query(
    `UPDATE api_client_tokens SET status = 'active', revoked_at = NULL
     WHERE id = $1 AND status = 'revoked'
     RETURNING ${TOKEN_COLUMNS}`,
    [id],
  );
  if (result.rows.length === 0) return null;
  return rowToApiClientToken(result.rows[0] as ApiClientTokenRow);
}

/**
 * Atomically rotates a token: marks it `"rotated"` and inserts a new active
 * token on the same client. Runs on a dedicated transaction client
 * (pattern: `postgres-shared.ts` `insertExternalIds`).
 */
export async function rotateApiClientToken(
  pool: Pool,
  id: string,
  data: { newTokenPrefix: string; newTokenHash: string },
): Promise<{ oldToken: ApiClientToken; newToken: ApiClientToken } | null> {
  const now = new Date();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const oldResult = await client.query(
      `UPDATE api_client_tokens SET status = 'rotated'
       WHERE id = $1 AND status = 'active'
       RETURNING ${TOKEN_COLUMNS}`,
      [id],
    );
    if (oldResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const oldToken = rowToApiClientToken(oldResult.rows[0] as ApiClientTokenRow);
    const newResult = await client.query(
      `INSERT INTO api_client_tokens (id, client_id, token_prefix, token_hash, created_at, rotated_from_token_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${TOKEN_COLUMNS}`,
      [nanoid(), oldToken.clientId, data.newTokenPrefix, data.newTokenHash, now, oldToken.id],
    );
    await client.query("COMMIT");
    return { oldToken, newToken: rowToApiClientToken(newResult.rows[0] as ApiClientTokenRow) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// AUDIT EVENTS
// ============================================================================

export async function countPendingApiAccessRequests(pool: Pool): Promise<number> {
  const result = await pool.query(`SELECT COUNT(*)::int AS cnt FROM api_access_requests WHERE status = 'pending'`);
  return (result.rows[0] as { cnt: number }).cnt;
}

export async function createApiAccessAuditEvent(
  pool: Pool,
  data: {
    clientId?: string | null;
    requestId?: string | null;
    tokenId?: string | null;
    eventType: string;
    actorAdminId?: string | null;
    actorDeveloperAccountId?: string | null;
    eventData?: Record<string, unknown>;
  },
): Promise<ApiAccessAuditEvent> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_access_audit_events
       (id, client_id, request_id, token_id, event_type, actor_admin_id, actor_developer_account_id, occurred_at, event_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${AUDIT_COLUMNS}`,
    [
      nanoid(),
      data.clientId ?? null,
      data.requestId ?? null,
      data.tokenId ?? null,
      data.eventType,
      data.actorAdminId ?? null,
      data.actorDeveloperAccountId ?? null,
      now,
      JSON.stringify(data.eventData ?? {}),
    ],
  );
  return rowToApiAccessAuditEvent(result.rows[0] as ApiAccessAuditEventRow);
}
