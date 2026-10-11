/**
 * @file Live Creem price enrichment for the public tier listing (MC-114).
 *
 * A plan's price comes from its offers, and Creem's live price overrides it
 * wherever a product exists, because that is what a customer is charged. Every
 * other field stays with our own source of truth. This module merges the two
 * into the tier list the public endpoint serves, whose shape is unchanged: a
 * monthly and a yearly euro string, either of them `null` when that period is
 * not sold.
 */

import { getTierRepository } from "../db/index.js";
import { BillingPeriod, type BillingPeriodValue, type Tier, type TierOffer } from "../db/tiers-repository.js";
import { log } from "../lib/infra/logger.js";
import { type CreemCatalog, CreemPriceOutcome, getCreemCatalog } from "./creem-catalog.js";

/**
 * Whether a failure was the key being absent rather than Creem being down.
 *
 * `requireEnv` names the variable it is missing, and that is the one signal
 * separating "nobody configured this" from "the upstream is refusing". The two
 * are diagnosed in completely different places, so they do not share a line.
 *
 * @param error - Whatever the catalogue threw.
 * @returns `true` when the API key is not configured.
 */
function isMissingApiKey(error: unknown): boolean {
  return error instanceof Error && error.message.includes("CREEM_API_KEY");
}

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
 * Reads one of the tiers table's euro price strings as an integer number of
 * cents, which is the only shape Creem accepts.
 *
 * The column is text rather than a number, so anything may be in it. A value
 * that is not a price comes back as `null` instead of as a silently wrong
 * amount, because the caller is about to charge somebody this.
 *
 * @param value - The price as the tiers table holds it, or `null`.
 * @returns The amount in cents, or `null` when the value is absent or unreadable.
 */
export function euroStringToCents(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim().length === 0) return null;
  const euros = Number(value.trim());
  if (!Number.isFinite(euros) || euros < 0) return null;
  return Math.round(euros * 100);
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
 * The Creem catalog fetch is best-effort: if it throws (Creem unreachable or
 * no API key configured), the database prices are returned unchanged so the
 * pricing page never breaks, and the deviation is logged with which of the two
 * it was. A single product that cannot be read is handled one level down, in
 * `getCreemCatalog`, and costs only that tier its live price.
 *
 * @param tiers - The tiers as read from the database.
 * @returns The tiers with Creem prices merged in where available.
 */
export async function enrichTiersWithCreemPrices(tiers: Tier[]): Promise<Tier[]> {
  const offers = await (await getTierRepository()).listAllOffers();

  let catalog: CreemCatalog;
  try {
    catalog = await getCreemCatalog();
  } catch (error) {
    // The page keeps working on our own prices, which is the right answer.
    // Doing it silently is not: an unset key, an unreachable Creem and an
    // archived product look identical from outside and are three different
    // problems, so the outcome says which one this was.
    log.deviation(
      {
        component: "TierPricing",
        errorCode: "MC-SYS-0001",
        operation: "creem_catalog_read",
        outcome: isMissingApiKey(error) ? CreemPriceOutcome.NotConfigured : CreemPriceOutcome.CatalogUnavailable,
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
function priceFromOffers(tiers: Tier[], offers: TierOffer[], catalog: CreemCatalog): Tier[] {
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
