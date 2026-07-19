import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createApiClient,
  createDeveloperProject,
  findActiveApiClientByTokenHash,
} from "./adapters/postgres-api-access.js";
import { backfillDeveloperProjects } from "./developer-project-backfill.js";
import { resolveMigrationsFolder } from "./run-migrations.js";

function isExplicitlyIsolatedTestDatabase(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const databaseName = new URL(value).pathname.slice(1).toLowerCase();
    return /(^|[_-])(test|integration|issue87)([_-]|$)/.test(databaseName);
  } catch {
    return false;
  }
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!isExplicitlyIsolatedTestDatabase(testDatabaseUrl))(
  "developer project backfill (isolated PostgreSQL)",
  () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tierId = `issue87_tier_${suffix}`;
    const accountId = `issue87_account_${suffix}`;
    const emptyAccountId = `issue87_empty_account_${suffix}`;
    const firstClientId = `issue87_client_a_${suffix}`;
    const secondClientId = `issue87_client_b_${suffix}`;
    const firstTokenHash = `issue87_hash_a_${suffix}`;
    const secondTokenHash = `issue87_hash_b_${suffix}`;
    let pool: pg.Pool;

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: testDatabaseUrl });
      await migrate(drizzle(pool), { migrationsFolder: resolveMigrationsFolder() });
      await pool.query(
        `INSERT INTO tiers (id, name, requests_per_minute, requests_per_day)
         VALUES ($1, $2, 60, 10000)`,
        [tierId, `Issue 87 tier ${suffix}`],
      );
      await pool.query(
        `INSERT INTO developer_accounts (id, email, display_name, tier_id)
         VALUES ($1, $2, 'Two projects', $3), ($4, $5, 'No registrations', $3)`,
        [accountId, `issue87-${suffix}@example.test`, tierId, emptyAccountId, `issue87-empty-${suffix}@example.test`],
      );
      await pool.query(
        `INSERT INTO developer_subscriptions
           (id, account_id, tier_id, creem_subscription_id, creem_customer_id, status, interval)
         VALUES ($1, $2, $3, $4, $5, 'active', 'month')`,
        [
          `issue87_subscription_${suffix}`,
          accountId,
          tierId,
          `issue87_creem_subscription_${suffix}`,
          `issue87_creem_customer_${suffix}`,
        ],
      );
      await pool.query(
        `INSERT INTO api_clients
           (id, developer_account_id, app_name, contact_email, description, requests_per_minute,
            requests_per_day, created_at, updated_at)
         VALUES
           ($1, $3, 'First app', $4, 'First', 10, 100, NOW() - INTERVAL '1 day', NOW()),
           ($2, $3, 'Second app', $4, 'Second', 20, 200, NOW(), NOW())`,
        [firstClientId, secondClientId, accountId, `issue87-${suffix}@example.test`],
      );
      await pool.query(
        `INSERT INTO api_client_tokens (id, client_id, token_prefix, token_hash)
         VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
        [
          `issue87_token_a_${suffix}`,
          firstClientId,
          `issue87_prefix_a_${suffix}`,
          firstTokenHash,
          `issue87_token_b_${suffix}`,
          secondClientId,
          `issue87_prefix_b_${suffix}`,
          secondTokenHash,
        ],
      );
    });

    afterAll(async () => {
      await pool.query(`DELETE FROM developer_accounts WHERE id = ANY($1::text[])`, [[accountId, emptyAccountId]]);
      await pool.query(`DELETE FROM tiers WHERE id = $1`, [tierId]);
      await pool.end();
    });

    it("backfills deterministic independent projects and remains idempotent", async () => {
      const first = await backfillDeveloperProjects(pool);
      const second = await backfillDeveloperProjects(pool);

      expect(first.clientsWithoutProject).toBe(0);
      expect(first.accountsWithoutProject).toBe(0);
      expect(first.projectsWithoutSubscription).toBe(0);
      expect(first.duplicateProjectSubscriptions).toBe(0);
      expect(second.clientProjectsInserted).toBe(0);
      expect(second.accountProjectsInserted).toBe(0);

      const registrations = await pool.query(
        `SELECT id, project_id FROM api_clients WHERE developer_account_id = $1 ORDER BY id`,
        [accountId],
      );
      expect(registrations.rows).toHaveLength(2);
      expect(new Set(registrations.rows.map((row) => row.project_id)).size).toBe(2);

      const emptyProjects = await pool.query(`SELECT id FROM developer_projects WHERE developer_account_id = $1`, [
        emptyAccountId,
      ]);
      expect(emptyProjects.rows).toHaveLength(1);
    });

    it("keeps sibling credentials active when one project is suspended", async () => {
      const firstProject = `legacy-client-project:${firstClientId}`;
      await pool.query(`UPDATE developer_projects SET status = 'suspended' WHERE id = $1`, [firstProject]);

      await expect(findActiveApiClientByTokenHash(pool, firstTokenHash)).resolves.toBeNull();
      await expect(findActiveApiClientByTokenHash(pool, secondTokenHash)).resolves.toMatchObject({
        project: { id: `legacy-client-project:${secondClientId}`, status: "active" },
        client: { id: secondClientId },
      });
    });

    it("creates distinct development, confidential and public registrations under one project", async () => {
      const project = await createDeveloperProject(pool, {
        developerAccountId: accountId,
        displayName: "Registration types",
        tierId,
      });
      const registrationTypes = ["development", "confidential", "public"] as const;
      const registrations = await Promise.all(
        registrationTypes.map((registrationType) =>
          createApiClient(pool, {
            developerAccountId: accountId,
            projectId: project.id,
            registrationType,
            appName: `${registrationType} registration`,
            contactEmail: `issue87-${suffix}@example.test`,
            description: "Issue 87 isolated registration",
          }),
        ),
      );

      expect(registrations.map((registration) => registration.registrationType).sort()).toEqual(
        [...registrationTypes].sort(),
      );
      expect(new Set(registrations.map((registration) => registration.publicClientId)).size).toBe(3);
      expect(registrations.every((registration) => registration.projectId === project.id)).toBe(true);
    });
  },
);
