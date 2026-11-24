/**
 * API client tokens: issue, list, read, resolve a token hash for public-API
 * auth, stamp last use, revoke, reactivate, and rotate. Only token hashes and
 * display prefixes are stored.
 *
 * `postgres-api-access.ts` re-exports every function here, so importers keep
 * using that module.
 */

import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type { ApiClient, ApiClientToken, DeveloperProject } from "../api-access-repository.js";
import {
  type ApiClientRow,
  type ApiClientTokenRow,
  CLIENT_JOIN_SELECT,
  effectiveLimit,
  rowToApiClient,
  rowToApiClientToken,
  TOKEN_COLUMNS,
} from "./postgres-api-access-rows.js";
import { dateToMs } from "./postgres-shared.js";

// ============================================================================
// TOKENS
// ============================================================================

/**
 * Persists a newly issued token. Only its hash and its display prefix are
 * written; the token itself never reaches the database, so the response that
 * issues it is the one and only place it exists.
 *
 * @param pool - The Postgres pool.
 * @param data - The owning registration, the display prefix, the hash, and the token this one replaces.
 * @returns The stored token row.
 */
export async function createApiClientToken(
  pool: Pool,
  data: {
    clientId: string;
    tokenPrefix: string;
    tokenHash: string;
    rotatedFromTokenId?: string | null;
  },
): Promise<ApiClientToken> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_client_tokens (id, client_id, token_prefix, token_hash, created_at, rotated_from_token_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${TOKEN_COLUMNS}`,
    [nanoid(), data.clientId, data.tokenPrefix, data.tokenHash, now, data.rotatedFromTokenId ?? null],
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
 * Resolves a raw-token hash to its active project and registration for
 * public-API auth. Two indexed reads load the token and then the complete
 * project/registration quota context. Every inactive or unknown credential
 * combination returns `null`.
 */
export async function findActiveApiClientByTokenHash(
  pool: Pool,
  tokenHash: string,
): Promise<{ project: DeveloperProject; client: ApiClient; token: ApiClientToken } | null> {
  const tokenResult = await pool.query(
    `SELECT ${TOKEN_COLUMNS} FROM api_client_tokens WHERE token_hash = $1 AND status = 'active'`,
    [tokenHash],
  );
  if (tokenResult.rows.length === 0) return null;
  const token = rowToApiClientToken(tokenResult.rows[0] as ApiClientTokenRow);

  const clientResult = await pool.query(
    `${CLIENT_JOIN_SELECT} WHERE c.id = $1 AND c.status = 'active' AND (p.id IS NULL OR p.status = 'active')`,
    [token.clientId],
  );
  if (clientResult.rows.length === 0) return null;
  const row = clientResult.rows[0] as ApiClientRow;
  const client = rowToApiClient(row);
  // A registration without a project row is a legacy one, and its project
  // fields are synthesised from the registration so callers see one shape
  // either way. Everything the plan decides is the same in both cases.
  const projectId = row.project_id;
  const project: DeveloperProject = {
    id: projectId ?? client.projectId,
    developerAccountId:
      projectId === null ? client.developerAccountId : (row.project_developer_account_id ?? row.developer_account_id),
    displayName: client.projectDisplayName,
    status: client.projectStatus,
    requestsPerMinute: client.projectRequestsPerMinute,
    requestsPerDay: client.projectRequestsPerDay,
    tierId: client.tierId,
    tierName: client.tierName,
    tierRequestsPerMinute: client.tierRequestsPerMinute,
    tierRequestsPerDay: client.tierRequestsPerDay,
    effectiveRequestsPerMinute: effectiveLimit(client.projectRequestsPerMinute, client.tierRequestsPerMinute),
    effectiveRequestsPerDay: effectiveLimit(client.projectRequestsPerDay, client.tierRequestsPerDay),
    createdAt: projectId === null ? client.createdAt : dateToMs(row.project_created_at ?? row.created_at),
    updatedAt: projectId === null ? client.updatedAt : dateToMs(row.project_updated_at ?? row.updated_at),
    suspendedAt: row.project_suspended_at ? dateToMs(row.project_suspended_at) : null,
    deletedAt: row.project_deleted_at ? dateToMs(row.project_deleted_at) : null,
    createdByAdminId: projectId === null ? client.createdByAdminId : row.project_created_by_admin_id,
  };
  return { project, client, token };
}

/**
 * Stamps a token's `last_used_at` to now with a single cheap UPDATE. It is
 * called fire-and-forget from the auth hot path, so it must not grow heavier.
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
