/**
 * @file What a plan's offer becomes when it reaches Creem.
 *
 * An offer already carries every field Creem accepts, so nothing here invents
 * a value. What is left is the name and the description, which Creem shows on
 * the checkout page and on the receipt, and which follow a fixed pattern from
 * the plan's name and the billing period so a customer recognises what they
 * are paying for.
 */

import { BillingPeriod, type BillingPeriodValue, type Tier, type TierOffer } from "../db/tiers-repository.js";
import type { CreemProductDraft } from "./creem-products.js";

/** The word that appears in the product name and description per period. */
const PERIOD_LABEL: Record<BillingPeriodValue, string> = {
  [BillingPeriod.Once]: "once",
  [BillingPeriod.Daily]: "daily",
  [BillingPeriod.Monthly]: "monthly",
  [BillingPeriod.Quarterly]: "quarterly",
  [BillingPeriod.HalfYearly]: "half-yearly",
  [BillingPeriod.Yearly]: "yearly",
};

/**
 * Whether the given string is one of the billing periods Creem sells over.
 *
 * @param value - The candidate, typically straight off a request.
 * @returns `true` when Creem knows it.
 */
export function isBillingPeriod(value: unknown): value is BillingPeriodValue {
  return Object.values(BillingPeriod).includes(value as BillingPeriodValue);
}

/**
 * The name a product carries at Creem, for one plan and period.
 *
 * @param tierName - The plan's name.
 * @param period - The billing period.
 * @returns The product name.
 */
export function creemProductName(tierName: string, period: BillingPeriodValue): string {
  return `musiccloud ${tierName} (${PERIOD_LABEL[period]})`;
}

/**
 * Builds the Creem product for one offer.
 *
 * Nothing is derived here beyond the two texts. Every other field is the
 * offer's own, which is the whole point of an offer existing: a product at
 * Creem carries what somebody entered rather than what our code assumed.
 *
 * @param tier - The plan the offer belongs to, for its name.
 * @param offer - What is being sold.
 * @returns The draft to send to Creem.
 */
export function draftCreemProductForOffer(tier: Tier, offer: TierOffer): CreemProductDraft {
  const label = PERIOD_LABEL[offer.billingPeriod];
  return {
    name: creemProductName(tier.name, offer.billingPeriod),
    description: `musiccloud ${tier.name} API plan, billed ${label}.`,
    priceCents: offer.priceCents,
    currency: offer.currency,
    billingPeriod: offer.billingPeriod,
    billingType: offer.billingPeriod === BillingPeriod.Once ? "onetime" : "recurring",
    taxMode: offer.taxMode,
    taxCategory: offer.taxCategory,
    imageUrl: offer.imageUrl,
    successUrl: offer.successUrl,
    customFields: offer.customFields,
    abandonedCartRecovery: offer.abandonedCartRecovery,
    payWhatYouWant: offer.payWhatYouWant,
    suggestedPriceCents: offer.suggestedPriceCents,
  };
}
