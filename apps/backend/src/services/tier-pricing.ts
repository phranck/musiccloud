/**
 * @file Live Creem price enrichment for the public tier listing (MC-114).
 *
 * A plan's price comes from its offers, and Creem's live price overrides it
 * wherever a product exists, because that is what a customer is charged. Every
 * other field stays with our own source of truth. This module merges the two
 * into the tier list the public endpoint serves: the plan plus a monthly and a
 * yearly euro string, either of them `null` when that period is not sold.
 */

import type { ApiTier, TierOffer } from "@musiccloud/shared";
import { BillingPeriod, type BillingPeriodValue } from "@musiccloud/shared";
import { CreemKeyMissingError } from "../lib/creem-config.js";
import { log } from "../lib/infra/logger.js";
import { type CreemCatalog, CreemPriceOutcome, getCreemCatalog } from "./creem-catalog.js";

/**
 * A plan as the public tier list shows it, with the two headline prices
 * worked out from its offers and the Creem catalogue.
 *
 * @property price - The monthly price as a euro string ("9" or "9.90"), or
 *   `null` when the plan sells nothing monthly.
 * @property priceYearly - The yearly price in the same shape, or `null` when
 *   the plan sells nothing yearly.
 */
export type PricedTier = ApiTier & { price: string | null; priceYearly: string | null };

/**
 * Formats an integer cent amount as the euro string the public tier list
 * carries: whole euros without decimals ("9", "1490"), fractional euros with
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
 * Returns the tiers with their two headline prices, taken from the live Creem
 * catalogue wherever a product exists and from the plan's offers otherwise.
 *
 * Only the price is taken from Creem: it is the amount actually charged at
 * checkout, so the displayed price must follow it. Every other field (name,
 * description, colour, icon, and so on) stays from our own tiers table, which
 * remains the source of truth. A period without a Creem product shows its
 * offer's amount, and a plan with no offer for a period shows `null` there.
 *
 * The Creem catalog fetch is best-effort: if it throws (Creem unreachable or
 * no API key configured), the offers' amounts are returned so the pricing page
 * never breaks, and the deviation is logged with which of the two it was. A
 * single product that cannot be read is handled one level down, in
 * `getCreemCatalog`, and costs only that tier its live price.
 *
 * @param tiers - The tiers as read from the database.
 * @param offers - Every offer of those tiers. The caller reads them, because
 *   it judges the same tiers by the same offers.
 * @returns The tiers with their prices.
 */
export async function enrichTiersWithCreemPrices(tiers: ApiTier[], offers: TierOffer[]): Promise<PricedTier[]> {
  let catalog: CreemCatalog;
  try {
    catalog = await getCreemCatalog();
  } catch (error) {
    // The page keeps working on our own prices, which is the right answer.
    // Doing it silently is not: an unset key, an unreachable Creem and an
    // archived product look identical from outside and are three different
    // problems, so the outcome says which one this was. An unset key is the
    // one failure `requireCreemApiKey` throws as its own type, and everything
    // else, a conflicting configuration included, counts as Creem unavailable.
    log.deviation(
      {
        component: "TierPricing",
        errorCode: "MC-SYS-0001",
        operation: "creem_catalog_read",
        outcome:
          error instanceof CreemKeyMissingError
            ? CreemPriceOutcome.NotConfigured
            : CreemPriceOutcome.CatalogUnavailable,
        tiersServedFromDatabase: tiers.length,
      },
      error,
    );
    // The offers are ours and still readable, so the page keeps the prices an
    // operator entered rather than losing them along with Creem.
    return priceFromOffers(tiers, offers, {});
  }

  return priceFromOffers(tiers, offers, catalog);
}

/**
 * Merges what a plan asks for its two headline periods into the shape the
 * public tier list has always had.
 *
 * The offer carries the amount, and Creem's live price overrides it wherever a
 * product exists, because that is what a customer is actually charged. A plan
 * with no offer for a period reports `null` there, which is how the public
 * contract says that period is not sold.
 *
 * @param tiers - The plans.
 * @param offers - Every offer, of every plan.
 * @param catalog - The live prices, empty when Creem could not be read.
 * @returns The plans with their displayed prices.
 */
function priceFromOffers(tiers: ApiTier[], offers: TierOffer[], catalog: CreemCatalog): PricedTier[] {
  return tiers.map((tier) => {
    const own = offers.filter((offer) => offer.tierId === tier.id);
    const live = catalog[tier.id];

    const priceFor = (period: BillingPeriodValue): string | null => {
      const fromCreem = live?.[period];
      if (fromCreem) return centsToEuroString(fromCreem.price);
      const offer = own.find((candidate) => candidate.billingPeriod === period);
      return offer ? centsToEuroString(offer.priceCents) : null;
    };

    return { ...tier, price: priceFor(BillingPeriod.Monthly), priceYearly: priceFor(BillingPeriod.Yearly) };
  });
}
