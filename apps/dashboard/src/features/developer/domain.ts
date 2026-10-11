export const ApiClientStatus = {
  Active: "active",
  Suspended: "suspended",
  Revoked: "revoked",
} as const;
export type ApiClientStatus = (typeof ApiClientStatus)[keyof typeof ApiClientStatus];

export const ApiTokenStatus = {
  Active: "active",
  Revoked: "revoked",
  Rotated: "rotated",
} as const;
export type ApiTokenStatus = (typeof ApiTokenStatus)[keyof typeof ApiTokenStatus];

export const DeveloperProjectStatus = {
  Active: "active",
  Suspended: "suspended",
  Deleted: "deleted",
} as const;
export type DeveloperProjectStatus = (typeof DeveloperProjectStatus)[keyof typeof DeveloperProjectStatus];

/**
 * The states a project's subscription can hold, matching the check constraint
 * on `developer_project_subscriptions.status`.
 */
export const ProjectSubscriptionStatus = {
  Active: "active",
  Trialing: "trialing",
  Paused: "paused",
  PastDue: "past_due",
  Expired: "expired",
  Canceled: "canceled",
  ScheduledCancel: "scheduled_cancel",
} as const;
export type ProjectSubscriptionStatus = (typeof ProjectSubscriptionStatus)[keyof typeof ProjectSubscriptionStatus];

export const DeveloperAccountStatus = {
  Active: "active",
  Suspended: "suspended",
} as const;
export type DeveloperAccountStatus = (typeof DeveloperAccountStatus)[keyof typeof DeveloperAccountStatus];

/**
 * The two Creem environments, matching the check constraint on
 * `tier_creem_products.mode`. They are separate accounts sharing nothing, so
 * one plan and interval has a different product id in each.
 */
export const CreemMode = {
  Test: "test",
  Live: "live",
} as const;
export type CreemMode = (typeof CreemMode)[keyof typeof CreemMode];

/**
 * The billing periods Creem sells over, in its own spelling, matching the
 * check constraint on `tier_offers.billing_period`.
 */
export const BillingPeriod = {
  Once: "once",
  Daily: "every-day",
  Monthly: "every-month",
  Quarterly: "every-three-months",
  HalfYearly: "every-six-months",
  Yearly: "every-year",
} as const;
export type BillingPeriod = (typeof BillingPeriod)[keyof typeof BillingPeriod];

/** The currencies Creem accepts. */
export const OfferCurrency = {
  Eur: "EUR",
  Usd: "USD",
} as const;
export type OfferCurrency = (typeof OfferCurrency)[keyof typeof OfferCurrency];

/** Whether tax sits inside the price or is added to it. */
export const TaxMode = {
  Inclusive: "inclusive",
  Exclusive: "exclusive",
} as const;
export type TaxMode = (typeof TaxMode)[keyof typeof TaxMode];

/** How Creem treats what is being sold, for tax. */
export const TaxCategory = {
  Saas: "saas",
  DigitalGoodsService: "digital-goods-service",
  Ebooks: "ebooks",
} as const;
export type TaxCategory = (typeof TaxCategory)[keyof typeof TaxCategory];
