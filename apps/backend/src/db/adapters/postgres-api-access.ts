/**
 * API-access domain: persistence for projects, registrations, tokens,
 * usage and the audit trail (MC-025/MC-077/MC-143). New ids are nanoid-generated here, matching
 * `postgres-developer.ts`.
 *
 * Row types, SQL fragments and mappers live in `postgres-api-access-rows.ts`.
 * Only `GRANTING_SUBSCRIPTION_STATES` is re-exported from it.
 *
 * Re-exported from sibling modules, so importers keep using this one:
 *   - `postgres-developer-projects.ts`.
 *   - `postgres-api-clients.ts`.
 *   - `postgres-api-client-tokens.ts`.
 */

import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type {
  ApiAccessAuditEntry,
  ApiAccessAuditEvent,
  ApiUsageEvent,
  ApiUsageSummary,
  UsageBucketValue,
} from "../api-access-repository.js";
import {
  type ApiAccessAuditEventRow,
  type ApiUsageEventRow,
  AUDIT_COLUMNS,
  rowToApiAccessAuditEvent,
  rowToApiUsageEvent,
  USAGE_COLUMNS,
} from "./postgres-api-access-rows.js";
import { dateToMs } from "./postgres-shared.js";

export { GRANTING_SUBSCRIPTION_STATES } from "./postgres-api-access-rows.js";
export * from "./postgres-api-client-tokens.js";
export * from "./postgres-api-clients.js";
export * from "./postgres-developer-projects.js";

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
