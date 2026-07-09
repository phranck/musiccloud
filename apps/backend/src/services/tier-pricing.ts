/**
 * @file Live Creem price enrichment for the public tier listing (MC-114).
 *
 * The pricing page shows our tiers with prices that follow Creem, while every
 * other field stays with our own source of truth (the tiers table). This module
 * merges the live Creem catalog prices into the tier list served by the public
 * tiers endpoint.
 */

import type { Tier } from "../db/tiers-repository.js";
import { type CreemCatalog, getCreemCatalog } from "./creem-catalog.js";

/**
 * Formats an integer cent amount as a euro string in the same shape the tiers
 * table uses: whole euros without decimals ("9", "1490"), fractional euros with
 * exactly two decimals ("9.90").
 *
 * @param cents - The amount in the smallest currency unit, as returned by Creem.
 * @returns The euro amount as a display string.
 */
export function centsToEuroString(cents: number): string {
  const euros = cents / 100;
  return Number.isInteger(euros) ? String(euros) : euros.toFixed(2);
}

/**
 * Returns the tiers with their displayed prices overridden by the live Creem
 * catalog, wherever a Creem product mapping exists.
 *
 * Only the price is taken from Creem: it is the amount actually charged at
 * checkout, so the displayed price must follow it. Every other field (name,
 * description, colour, icon, and so on) stays from our own tiers table, which
 * remains the source of truth. A tier without a Creem mapping (for example the
 * free tier, which has no Creem product) keeps its database price.
 *
 * The Creem catalog fetch is best-effort: if it throws (Creem unreachable, no
 * API key configured, a product was removed), the database prices are returned
 * unchanged so the pricing page never breaks.
 *
 * @param tiers - The tiers as read from the database.
 * @returns The tiers with Creem prices merged in where available.
 */
export async function enrichTiersWithCreemPrices(tiers: Tier[]): Promise<Tier[]> {
  let catalog: CreemCatalog;
  try {
    catalog = await getCreemCatalog();
  } catch {
    return tiers;
  }

  return tiers.map((tier) => {
    const entry = catalog[tier.id];
    if (!entry) return tier;
    const month = entry.month;
    const year = entry.year;
    return {
      ...tier,
      price: month ? centsToEuroString(month.price) : tier.price,
      priceYearly: year ? centsToEuroString(year.price) : tier.priceYearly,
    };
  });
}
