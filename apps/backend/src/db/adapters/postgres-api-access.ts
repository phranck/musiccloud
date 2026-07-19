/**
 * API-access domain: persistence for projects, registrations, tokens,
 * usage and the audit trail (MC-025/MC-077/MC-143). New ids are nanoid-generated here, matching
 * `postgres-developer.ts`. Timestamp columns are mapped to epoch
 * milliseconds via {@link dateToMs}.
 */

import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type {
  ApiAccessAuditEvent,
  ApiAccessRequest,
  ApiClient,
  ApiClientToken,
  ApiUsageEvent,
  DeveloperProject,
  DeveloperProjectSubscription,
} from "../api-access-repository.js";
import { FALLBACK_REQUESTS_PER_DAY, FALLBACK_REQUESTS_PER_MINUTE } from "../tiers-repository.js";
import { dateToMs } from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

interface ApiAccessRequestRow {
  id: string;
  developer_account_id: string;
  project_id: string | null;
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

interface DeveloperProjectRow {
  id: string;
  developer_account_id: string;
  display_name: string;
  status: string;
  requests_per_minute: number | null;
  requests_per_day: number | null;
  tier_id: string | null;
  tier_name: string | null;
  tier_requests_per_minute: number | null;
  tier_requests_per_day: number | null;
  created_at: Date;
  updated_at: Date;
  suspended_at: Date | null;
  deleted_at: Date | null;
  created_by_admin_id: string | null;
}

interface DeveloperProjectSubscriptionRow {
  id: string;
  project_id: string;
  tier_id: string | null;
  creem_subscription_id: string | null;
  creem_customer_id: string | null;
  status: string;
  interval: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Raw shape of the registration JOIN used by every registration read: the
 * `api_clients` compatibility row plus project ownership and quota columns.
 * Account-tier fallback remains only for transitional rows awaiting backfill.
 */
interface ApiClientRow {
  id: string;
  request_id: string | null;
  developer_account_id: string;
  project_id: string | null;
  public_client_id: string | null;
  registration_type: string | null;
  capabilities: unknown;
  project_display_name: string | null;
  project_status: string | null;
  project_requests_per_minute: number | null;
  project_requests_per_day: number | null;
  project_developer_account_id: string | null;
  project_created_at: Date | null;
  project_updated_at: Date | null;
  project_suspended_at: Date | null;
  project_deleted_at: Date | null;
  project_created_by_admin_id: string | null;
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
  project_id: string | null;
  client_id: string | null;
  request_id: string | null;
  token_id: string | null;
  event_type: string;
  actor_admin_id: string | null;
  actor_developer_account_id: string | null;
  occurred_at: Date;
  event_data: Record<string, unknown>;
}

interface ApiUsageEventRow {
  id: string;
  occurred_at: Date;
  request_id: string;
  project_id: string;
  registration_id: string;
  token_id: string | null;
  method: string;
  endpoint_template: string;
  status_code: number;
  duration_ms: number;
}

const REQUEST_COLUMNS = `id, developer_account_id, project_id, contact_email, app_name, app_description,
            estimated_requests_per_day, status, submitted_at, reviewed_at, reviewed_by_admin_id, review_note`;
const PROJECT_JOIN_SELECT = `SELECT p.id, p.developer_account_id, p.display_name, p.status,
            p.requests_per_minute, p.requests_per_day, p.created_at, p.updated_at, p.suspended_at, p.deleted_at,
            p.created_by_admin_id, ps.tier_id AS tier_id, t.name AS tier_name,
            t.requests_per_minute AS tier_requests_per_minute, t.requests_per_day AS tier_requests_per_day
     FROM developer_projects p
     LEFT JOIN developer_project_subscriptions ps ON ps.project_id = p.id
     LEFT JOIN tiers t ON t.id = ps.tier_id`;
const SUBSCRIPTION_COLUMNS = `id, project_id, tier_id, creem_subscription_id, creem_customer_id, status,
            interval, current_period_end, cancel_at_period_end, created_at, updated_at`;
/**
 * Every registration read goes through this JOIN so the DTO always carries
 * project quota inputs, the project tier, and optional registration caps.
 * The account-tier branch is a compatibility fallback for transitional rows.
 */
const CLIENT_JOIN_SELECT = `SELECT c.id, c.request_id, c.developer_account_id, c.project_id,
            c.public_client_id, c.registration_type, c.capabilities, c.app_name, c.contact_email,
            c.description, c.status, c.requests_per_minute, c.requests_per_day, c.created_at, c.updated_at,
            c.created_by_admin_id, p.display_name AS project_display_name, p.status AS project_status,
            p.requests_per_minute AS project_requests_per_minute,
            p.requests_per_day AS project_requests_per_day,
            p.developer_account_id AS project_developer_account_id,
            p.created_at AS project_created_at, p.updated_at AS project_updated_at,
            p.suspended_at AS project_suspended_at, p.deleted_at AS project_deleted_at,
            p.created_by_admin_id AS project_created_by_admin_id,
            CASE WHEN ps.id IS NOT NULL THEN ps.tier_id ELSE da.tier_id END AS tier_id, t.name AS tier_name,
            t.requests_per_minute AS tier_requests_per_minute, t.requests_per_day AS tier_requests_per_day
     FROM api_clients c
     LEFT JOIN developer_projects p ON p.id = c.project_id
     JOIN developer_accounts da ON da.id = COALESCE(p.developer_account_id, c.developer_account_id)
     LEFT JOIN developer_project_subscriptions ps ON ps.project_id = p.id
     LEFT JOIN tiers t ON t.id = CASE WHEN ps.id IS NOT NULL THEN ps.tier_id ELSE da.tier_id END`;
const TOKEN_COLUMNS = `id, client_id, token_prefix, token_hash, token_raw, status, created_at, last_used_at,
            revoked_at, rotated_from_token_id`;
const AUDIT_COLUMNS = `id, project_id, client_id, request_id, token_id, event_type, actor_admin_id,
            actor_developer_account_id, occurred_at, event_data`;
const USAGE_COLUMNS = `id, occurred_at, request_id, project_id, registration_id, token_id, method,
            endpoint_template, status_code, duration_ms`;

// ============================================================================
// MAPPERS
// ============================================================================

function rowToApiAccessRequest(row: ApiAccessRequestRow): ApiAccessRequest {
  return {
    id: row.id,
    developerAccountId: row.developer_account_id,
    projectId: row.project_id,
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

function effectiveLimit(override: number | null, tierLimit: number | null, fallback: number): number {
  return override ?? tierLimit ?? fallback;
}

function rowToDeveloperProject(row: DeveloperProjectRow): DeveloperProject {
  return {
    id: row.id,
    developerAccountId: row.developer_account_id,
    displayName: row.display_name,
    status: row.status,
    requestsPerMinute: row.requests_per_minute,
    requestsPerDay: row.requests_per_day,
    tierId: row.tier_id,
    tierName: row.tier_name,
    tierRequestsPerMinute: row.tier_requests_per_minute,
    tierRequestsPerDay: row.tier_requests_per_day,
    effectiveRequestsPerMinute: effectiveLimit(
      row.requests_per_minute,
      row.tier_requests_per_minute,
      FALLBACK_REQUESTS_PER_MINUTE,
    ),
    effectiveRequestsPerDay: effectiveLimit(row.requests_per_day, row.tier_requests_per_day, FALLBACK_REQUESTS_PER_DAY),
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
    suspendedAt: row.suspended_at ? dateToMs(row.suspended_at) : null,
    deletedAt: row.deleted_at ? dateToMs(row.deleted_at) : null,
    createdByAdminId: row.created_by_admin_id,
  };
}

function rowToDeveloperProjectSubscription(row: DeveloperProjectSubscriptionRow): DeveloperProjectSubscription {
  return {
    id: row.id,
    projectId: row.project_id,
    tierId: row.tier_id,
    creemSubscriptionId: row.creem_subscription_id,
    creemCustomerId: row.creem_customer_id,
    status: row.status,
    interval: row.interval,
    currentPeriodEnd: row.current_period_end ? dateToMs(row.current_period_end) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
  };
}

/**
 * Maps a registration JOIN row to the {@link ApiClient} compatibility DTO.
 * Project limits resolve as `project override ?? project tier ?? fallback`;
 * an optional registration cap may narrow but never widen that result.
 */
function rowToApiClient(row: ApiClientRow): ApiClient {
  const projectMinuteLimit = effectiveLimit(
    row.project_requests_per_minute,
    row.tier_requests_per_minute,
    FALLBACK_REQUESTS_PER_MINUTE,
  );
  const projectDayLimit = effectiveLimit(
    row.project_requests_per_day,
    row.tier_requests_per_day,
    FALLBACK_REQUESTS_PER_DAY,
  );
  return {
    id: row.id,
    requestId: row.request_id,
    developerAccountId: row.developer_account_id,
    projectId: row.project_id ?? `legacy-account:${row.developer_account_id}`,
    publicClientId: row.public_client_id ?? row.id,
    registrationType: row.registration_type ?? "development",
    capabilities: Array.isArray(row.capabilities)
      ? row.capabilities.filter((value): value is string => typeof value === "string")
      : [],
    projectDisplayName: row.project_display_name ?? row.app_name,
    projectStatus: row.project_status ?? "active",
    projectRequestsPerMinute: row.project_requests_per_minute,
    projectRequestsPerDay: row.project_requests_per_day,
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
    effectiveRequestsPerMinute:
      row.requests_per_minute === null ? projectMinuteLimit : Math.min(row.requests_per_minute, projectMinuteLimit),
    effectiveRequestsPerDay:
      row.requests_per_day === null ? projectDayLimit : Math.min(row.requests_per_day, projectDayLimit),
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

function rowToApiUsageEvent(row: ApiUsageEventRow): ApiUsageEvent {
  return {
    id: row.id,
    occurredAt: dateToMs(row.occurred_at),
    requestId: row.request_id,
    projectId: row.project_id,
    registrationId: row.registration_id,
    tokenId: row.token_id,
    method: row.method,
    endpointTemplate: row.endpoint_template,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
  };
}

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

function rowToApiAccessAuditEvent(row: ApiAccessAuditEventRow): ApiAccessAuditEvent {
  return {
    id: row.id,
    projectId: row.project_id,
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
    projectId?: string | null;
    contactEmail: string;
    appName: string;
    appDescription: string;
    estimatedRequestsPerDay: number;
  },
): Promise<ApiAccessRequest> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_access_requests
       (id, developer_account_id, project_id, contact_email, app_name, app_description, estimated_requests_per_day,
        submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${REQUEST_COLUMNS}`,
    [
      nanoid(),
      data.developerAccountId,
      data.projectId ?? null,
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
  data: {
    status: "approved" | "rejected";
    reviewedByAdminId: string;
    reviewNote?: string | null;
    projectId?: string | null;
  },
): Promise<ApiAccessRequest | null> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE api_access_requests
     SET status = $1, reviewed_at = $2, reviewed_by_admin_id = $3, review_note = $4,
         project_id = COALESCE($5, project_id)
     WHERE id = $6
     RETURNING ${REQUEST_COLUMNS}`,
    [data.status, now, data.reviewedByAdminId, data.reviewNote ?? null, data.projectId ?? null, id],
  );
  if (result.rows.length === 0) return null;
  return rowToApiAccessRequest(result.rows[0] as ApiAccessRequestRow);
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
    requestId?: string | null;
    developerAccountId: string;
    projectId?: string | null;
    registrationType?: "development" | "confidential" | "public";
    capabilities?: string[];
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
  const inserted = await pool.query(
    `INSERT INTO api_clients
       (id, request_id, developer_account_id, project_id, registration_type, capabilities, app_name, contact_email,
        description, requests_per_minute, requests_per_day, created_at, updated_at, created_by_admin_id)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13
     WHERE $4::text IS NULL OR EXISTS (
       SELECT 1 FROM developer_projects p
       WHERE p.id = $4 AND p.developer_account_id = $3 AND p.status <> 'deleted'
     )`,
    [
      id,
      data.requestId ?? null,
      data.developerAccountId,
      data.projectId ?? null,
      data.registrationType ?? "development",
      JSON.stringify(data.capabilities ?? ["legacy_api_key"]),
      data.appName,
      data.contactEmail,
      data.description,
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
  const project =
    row.project_id == null
      ? {
          id: client.projectId,
          developerAccountId: client.developerAccountId,
          displayName: client.projectDisplayName,
          status: client.projectStatus,
          requestsPerMinute: client.projectRequestsPerMinute,
          requestsPerDay: client.projectRequestsPerDay,
          tierId: client.tierId,
          tierName: client.tierName,
          tierRequestsPerMinute: client.tierRequestsPerMinute,
          tierRequestsPerDay: client.tierRequestsPerDay,
          effectiveRequestsPerMinute: effectiveLimit(
            client.projectRequestsPerMinute,
            client.tierRequestsPerMinute,
            FALLBACK_REQUESTS_PER_MINUTE,
          ),
          effectiveRequestsPerDay: effectiveLimit(
            client.projectRequestsPerDay,
            client.tierRequestsPerDay,
            FALLBACK_REQUESTS_PER_DAY,
          ),
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
          suspendedAt: null,
          deletedAt: null,
          createdByAdminId: client.createdByAdminId,
        }
      : {
          id: row.project_id,
          developerAccountId: row.project_developer_account_id ?? row.developer_account_id,
          displayName: client.projectDisplayName,
          status: client.projectStatus,
          requestsPerMinute: client.projectRequestsPerMinute,
          requestsPerDay: client.projectRequestsPerDay,
          tierId: client.tierId,
          tierName: client.tierName,
          tierRequestsPerMinute: client.tierRequestsPerMinute,
          tierRequestsPerDay: client.tierRequestsPerDay,
          effectiveRequestsPerMinute: effectiveLimit(
            client.projectRequestsPerMinute,
            client.tierRequestsPerMinute,
            FALLBACK_REQUESTS_PER_MINUTE,
          ),
          effectiveRequestsPerDay: effectiveLimit(
            client.projectRequestsPerDay,
            client.tierRequestsPerDay,
            FALLBACK_REQUESTS_PER_DAY,
          ),
          createdAt: dateToMs(row.project_created_at ?? row.created_at),
          updatedAt: dateToMs(row.project_updated_at ?? row.updated_at),
          suspendedAt: row.project_suspended_at ? dateToMs(row.project_suspended_at) : null,
          deletedAt: row.project_deleted_at ? dateToMs(row.project_deleted_at) : null,
          createdByAdminId: row.project_created_by_admin_id,
        };
  return { project, client, token };
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
    projectId?: string | null;
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
       (id, project_id, client_id, request_id, token_id, event_type, actor_admin_id, actor_developer_account_id,
        occurred_at, event_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${AUDIT_COLUMNS}`,
    [
      nanoid(),
      data.projectId ?? null,
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
