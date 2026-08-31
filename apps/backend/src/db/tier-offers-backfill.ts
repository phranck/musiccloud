import type { Pool } from "pg";

export interface TierOffersBackfillResult {
  monthlyOffersInserted: number;
  yearlyOffersInserted: number;
  unreadablePrices: number;
}

/**
 * The SQL condition under which one of the old price columns can become an
 * offer.
 *
 * A price is usable when it reads as a number and reaches Creem's floor of one
 * whole currency unit. Anything else is left behind rather than rounded into
 * an amount nobody chose, because this decides what a customer is charged.
 *
 * @param column - The column to test, already qualified.
 * @returns A condition for a `WHERE` clause.
 */
function usablePrice(column: string): string {
  return `btrim(${column}) ~ '^[0-9]+(\\.[0-9]+)?$' AND round(CAST(btrim(${column}) AS numeric) * 100) >= 100`;
}

/** The amount in cents that one of the old price columns stands for. */
function priceCents(column: string): string {
  return `CAST(round(CAST(btrim(${column}) AS numeric) * 100) AS integer)`;
}

/**
 * Moves what a plan used to carry in its two price columns into `tier_offers`.
 *
 * Stable ids and `ON CONFLICT DO NOTHING` make the transaction safe to repeat
 * after a deployment restart, and an offer an operator has since edited is
 * never overwritten by the value it was born from. The old columns are left
 * untouched, so this survives a rollback and can run again.
 *
 * @param pool - The pool to run on.
 * @returns How many offers were created and how many prices could not be read.
 */
export async function backfillTierOffers(pool: Pool): Promise<TierOffersBackfillResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('musiccloud-tier-offers-backfill-v1'))`);

    const monthly = await client.query(
      `INSERT INTO tier_offers (id, tier_id, billing_period, price_cents, currency, sort_order)
       SELECT 'legacy-offer-month:' || t.id, t.id, 'every-month', ${priceCents("t.price")}, 'EUR', 0
       FROM tiers t
       WHERE t.price IS NOT NULL AND ${usablePrice("t.price")}
       ON CONFLICT (id) DO NOTHING`,
    );

    const yearly = await client.query(
      `INSERT INTO tier_offers (id, tier_id, billing_period, price_cents, currency, sort_order)
       SELECT 'legacy-offer-year:' || t.id, t.id, 'every-year', ${priceCents("t.price_yearly")}, 'EUR', 1
       FROM tiers t
       WHERE t.price_yearly IS NOT NULL AND ${usablePrice("t.price_yearly")}
       ON CONFLICT (id) DO NOTHING`,
    );

    // Counted rather than ignored: a plan whose price could not be read has no
    // offer and therefore nothing to sell, and that has to be visible.
    const unreadable = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM tiers t
       WHERE (t.price IS NOT NULL AND btrim(t.price) <> '' AND NOT (${usablePrice("t.price")}))
          OR (t.price_yearly IS NOT NULL AND btrim(t.price_yearly) <> '' AND NOT (${usablePrice("t.price_yearly")}))`,
    );

    await client.query("COMMIT");

    return {
      monthlyOffersInserted: monthly.rowCount ?? 0,
      yearlyOffersInserted: yearly.rowCount ?? 0,
      unreadablePrices: Number(unreadable.rows[0]?.count ?? 0),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
