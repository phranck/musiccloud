import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreemMode } from "../../../lib/creem-config.js";
import { BillingPeriod } from "../../tiers-repository.js";
import { PostgresTierRepository } from "../postgres-tiers.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL`. Exercises the Creem
 * product mapping, which addresses an offer by the offer's own natural key.
 *
 * What the shape has to hold: the same offer can carry a product in each Creem
 * environment at once, a process sees only the rows of its own environment,
 * the admin read sees both, and a product cannot point at a period the plan
 * does not sell.
 *
 * The fixtures are one plan, one offer and its two mapping rows, all named with
 * a random suffix so a leftover from an interrupted run is identifiable.
 * `afterAll` deletes the plan and the rest goes with it through the cascade.
 */
describe.skipIf(!process.env.DATABASE_URL)("tier_creem_products (integration)", () => {
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
    await pool.query("INSERT INTO tier_offers (id, tier_id, billing_period, price_cents) VALUES ($1, $2, $3, 990)", [
      `offer-${suffix}`,
      tierId,
      BillingPeriod.Monthly,
    ]);
    await pool.query(
      "INSERT INTO tier_creem_products (id, tier_id, interval, mode, creem_product_id) VALUES ($1, $2, $3, $4, $5), ($6, $2, $3, $7, $8)",
      [
        `map-test-${suffix}`,
        tierId,
        BillingPeriod.Monthly,
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

  it("holds one product per environment for the same offer", async () => {
    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM tier_creem_products WHERE tier_id = $1",
      [tierId],
    );
    expect(rows[0]?.count).toBe("2");
  });

  it("returns only the sandbox row when asked for the test environment", async () => {
    const own = (await repo.listCreemProductMappings(CreemMode.Test)).filter((entry) => entry.tierId === tierId);

    expect(own).toEqual([
      { tierId, billingPeriod: BillingPeriod.Monthly, mode: CreemMode.Test, creemProductId: testProductId },
    ]);
  });

  it("returns only the live row when asked for the live environment", async () => {
    const own = (await repo.listCreemProductMappings(CreemMode.Live)).filter((entry) => entry.tierId === tierId);

    expect(own).toEqual([
      { tierId, billingPeriod: BillingPeriod.Monthly, mode: CreemMode.Live, creemProductId: liveProductId },
    ]);
  });

  it("returns both environments to the admin read", async () => {
    const own = (await repo.listAllCreemProductMappings()).filter((entry) => entry.tierId === tierId);

    expect(own.map((entry) => entry.mode).sort()).toEqual([CreemMode.Live, CreemMode.Test]);
  });

  it("refuses a mode outside the two Creem environments", async () => {
    await expect(
      pool.query(
        "INSERT INTO tier_creem_products (id, tier_id, interval, mode, creem_product_id) VALUES ($1, $2, $3, 'staging', $4)",
        [`map-bad-${suffix}`, tierId, BillingPeriod.Monthly, `prod_bad_${suffix}`],
      ),
    ).rejects.toThrow(/chk_tier_creem_products_mode/);
  });

  it("refuses a product for a period the plan does not sell", async () => {
    await expect(
      pool.query(
        "INSERT INTO tier_creem_products (id, tier_id, interval, mode, creem_product_id) VALUES ($1, $2, $3, $4, $5)",
        [`map-nooffer-${suffix}`, tierId, BillingPeriod.Yearly, CreemMode.Test, `prod_nooffer_${suffix}`],
      ),
    ).rejects.toThrow(/fk_tier_creem_products_offer/);
  });

  it("still refuses a second product for the same offer and environment", async () => {
    await expect(
      pool.query(
        "INSERT INTO tier_creem_products (id, tier_id, interval, mode, creem_product_id) VALUES ($1, $2, $3, $4, $5)",
        [`map-dup-${suffix}`, tierId, BillingPeriod.Monthly, CreemMode.Test, `prod_dup_${suffix}`],
      ),
    ).rejects.toThrow(/uq_tier_creem_products_tier_interval_mode/);
  });

  it("takes the mapping with it when the offer goes", async () => {
    const offer = await repo.createOffer({
      tierId,
      billingPeriod: BillingPeriod.Yearly,
      priceCents: 9900,
      currency: "EUR",
      taxMode: null,
      taxCategory: null,
      imageUrl: null,
      successUrl: null,
      customFields: [],
      abandonedCartRecovery: false,
      payWhatYouWant: false,
      suggestedPriceCents: null,
      sortOrder: 1,
    });
    await repo.createCreemProductMapping({
      tierId,
      billingPeriod: BillingPeriod.Yearly,
      mode: CreemMode.Test,
      creemProductId: `prod_year_${suffix}`,
    });

    await repo.deleteOffer(offer.id);

    const remaining = await repo.findCreemProductMapping({
      tierId,
      billingPeriod: BillingPeriod.Yearly,
      mode: CreemMode.Test,
    });
    expect(remaining).toBeNull();
  });
});
