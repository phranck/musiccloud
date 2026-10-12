import { BILLING_PERIODS, canPayWhatYouWant } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseUrl } from "../../../__tests__/integration-database.js";

/**
 * Hits a live Postgres pointed at by `TEST_DATABASE_URL`. The pay-what-you-want rule
 * lives twice, as `canPayWhatYouWant` in the shared package and as the check
 * `chk_tier_offers_pay_what_you_want`, so this holds the two to one answer for
 * every billing period.
 *
 * Everything runs inside one transaction that is rolled back, so the plan and
 * its offers never outlive the test. They carry a random suffix all the same,
 * so a row from an interrupted run would be identifiable.
 */
describe.skipIf(!integrationDatabaseUrl())("tier_offers.pay_what_you_want (integration)", () => {
  let pool: pgModule.Pool;
  const suffix = Math.random().toString(36).slice(2, 10);
  const tierId = `mc421-tier-${suffix}`;

  beforeAll(() => {
    pool = new pgModule.Pool({ connectionString: integrationDatabaseUrl() });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts the flag on exactly the periods the shared rule allows", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO tiers (id, name, requests_per_minute, requests_per_day) VALUES ($1, $2, 60, 10000)",
        [tierId, `mc421 ${suffix}`],
      );

      for (const period of BILLING_PERIODS) {
        await client.query("SAVEPOINT offer");
        const insert = client.query(
          "INSERT INTO tier_offers (id, tier_id, billing_period, price_cents, pay_what_you_want) VALUES ($1, $2, $3, 990, true)",
          [`mc421-offer-${period}-${suffix}`, tierId, period],
        );
        if (canPayWhatYouWant(period)) {
          await expect(insert, period).resolves.toBeDefined();
        } else {
          await expect(insert, period).rejects.toThrow(/chk_tier_offers_pay_what_you_want/);
        }
        await client.query("ROLLBACK TO SAVEPOINT offer");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
