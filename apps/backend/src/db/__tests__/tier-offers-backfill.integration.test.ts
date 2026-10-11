import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillTierOffers } from "../tier-offers-backfill.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL`. Exercises the move of the
 * two old price columns into `tier_offers`.
 *
 * What matters here is what the backfill refuses. A price column is free text,
 * so it may hold something that is not an amount, and turning that into a
 * charge is worse than leaving the plan without an offer.
 *
 * Every fixture carries a random suffix so a leftover from an interrupted run
 * is identifiable, and `afterAll` deletes the plans, taking their offers with
 * them through the cascade.
 */
describe.skipIf(!process.env.DATABASE_URL)("tier offers backfill (integration)", () => {
  let pool: pgModule.Pool;
  const suffix = Math.random().toString(36).slice(2, 10);
  const plan = (name: string) => `mc182-${name}-${suffix}`;

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO tiers (id, name, requests_per_minute, requests_per_day, price, price_yearly) VALUES
         ($1, $2, 60, 10000, '9.90', '99'),
         ($3, $4, 60, 10000, '19', NULL),
         ($5, $6, 60, 10000, NULL, NULL),
         ($7, $8, 60, 10000, 'on request', NULL),
         ($9, $10, 60, 10000, '0.50', NULL)`,
      [
        plan("both"),
        `MC182 both ${suffix}`,
        plan("monthly"),
        `MC182 monthly ${suffix}`,
        plan("free"),
        `MC182 free ${suffix}`,
        plan("words"),
        `MC182 words ${suffix}`,
        plan("tiny"),
        `MC182 tiny ${suffix}`,
      ],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM tiers WHERE id LIKE $1", [`mc182-%-${suffix}`]);
    await pool.end();
  });

  /** The offers of one plan, by period. */
  async function offersOf(tierId: string): Promise<Record<string, number>> {
    const { rows } = await pool.query<{ billing_period: string; price_cents: number }>(
      "SELECT billing_period, price_cents FROM tier_offers WHERE tier_id = $1",
      [tierId],
    );
    return Object.fromEntries(rows.map((row) => [row.billing_period, row.price_cents]));
  }

  it("turns both price columns into one offer each", async () => {
    await backfillTierOffers(pool);

    expect(await offersOf(plan("both"))).toEqual({ "every-month": 990, "every-year": 9900 });
  });

  it("gives a plan sold only monthly a single offer", async () => {
    await backfillTierOffers(pool);

    expect(await offersOf(plan("monthly"))).toEqual({ "every-month": 1900 });
  });

  it("gives a free plan no offer, because it sells nothing", async () => {
    await backfillTierOffers(pool);

    expect(await offersOf(plan("free"))).toEqual({});
  });

  it("refuses a price column that is not an amount, and counts it", async () => {
    const result = await backfillTierOffers(pool);

    expect(await offersOf(plan("words"))).toEqual({});
    expect(result.unreadablePrices).toBeGreaterThanOrEqual(1);
  });

  it("refuses an amount below what Creem accepts rather than rounding it up", async () => {
    await backfillTierOffers(pool);

    expect(await offersOf(plan("tiny"))).toEqual({});
  });

  it("changes nothing on a second run, so a restart cannot duplicate an offer", async () => {
    await backfillTierOffers(pool);
    const before = await offersOf(plan("both"));

    const second = await backfillTierOffers(pool);

    expect(second.monthlyOffersInserted).toBe(0);
    expect(await offersOf(plan("both"))).toEqual(before);
  });

  it("leaves an edited offer alone rather than restoring the price it came from", async () => {
    await backfillTierOffers(pool);
    await pool.query(
      "UPDATE tier_offers SET price_cents = 1234 WHERE tier_id = $1 AND billing_period = 'every-month'",
      [plan("both")],
    );

    await backfillTierOffers(pool);

    expect((await offersOf(plan("both")))["every-month"]).toBe(1234);
  });
});
