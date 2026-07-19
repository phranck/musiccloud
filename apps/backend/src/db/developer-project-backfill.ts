import type { Pool } from "pg";

export interface DeveloperProjectBackfillResult {
  clientProjectsInserted: number;
  accountProjectsInserted: number;
  clientsWithoutProject: number;
  accountsWithoutProject: number;
  projectsWithoutSubscription: number;
  duplicateProjectSubscriptions: number;
}

/**
 * Additively moves legacy account/client ownership into the project model.
 * Stable ids and conflict-safe writes make the transaction safe to repeat
 * after a deployment restart. Legacy tables and columns remain untouched.
 */
export async function backfillDeveloperProjects(pool: Pool): Promise<DeveloperProjectBackfillResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('musiccloud-developer-project-backfill-v1'))`);

    const clientProjects = await client.query(
      `INSERT INTO developer_projects
         (id, developer_account_id, display_name, status, requests_per_minute, requests_per_day,
          created_at, updated_at, suspended_at, created_by_admin_id)
       SELECT 'legacy-client-project:' || c.id,
              c.developer_account_id,
              c.app_name,
              CASE WHEN c.status = 'suspended' THEN 'suspended' ELSE 'active' END,
              c.requests_per_minute,
              c.requests_per_day,
              c.created_at,
              c.updated_at,
              CASE WHEN c.status = 'suspended' THEN c.updated_at ELSE NULL END,
              c.created_by_admin_id
       FROM api_clients c
       WHERE c.project_id IS NULL
       ON CONFLICT (id) DO NOTHING`,
    );

    const accountProjects = await client.query(
      `INSERT INTO developer_projects
         (id, developer_account_id, display_name, status, created_at, updated_at, suspended_at)
       SELECT 'legacy-account-project:' || account.id,
              account.id,
              COALESCE(NULLIF(account.display_name, ''), 'Default project'),
              CASE WHEN account.status = 'suspended' THEN 'suspended' ELSE 'active' END,
              account.created_at,
              account.updated_at,
              CASE WHEN account.status = 'suspended' THEN account.updated_at ELSE NULL END
       FROM developer_accounts account
       WHERE NOT EXISTS (
         SELECT 1 FROM developer_projects project WHERE project.developer_account_id = account.id
       )
       ON CONFLICT (id) DO NOTHING`,
    );

    await client.query(
      `INSERT INTO developer_project_subscriptions (id, project_id, tier_id, created_at, updated_at)
       SELECT 'legacy-project-subscription:' || project.id,
              project.id,
              account.tier_id,
              project.created_at,
              project.updated_at
       FROM developer_projects project
       JOIN developer_accounts account ON account.id = project.developer_account_id
       ON CONFLICT (project_id) DO NOTHING`,
    );

    await client.query(
      `UPDATE api_clients client
       SET project_id = 'legacy-client-project:' || client.id
       WHERE client.project_id IS NULL
         AND EXISTS (
           SELECT 1 FROM developer_projects project
           WHERE project.id = 'legacy-client-project:' || client.id
         )`,
    );

    await client.query(
      `UPDATE api_access_requests request
       SET project_id = COALESCE(
         (
           SELECT registration.project_id
           FROM api_clients registration
           WHERE registration.request_id = request.id
           ORDER BY registration.created_at, registration.id
           LIMIT 1
         ),
         (
           SELECT project.id
           FROM developer_projects project
           WHERE project.developer_account_id = request.developer_account_id
           ORDER BY project.created_at, project.id
           LIMIT 1
         )
       )
       WHERE request.project_id IS NULL`,
    );

    await client.query(
      `WITH selected_legacy_subscription AS (
         SELECT DISTINCT ON (subscription.account_id)
                subscription.account_id,
                subscription.tier_id,
                subscription.creem_subscription_id,
                subscription.creem_customer_id,
                subscription.status,
                subscription.interval,
                subscription.current_period_end,
                subscription.cancel_at_period_end,
                subscription.created_at,
                subscription.updated_at
         FROM developer_subscriptions subscription
         ORDER BY subscription.account_id,
                  CASE WHEN subscription.status IN ('active', 'trialing') THEN 0 ELSE 1 END,
                  subscription.created_at DESC,
                  subscription.id
       ), selected_project AS (
         SELECT legacy.*,
                (
                  SELECT project.id
                  FROM developer_projects project
                  WHERE project.developer_account_id = legacy.account_id
                  ORDER BY project.created_at, project.id
                  LIMIT 1
                ) AS project_id
         FROM selected_legacy_subscription legacy
       )
       UPDATE developer_project_subscriptions project_subscription
       SET tier_id = selected.tier_id,
           creem_subscription_id = selected.creem_subscription_id,
           creem_customer_id = selected.creem_customer_id,
           status = selected.status,
           interval = selected.interval,
           current_period_end = selected.current_period_end,
           cancel_at_period_end = selected.cancel_at_period_end,
           created_at = LEAST(project_subscription.created_at, selected.created_at),
           updated_at = GREATEST(project_subscription.updated_at, selected.updated_at)
       FROM selected_project selected
       WHERE project_subscription.project_id = selected.project_id
         AND (
           project_subscription.creem_subscription_id IS NULL
           OR project_subscription.creem_subscription_id = selected.creem_subscription_id
         )`,
    );

    await client.query(
      `UPDATE api_access_audit_events event
       SET project_id = registration.project_id
       FROM api_clients registration
       WHERE event.project_id IS NULL
         AND event.client_id = registration.id
         AND registration.project_id IS NOT NULL`,
    );
    await client.query(
      `UPDATE api_access_audit_events event
       SET project_id = access_request.project_id
       FROM api_access_requests access_request
       WHERE event.project_id IS NULL
         AND event.request_id = access_request.id
         AND access_request.project_id IS NOT NULL`,
    );
    await client.query(
      `UPDATE api_access_audit_events event
       SET project_id = registration.project_id
       FROM api_client_tokens token
       JOIN api_clients registration ON registration.id = token.client_id
       WHERE event.project_id IS NULL
         AND event.token_id = token.id
         AND registration.project_id IS NOT NULL`,
    );

    const verification = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM api_clients WHERE project_id IS NULL) AS clients_without_project,
         (
           SELECT COUNT(*)::int
           FROM developer_accounts account
           WHERE NOT EXISTS (
             SELECT 1 FROM developer_projects project WHERE project.developer_account_id = account.id
           )
         ) AS accounts_without_project,
         (
           SELECT COUNT(*)::int
           FROM developer_projects project
           WHERE NOT EXISTS (
             SELECT 1 FROM developer_project_subscriptions subscription
             WHERE subscription.project_id = project.id
           )
         ) AS projects_without_subscription,
         (
           SELECT COUNT(*)::int
           FROM (
             SELECT subscription.project_id
             FROM developer_project_subscriptions subscription
             GROUP BY subscription.project_id
             HAVING COUNT(*) > 1
           ) duplicate
         ) AS duplicate_project_subscriptions`,
    );
    const row = verification.rows[0] as {
      clients_without_project?: number;
      accounts_without_project?: number;
      projects_without_subscription?: number;
      duplicate_project_subscriptions?: number;
    };
    const result: DeveloperProjectBackfillResult = {
      clientProjectsInserted: clientProjects.rowCount ?? 0,
      accountProjectsInserted: accountProjects.rowCount ?? 0,
      clientsWithoutProject: Number(row.clients_without_project ?? 0),
      accountsWithoutProject: Number(row.accounts_without_project ?? 0),
      projectsWithoutSubscription: Number(row.projects_without_subscription ?? 0),
      duplicateProjectSubscriptions: Number(row.duplicate_project_subscriptions ?? 0),
    };
    if (
      result.clientsWithoutProject > 0 ||
      result.accountsWithoutProject > 0 ||
      result.projectsWithoutSubscription > 0 ||
      result.duplicateProjectSubscriptions > 0
    ) {
      throw new Error(
        `Developer project backfill left ownership gaps: clients=${result.clientsWithoutProject}, accounts=${result.accountsWithoutProject}, subscriptionsMissing=${result.projectsWithoutSubscription}, subscriptionsDuplicate=${result.duplicateProjectSubscriptions}`,
      );
    }

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
