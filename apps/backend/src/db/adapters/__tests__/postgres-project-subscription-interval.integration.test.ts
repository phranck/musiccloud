import { BILLING_PERIODS } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseUrl } from "../../../__tests__/integration-database.js";

/**
 * Hits a live Postgres pointed at by `TEST_DATABASE_URL`. A project subscription is
 * to an offer, so its interval has to hold every billing period an offer can
 * be sold over, in Creem's spelling.
 *
 * Everything runs inside one transaction that is rolled back, so the fixtures,
 * an account, a project and its subscription, never outlive the test. They
 * carry a random suffix all the same, so a row from an interrupted run would be
 * identifiable.
 */
describe.skipIf(!integrationDatabaseUrl())("developer_project_subscriptions.interval (integration)", () => {
  let pool: pgModule.Pool;
  const suffix = Math.random().toString(36).slice(2, 10);

  beforeAll(() => {
    pool = new pgModule.Pool({ connectionString: integrationDatabaseUrl() });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("holds every billing period and refuses the old spelling", async () => {
    const client = await pool.connect();
    const subscriptionId = `mc567-subscription-${suffix}`;
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO developer_accounts (id, email, display_name) VALUES ($1, $2, $3)", [
        `mc567-account-${suffix}`,
        `mc567-${suffix}@example.test`,
        `mc567 ${suffix}`,
      ]);
      await client.query(
        "INSERT INTO developer_projects (id, developer_account_id, display_name) VALUES ($1, $2, $3)",
        [`mc567-project-${suffix}`, `mc567-account-${suffix}`, `mc567 ${suffix}`],
      );
      await client.query("INSERT INTO developer_project_subscriptions (id, project_id) VALUES ($1, $2)", [
        subscriptionId,
        `mc567-project-${suffix}`,
      ]);

      for (const period of BILLING_PERIODS) {
        await client.query("UPDATE developer_project_subscriptions SET interval = $1 WHERE id = $2", [
          period,
          subscriptionId,
        ]);
      }

      await client.query("SAVEPOINT old_spelling");
      await expect(
        client.query("UPDATE developer_project_subscriptions SET interval = 'month' WHERE id = $1", [subscriptionId]),
      ).rejects.toThrow(/chk_developer_project_subscriptions_interval/);
      await client.query("ROLLBACK TO SAVEPOINT old_spelling");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
