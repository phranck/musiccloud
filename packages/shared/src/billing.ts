/**
 * @file The billing vocabulary: the periods Creem sells over, the currency and
 * the tax settings an offer carries, the two Creem environments, and the
 * states of a project's subscription.
 *
 * The database checks, the backend routes and the admin dashboard read these
 * values from here, so a value the database accepts is one every interface
 * knows how to name. Each list keeps the order its namespace lists the values
 * in, because the database checks are built from the lists and a different
 * order would read to the migration tool as a different check.
 */

import { belongsTo } from "./value-lists.js";

/**
 * The billing periods Creem sells over, in its own spelling, so a value
 * travels to the API unchanged. A subscription's interval is one of these as
 * well, because a subscription is to an offer.
 */
export const BillingPeriod = {
  Once: "once",
  Daily: "every-day",
  Monthly: "every-month",
  Quarterly: "every-three-months",
  HalfYearly: "every-six-months",
  Yearly: "every-year",
} as const;

/** A {@link BillingPeriod} member value. */
export type BillingPeriodValue = (typeof BillingPeriod)[keyof typeof BillingPeriod];

/** Every {@link BillingPeriod} value. */
export const BILLING_PERIODS: readonly BillingPeriodValue[] = Object.values(BillingPeriod);

/** Whether a request value is a {@link BillingPeriod}. */
export function isBillingPeriod(value: unknown): value is BillingPeriodValue {
  return belongsTo(BILLING_PERIODS, value);
}

/** The currencies Creem accepts. */
export const OfferCurrency = { Eur: "EUR", Usd: "USD" } as const;

/** An {@link OfferCurrency} member value. */
export type OfferCurrencyValue = (typeof OfferCurrency)[keyof typeof OfferCurrency];

/** Every {@link OfferCurrency} value. */
export const OFFER_CURRENCIES: readonly OfferCurrencyValue[] = Object.values(OfferCurrency);

/** Whether tax sits inside the price or is added to it. */
export const TaxMode = { Inclusive: "inclusive", Exclusive: "exclusive" } as const;

/** A {@link TaxMode} member value. */
export type TaxModeValue = (typeof TaxMode)[keyof typeof TaxMode];

/** Every {@link TaxMode} value. */
export const TAX_MODES: readonly TaxModeValue[] = Object.values(TaxMode);

/** How Creem treats what is being sold, for tax. */
export const TaxCategory = { Saas: "saas", DigitalGoodsService: "digital-goods-service", Ebooks: "ebooks" } as const;

/** A {@link TaxCategory} member value. */
export type TaxCategoryValue = (typeof TaxCategory)[keyof typeof TaxCategory];

/** Every {@link TaxCategory} value. */
export const TAX_CATEGORIES: readonly TaxCategoryValue[] = Object.values(TaxCategory);

/**
 * The two Creem environments. They are separate accounts that share nothing,
 * so a product created in one does not exist in the other, and every product
 * id belongs to exactly one of them.
 */
export const CreemMode = {
  /** The sandbox, where no payment moves real money. */
  Test: "test",
  /** The live account, where a payment charges a real card. */
  Live: "live",
} as const;

/** A {@link CreemMode} member value. */
export type CreemModeValue = (typeof CreemMode)[keyof typeof CreemMode];

/** Every {@link CreemMode} value, test first. */
export const CREEM_MODES: readonly CreemModeValue[] = Object.values(CreemMode);

/** The states a project's subscription can hold. */
export const SubscriptionStatus = {
  Active: "active",
  Trialing: "trialing",
  Paused: "paused",
  PastDue: "past_due",
  Expired: "expired",
  Canceled: "canceled",
  ScheduledCancel: "scheduled_cancel",
} as const;

/** A {@link SubscriptionStatus} member value. */
export type SubscriptionStatusValue = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/** Every {@link SubscriptionStatus} value. */
export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatusValue[] = Object.values(SubscriptionStatus);

/** Whether a request value is a {@link SubscriptionStatus}. */
export function isSubscriptionStatus(value: unknown): value is SubscriptionStatusValue {
  return belongsTo(SUBSCRIPTION_STATUSES, value);
}
