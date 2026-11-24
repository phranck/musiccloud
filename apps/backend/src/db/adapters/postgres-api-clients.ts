/**
 * API client registrations: create, read, list by account or project, count
 * against the per-project ceiling, and update. Every read goes through
 * `CLIENT_JOIN_SELECT`, so each DTO carries its resolved quota fields.
 *
 * `postgres-api-access.ts` re-exports every function here, so importers keep
 * using that module.
 */

import type { ApiClientStatusValue } from "@musiccloud/shared";
import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type { ApiClient } from "../api-access-repository.js";
import { type ApiClientRow, CLIENT_JOIN_SELECT, rowToApiClient } from "./postgres-api-access-rows.js";

// ============================================================================
// CLIENTS
// ============================================================================

/**
 * Inserts a new registration. Rate-limit fields default to `NULL`, so the
 * registration uses its owning project's limits. The full JOIN shape is
 * re-read so the returned DTO carries the resolved quota fields.
 */
export async function createApiClient(
  pool: Pool,
  data: {
    developerAccountId: string;
    projectId?: string | null;
    registrationType?: "development" | "confidential" | "public";
    capabilities?: string[];
    appName: string;
    contactEmail: string;
    description: string;
    websiteUrl?: string | null;
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
    createdByAdminId?: string | null;
  },
): Promise<ApiClient> {
  const now = new Date();
  const id = nanoid();
  const inserted = await pool.query(
    `INSERT INTO api_clients
       (id, developer_account_id, project_id, registration_type, capabilities, app_name, contact_email,
        description, website_url, requests_per_minute, requests_per_day, created_at, updated_at, created_by_admin_id)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13
     WHERE $3::text IS NULL OR EXISTS (
       SELECT 1 FROM developer_projects p
       WHERE p.id = $3 AND p.developer_account_id = $2 AND p.status <> 'deleted'
     )`,
    [
      id,
      data.developerAccountId,
      data.projectId ?? null,
      data.registrationType ?? "development",
      JSON.stringify(data.capabilities ?? ["legacy_api_key"]),
      data.appName,
      data.contactEmail,
      data.description,
      data.websiteUrl ?? null,
      data.requestsPerMinute ?? null,
      data.requestsPerDay ?? null,
      now,
      data.createdByAdminId ?? null,
    ],
  );
  if (inserted.rowCount === 0) {
    throw new Error("Developer project is not owned by the registration account or is deleted.");
  }
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

export async function listApiClientsByProject(pool: Pool, projectId: string): Promise<ApiClient[]> {
  const result = await pool.query(`${CLIENT_JOIN_SELECT} WHERE c.project_id = $1 ORDER BY c.created_at DESC`, [
    projectId,
  ]);
  return result.rows.map((row) => rowToApiClient(row as ApiClientRow));
}

/**
 * Counts the registrations a project currently holds, meaning every
 * registration that has not been revoked. A suspended registration counts,
 * because a suspension is reversible and the registration still exists.
 * Served by `idx_api_clients_project_status`.
 *
 * @param pool - The Postgres pool.
 * @param projectId - The owning project.
 * @returns The number of registrations that count against the per-project ceiling.
 */
export async function countActiveApiClientsByProject(pool: Pool, projectId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM api_clients WHERE project_id = $1 AND status <> 'revoked'`,
    [projectId],
  );
  return (result.rows[0] as { cnt: number }).cnt;
}

export async function listApiClients(pool: Pool, status?: string): Promise<ApiClient[]> {
  const result = status
    ? await pool.query(`${CLIENT_JOIN_SELECT} WHERE c.status = $1 ORDER BY c.created_at DESC`, [status])
    : await pool.query(`${CLIENT_JOIN_SELECT} ORDER BY c.created_at DESC`);
  return result.rows.map((row) => rowToApiClient(row as ApiClientRow));
}

/**
 * Patches a registration. `undefined` fields stay untouched; an explicit
 * `null` clears a registration cap so the project limit applies again. This
 * is why the SET list is built dynamically
 * instead of using `COALESCE`. The JOIN shape is re-read after the update.
 */
export async function updateApiClient(
  pool: Pool,
  id: string,
  data: {
    status?: ApiClientStatusValue;
    websiteUrl?: string | null;
    description?: string;
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
  },
): Promise<ApiClient | null> {
  const sets: string[] = ["updated_at = $1"];
  const values: unknown[] = [new Date()];
  let idx = 2;

  if (data.status !== undefined) {
    sets.push(`status = $${idx++}`);
    values.push(data.status);
  }
  if (data.websiteUrl !== undefined) {
    sets.push(`website_url = $${idx++}`);
    values.push(data.websiteUrl);
  }
  if (data.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(data.description);
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
