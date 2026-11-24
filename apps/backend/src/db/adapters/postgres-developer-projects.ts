/**
 * Developer projects and their subscriptions: create, read, list, count
 * against the per-account ceiling, update, and the subscription upsert. New
 * ids are nanoid-generated here.
 *
 * `postgres-api-access.ts` re-exports every function here, so importers keep
 * using that module.
 */

import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type { DeveloperProject, DeveloperProjectSubscription } from "../api-access-repository.js";
import {
  type DeveloperProjectRow,
  type DeveloperProjectSubscriptionRow,
  PROJECT_JOIN_SELECT,
  rowToDeveloperProject,
  rowToDeveloperProjectSubscription,
  SUBSCRIPTION_COLUMNS,
} from "./postgres-api-access-rows.js";

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
