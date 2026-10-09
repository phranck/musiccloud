/**
 * @file What a tier's Creem product is called and what it costs.
 *
 * These are our rules rather than Creem's. They decide the name, the
 * description and the amount that appear on a customer's checkout page and on
 * their receipt, so they live in one place that the write path and its tests
 * both read.
 */

import type { Tier } from "../db/tiers-repository.js";
import type { CreemProductDraft } from "./creem-products.js";
import { euroStringToCents } from "./tier-pricing.js";

/** The billing intervals a tier can be sold at. */
export const BillingInterval = {
  /** Billed once a month. */
  Month: "month",
  /** Billed once a year. */
  Year: "year",
} as const;

/** A {@link BillingInterval} member value. */
export type BillingIntervalValue = (typeof BillingInterval)[keyof typeof BillingInterval];

/** Creem's own spelling of each billing period. */
const CREEM_BILLING_PERIOD: Record<BillingIntervalValue, string> = {
  [BillingInterval.Month]: "every-month",
  [BillingInterval.Year]: "every-year",
};

/** The word that appears in the product name and description per interval. */
const INTERVAL_LABEL: Record<BillingIntervalValue, string> = {
  [BillingInterval.Month]: "monthly",
  [BillingInterval.Year]: "yearly",
};

/** Every Creem product we create is priced in euros. */
const PRODUCT_CURRENCY = "EUR";

/**
 * Whether the given string is one of the two billing intervals.
 *
 * @param value - The candidate, typically straight off a request.
 * @returns `true` when it is `month` or `year`.
 */
export function isBillingInterval(value: unknown): value is BillingIntervalValue {
  return value === BillingInterval.Month || value === BillingInterval.Year;
}

/**
 * Returns the tier's price for one interval, as the tiers table holds it.
 *
 * @param tier - The tier.
 * @param interval - Which of the two prices is wanted.
 * @returns The price string, or `null` when the tier has no price for it.
 */
export function tierPriceFor(tier: Tier, interval: BillingIntervalValue): string | null {
  return interval === BillingInterval.Month ? tier.price : tier.priceYearly;
}

/**
 * Builds the Creem product for a tier and interval, or says why there is none.
 *
 * Two cases yield nothing, and they are different. A free tier gets no product
 * at all, because Creem rejects a recurring product priced at zero and a free
 * account has no billing to model; its price comes from our own tiers table. A
 * tier with no yearly price is simply not sold yearly, so the yearly product
 * does not exist either.
 *
 * The name and description follow a fixed pattern from the tier name and the
 * billing period, because both appear on the checkout page and on the receipt,
 * where a customer has to recognise what they are paying for.
 *
 * @param tier - The tier the product belongs to.
 * @param interval - The billing interval to build the product for.
 * @returns The draft, or `null` when this tier and interval has no product.
 */
export function draftCreemProductFor(tier: Tier, interval: BillingIntervalValue): CreemProductDraft | null {
  const priceCents = euroStringToCents(tierPriceFor(tier, interval));
  if (priceCents === null || priceCents === 0) return null;

  const label = INTERVAL_LABEL[interval];
  return {
    name: `musiccloud ${tier.name} (${label})`,
    description: `musiccloud ${tier.name} API tier, billed ${label}.`,
    priceCents,
    currency: PRODUCT_CURRENCY,
    billingPeriod: CREEM_BILLING_PERIOD[interval],
  };
}
