/**
 * @file The billing vocabulary: the periods Creem sells over, the currency and
 * the tax settings an offer carries, the two Creem environments, and the
 * states of a project's subscription. Beside it stand the shapes built from
 * it: an offer, a Creem product mapping and the selling readiness.
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

/** One extra question asked at the Creem checkout. */
export interface OfferCustomField {
  key: string;
  label: string;
  optional: boolean;
}

/**
 * What a plan costs, as one thing a customer can buy.
 *
 * This is exactly what Creem calls a product, so every field Creem accepts has
 * a home here rather than being invented when the product is created.
 */
export interface TierOffer {
  id: string;
  tierId: string;
  billingPeriod: BillingPeriodValue;
  /** The amount in the smallest currency unit, which is what Creem takes. */
  priceCents: number;
  currency: OfferCurrencyValue;
  /** `null` leaves the decision to Creem. */
  taxMode: TaxModeValue | null;
  /** `null` leaves the decision to Creem. */
  taxCategory: TaxCategoryValue | null;
  imageUrl: string | null;
  successUrl: string | null;
  customFields: OfferCustomField[];
  abandonedCartRecovery: boolean;
  /** Only meaningful on a `once` offer. */
  payWhatYouWant: boolean;
  suggestedPriceCents: number | null;
  sortOrder: number;
}

/**
 * One plan's Creem product in one environment, as `tier_creem_products` holds
 * it.
 *
 * The link lives on our side because Creem products carry no metadata field,
 * which `creem@1.5.3` and `docs.creem.io` confirmed on 2026-07-09. Keeping it
 * in our own table also means a change of payment provider needs no
 * back-references seeded at the provider.
 */
export interface CreemProductMapping {
  /** The plan, such as `tier_club`. */
  tierId: string;
  /** The offer's billing period, in Creem's own spelling. */
  billingPeriod: BillingPeriodValue;
  /**
   * The Creem environment this product lives in. Test and live are separate
   * accounts, so the same plan and period carries a different product id in
   * each, and a product id is only meaningful against its own environment.
   */
  mode: CreemModeValue;
  /** The product id Creem returned when the product was created. */
  creemProductId: string;
}

/** Whether the shop could sell from one Creem environment right now, and what stands in the way. */
export interface SellingModeReadiness {
  /** The environment. */
  mode: CreemModeValue;
  /** Whether this deployment holds an API key for it. */
  hasKey: boolean;
  /** The plans and periods that have no product there, labelled for an operator. */
  missingProducts: string[];
}
