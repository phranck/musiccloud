import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreemMode } from "../../../lib/creem-config.js";
import { PostgresTierRepository } from "../postgres-tiers.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL`. Exercises the Creem
 * product mapping now that `tier_creem_products` carries a `mode` column.
 *
 * What the change has to hold: the same tier and interval can carry a product
 * in each Creem environment at once, a process only sees the rows of its own
 * environment, and the admin read sees both.
 *
 * The fixtures are one tier and its two mapping rows, all named with a random
 * suffix so a leftover from an interrupted run is identifiable. `afterAll`
 * deletes the tier, and the mapping rows go with it through the cascade.
 */
describe.skipIf(!process.env.DATABASE_URL)("tier_creem_products mode column (integration)", () => {
  let pool: pgModule.Pool;
  let repo: PostgresTierRepository;
  const suffix = Math.random().toString(36).slice(2, 10);
  const tierId = `mc227-tier-${suffix}`;
  const testProductId = `prod_test_${suffix}`;
  const liveProductId = `prod_live_${suffix}`;

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
    repo = new PostgresTierRepository(pool);
    await pool.query("INSERT INTO tiers (id, name, requests_per_minute, requests_per_day) VALUES ($1, $2, 60, 10000)", [
      tierId,
      `mc227 ${suffix}`,
    ]);
    await pool.query(
      "INSERT INTO tier_creem_products (id, tier_id, interval, mode, creem_product_id) VALUES ($1, $2, 'month', $3, $4), ($5, $2, 'month', $6, $7)",
      [
        `map-test-${suffix}`,
        tierId,
        CreemMode.Test,
        testProductId,
        `map-live-${suffix}`,
        CreemMode.Live,
        liveProductId,
      ],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM tiers WHERE id = $1", [tierId]);
    await pool.end();
  });

  it("holds one product per environment for the same tier and interval", async () => {
    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM tier_creem_products WHERE tier_id = $1 AND interval = 'month'",
      [tierId],
    );
    expect(rows[0]?.count).toBe("2");
  });

  it("returns only the sandbox row when asked for the test environment", async () => {
    const mappings = await repo.listCreemProductMappings(CreemMode.Test);
    const own = mappings.filter((mapping) => mapping.tierId === tierId);
    expect(own).toEqual([{ tierId, interval: "month", mode: CreemMode.Test, creemProductId: testProductId }]);
  });

  it("returns only the live row when asked for the live environment", async () => {
    const mappings = await repo.listCreemProductMappings(CreemMode.Live);
    const own = mappings.filter((mapping) => mapping.tierId === tierId);
    expect(own).toEqual([{ tierId, interval: "month", mode: CreemMode.Live, creemProductId: liveProductId }]);
  });

  it("returns both environments to the admin read", async () => {
    const mappings = await repo.listAllCreemProductMappings();
    const own = mappings.filter((mapping) => mapping.tierId === tierId);
    expect(own.map((mapping) => mapping.mode).sort()).toEqual([CreemMode.Live, CreemMode.Test]);
  });

  it("refuses a mode outside the two Creem environments", async () => {
    await expect(
      pool.query(
        "INSERT INTO tier_creem_products (id, tier_id, interval, mode, creem_product_id) VALUES ($1, $2, 'year', 'staging', $3)",
        [`map-bad-${suffix}`, tierId, `prod_bad_${suffix}`],
      ),
    ).rejects.toThrow(/chk_tier_creem_products_mode/);
  });

  it("still refuses a second product for the same tier, interval and environment", async () => {
    await expect(
      pool.query(
        "INSERT INTO tier_creem_products (id, tier_id, interval, mode, creem_product_id) VALUES ($1, $2, 'month', $3, $4)",
        [`map-dup-${suffix}`, tierId, CreemMode.Test, `prod_dup_${suffix}`],
      ),
    ).rejects.toThrow(/uq_tier_creem_products_tier_interval_mode/);
  });
});
