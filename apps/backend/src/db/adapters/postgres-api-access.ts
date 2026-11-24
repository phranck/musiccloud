/**
 * API-access domain: persistence for projects, registrations, tokens,
 * usage and the audit trail (MC-025/MC-077/MC-143). New ids are nanoid-generated here, matching
 * `postgres-developer.ts`.
 *
 * Row types, SQL fragments and mappers live in `postgres-api-access-rows.ts`.
 * Only `GRANTING_SUBSCRIPTION_STATES` is re-exported from it.
 */

import type { ApiClientStatusValue } from "@musiccloud/shared";
import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type {
  ApiAccessAuditEntry,
  ApiAccessAuditEvent,
  ApiClient,
  ApiClientToken,
  ApiUsageEvent,
  ApiUsageSummary,
  DeveloperProject,
  DeveloperProjectSubscription,
  UsageBucketValue,
} from "../api-access-repository.js";
import {
  type ApiAccessAuditEventRow,
  type ApiClientRow,
  type ApiClientTokenRow,
  type ApiUsageEventRow,
  AUDIT_COLUMNS,
  CLIENT_JOIN_SELECT,
  type DeveloperProjectRow,
  type DeveloperProjectSubscriptionRow,
  effectiveLimit,
  PROJECT_JOIN_SELECT,
  rowToApiAccessAuditEvent,
  rowToApiClient,
  rowToApiClientToken,
  rowToApiUsageEvent,
  rowToDeveloperProject,
  rowToDeveloperProjectSubscription,
  SUBSCRIPTION_COLUMNS,
  TOKEN_COLUMNS,
  USAGE_COLUMNS,
} from "./postgres-api-access-rows.js";
import { dateToMs } from "./postgres-shared.js";

export { GRANTING_SUBSCRIPTION_STATES } from "./postgres-api-access-rows.js";

// ============================================================================
// PROJECTS + PROJECT SUBSCRIPTIONS
// ============================================================================

export async function createDeveloperProject(
  pool: Pool,
  data: {
    developerAccountId: string;
    displayName: string;
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
    tierId?: string | null;
    createdByAdminId?: string | null;
  },
): Promise<DeveloperProject> {
  const client = await pool.connect();
  const projectId = nanoid();
  const now = new Date();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO developer_projects
         (id, developer_account_id, display_name, requests_per_minute, requests_per_day, created_at, updated_at,
          created_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
      [
        projectId,
        data.developerAccountId,
        data.displayName,
        data.requestsPerMinute ?? null,
        data.requestsPerDay ?? null,
        now,
        data.createdByAdminId ?? null,
      ],
    );
    await client.query(
      `INSERT INTO developer_project_subscriptions (id, project_id, tier_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [nanoid(), projectId, data.tierId ?? null, now],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const created = await findDeveloperProjectById(pool, projectId);
  if (!created) throw new Error(`developer_project vanished right after insert: ${projectId}`);
  return created;
}

export async function findDeveloperProjectById(pool: Pool, id: string): Promise<DeveloperProject | null> {
  const result = await pool.query(`${PROJECT_JOIN_SELECT} WHERE p.id = $1`, [id]);
  return result.rows.length === 0 ? null : rowToDeveloperProject(result.rows[0] as DeveloperProjectRow);
}

export async function listDeveloperProjectsByAccount(
  pool: Pool,
  developerAccountId: string,
): Promise<DeveloperProject[]> {
  const result = await pool.query(
    `${PROJECT_JOIN_SELECT} WHERE p.developer_account_id = $1 AND p.status <> 'deleted' ORDER BY p.created_at DESC`,
    [developerAccountId],
  );
  return result.rows.map((row) => rowToDeveloperProject(row as DeveloperProjectRow));
}

/**
 * Counts the projects an account currently holds, meaning every project that
 * has not been soft-deleted. Served by `idx_developer_projects_account_status`.
 *
 * A suspended project still occupies its place and can be reactivated, so it
 * counts. Only a deleted one frees a slot; without that, an account could hold
 * any number of projects by suspending them.
 *
 * @param pool - The Postgres pool.
 * @param developerAccountId - The owning developer account.
 * @returns The number of projects that count against the per-account ceiling.
 */
export async function countDeveloperProjectsAgainstCeiling(pool: Pool, developerAccountId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM developer_projects
     WHERE developer_account_id = $1 AND status <> 'deleted'`,
    [developerAccountId],
  );
  return (result.rows[0] as { cnt: number }).cnt;
}

export async function updateDeveloperProject(
  pool: Pool,
  id: string,
  data: {
    displayName?: string;
    status?: "active" | "suspended" | "deleted";
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
  },
): Promise<DeveloperProject | null> {
  const sets = ["updated_at = $1"];
  const values: unknown[] = [new Date()];
  let idx = 2;
  if (data.displayName !== undefined) {
    sets.push(`display_name = $${idx++}`);
    values.push(data.displayName);
  }
  if (data.status !== undefined) {
    sets.push(`status = $${idx++}`);
    values.push(data.status);
    sets.push(
      data.status === "suspended"
        ? "suspended_at = COALESCE(suspended_at, NOW()), deleted_at = NULL"
        : data.status === "deleted"
          ? "deleted_at = COALESCE(deleted_at, NOW())"
          : "suspended_at = NULL, deleted_at = NULL",
    );
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
  const result = await pool.query(
    `UPDATE developer_projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`,
    values,
  );
  return result.rows.length === 0 ? null : findDeveloperProjectById(pool, id);
}

export async function setDeveloperProjectSubscription(
  pool: Pool,
  data: {
    projectId: string;
    tierId: string | null;
    creemSubscriptionId?: string | null;
    creemCustomerId?: string | null;
    status?: string;
    interval?: string | null;
    currentPeriodEnd?: number | null;
    cancelAtPeriodEnd?: boolean;
  },
): Promise<DeveloperProjectSubscription> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO developer_project_subscriptions
       (id, project_id, tier_id, creem_subscription_id, creem_customer_id, status, interval,
        current_period_end, cancel_at_period_end, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     ON CONFLICT (project_id) DO UPDATE SET
       tier_id = EXCLUDED.tier_id,
       creem_subscription_id = CASE WHEN $11::boolean THEN EXCLUDED.creem_subscription_id
                                    ELSE developer_project_subscriptions.creem_subscription_id END,
       creem_customer_id = CASE WHEN $12::boolean THEN EXCLUDED.creem_customer_id
                                ELSE developer_project_subscriptions.creem_customer_id END,
       status = CASE WHEN $13::boolean THEN EXCLUDED.status ELSE developer_project_subscriptions.status END,
       interval = CASE WHEN $14::boolean THEN EXCLUDED.interval ELSE developer_project_subscriptions.interval END,
       current_period_end = CASE WHEN $15::boolean THEN EXCLUDED.current_period_end
                                 ELSE developer_project_subscriptions.current_period_end END,
       cancel_at_period_end = CASE WHEN $16::boolean THEN EXCLUDED.cancel_at_period_end
                                   ELSE developer_project_subscriptions.cancel_at_period_end END,
       updated_at = EXCLUDED.updated_at
     RETURNING ${SUBSCRIPTION_COLUMNS}`,
    [
      nanoid(),
      data.projectId,
      data.tierId,
      data.creemSubscriptionId ?? null,
      data.creemCustomerId ?? null,
      data.status ?? "active",
      data.interval ?? null,
      data.currentPeriodEnd === null || data.currentPeriodEnd === undefined ? null : new Date(data.currentPeriodEnd),
      data.cancelAtPeriodEnd ?? false,
      now,
      data.creemSubscriptionId !== undefined,
      data.creemCustomerId !== undefined,
      data.status !== undefined,
      data.interval !== undefined,
      data.currentPeriodEnd !== undefined,
      data.cancelAtPeriodEnd !== undefined,
    ],
  );
  return rowToDeveloperProjectSubscription(result.rows[0] as DeveloperProjectSubscriptionRow);
}

export async function findDeveloperProjectSubscription(
  pool: Pool,
  projectId: string,
): Promise<DeveloperProjectSubscription | null> {
  const result = await pool.query(
    `SELECT ${SUBSCRIPTION_COLUMNS} FROM developer_project_subscriptions WHERE project_id = $1`,
    [projectId],
  );
  return result.rows.length === 0
    ? null
    : rowToDeveloperProjectSubscription(result.rows[0] as DeveloperProjectSubscriptionRow);
}

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

// ============================================================================
// AUDIT EVENTS
// ============================================================================

export async function createApiAccessAuditEvent(
  pool: Pool,
  data: {
    projectId?: string | null;
    clientId?: string | null;
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
       (id, project_id, client_id, token_id, event_type, actor_admin_id, actor_developer_account_id,
        occurred_at, event_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${AUDIT_COLUMNS}`,
    [
      nanoid(),
      data.projectId ?? null,
      data.clientId ?? null,
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

/**
 * Lists one project's audit trail inside a half-open range, newest first, with
 * each actor's name joined in. Served by
 * `idx_api_access_audit_events_project_occurred`. Rows with the same moment
 * are ordered by id, so a page boundary never splits them differently twice.
 *
 * @param pool - The Postgres pool.
 * @param projectId - The project whose trail to read.
 * @param from - Start of the range, epoch ms, inclusive.
 * @param to - End of the range, epoch ms, exclusive.
 * @param limit - The most rows to return.
 * @returns The entries.
 */
export async function listProjectAuditEvents(
  pool: Pool,
  projectId: string,
  from: number,
  to: number,
  limit: number,
): Promise<ApiAccessAuditEntry[]> {
  const result = await pool.query(
    `SELECT e.id, e.project_id, e.client_id, e.token_id, e.event_type, e.actor_admin_id,
            e.actor_developer_account_id, e.occurred_at, e.event_data,
            a.username AS actor_admin_username, d.email AS actor_developer_email
     FROM api_access_audit_events e
     LEFT JOIN admin_users a ON a.id = e.actor_admin_id
     LEFT JOIN developer_accounts d ON d.id = e.actor_developer_account_id
     WHERE e.project_id = $1 AND e.occurred_at >= $2 AND e.occurred_at < $3
     ORDER BY e.occurred_at DESC, e.id DESC
     LIMIT $4`,
    [projectId, new Date(from), new Date(to), limit],
  );
  return result.rows.map((row) => {
    const typed = row as ApiAccessAuditEventRow & {
      actor_admin_username: string | null;
      actor_developer_email: string | null;
    };
    return {
      ...rowToApiAccessAuditEvent(typed),
      actorAdminUsername: typed.actor_admin_username,
      actorDeveloperEmail: typed.actor_developer_email,
    };
  });
}

export async function deleteApiAccessAuditEventsBefore(pool: Pool, cutoff: number): Promise<number> {
  const result = await pool.query(`DELETE FROM api_access_audit_events WHERE occurred_at < $1`, [new Date(cutoff)]);
  return result.rowCount ?? 0;
}

export async function countProjectUsage(pool: Pool, projectId: string, from: number, to: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM api_usage_events
     WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3`,
    [projectId, new Date(from), new Date(to)],
  );
  return (result.rows[0] as { total: number }).total;
}

/**
 * Aggregates one project's traffic in two queries: the split by registration
 * and the series. Both are grouped in Postgres rather than in the process,
 * because the row count over a range is exactly what must not travel.
 *
 * `date_trunc` supplies the step, and the series carries only the steps that
 * saw traffic; a caller drawing a chart fills the gaps, which is cheaper than
 * generating an empty row per step across a month.
 */
export async function summariseProjectUsage(
  pool: Pool,
  projectId: string,
  from: number,
  to: number,
  bucket: UsageBucketValue,
): Promise<ApiUsageSummary> {
  const range = [projectId, new Date(from), new Date(to)];
  const [byRegistration, buckets] = await Promise.all([
    pool.query(
      `SELECT registration_id, COUNT(*)::int AS total
       FROM api_usage_events
       WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
       GROUP BY registration_id
       ORDER BY total DESC, registration_id`,
      range,
    ),
    pool.query(
      `SELECT date_trunc($4, occurred_at) AS started_at, COUNT(*)::int AS total
       FROM api_usage_events
       WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
       GROUP BY started_at
       ORDER BY started_at`,
      [...range, bucket],
    ),
  ]);

  const perRegistration = byRegistration.rows.map((row) => {
    const typed = row as { registration_id: string; total: number };
    return { registrationId: typed.registration_id, total: typed.total };
  });

  return {
    from,
    to,
    bucket,
    total: perRegistration.reduce((sum, entry) => sum + entry.total, 0),
    byRegistration: perRegistration,
    buckets: buckets.rows.map((row) => {
      const typed = row as { started_at: Date; total: number };
      return { startedAt: dateToMs(typed.started_at), total: typed.total };
    }),
  };
}

export async function deleteApiUsageEventsBefore(pool: Pool, cutoff: number): Promise<number> {
  const result = await pool.query(`DELETE FROM api_usage_events WHERE occurred_at < $1`, [new Date(cutoff)]);
  return result.rowCount ?? 0;
}

export async function createApiUsageEvent(
  pool: Pool,
  data: {
    requestId: string;
    projectId: string;
    registrationId: string;
    tokenId?: string | null;
    method: string;
    endpointTemplate: string;
    statusCode: number;
    durationMs: number;
  },
): Promise<ApiUsageEvent> {
  const result = await pool.query(
    `INSERT INTO api_usage_events
       (id, request_id, project_id, registration_id, token_id, method, endpoint_template, status_code, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${USAGE_COLUMNS}`,
    [
      nanoid(),
      data.requestId,
      data.projectId,
      data.registrationId,
      data.tokenId ?? null,
      data.method,
      data.endpointTemplate,
      data.statusCode,
      data.durationMs,
    ],
  );
  return rowToApiUsageEvent(result.rows[0] as ApiUsageEventRow);
}
