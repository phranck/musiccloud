/**
 * Repository contract for the tier (API tariff) system (MC-092): read, create,
 * update, and delete tier definitions. The admin dashboard manages tiers; the
 * public Developer Portal reads them for its pricing page.
 */

import type { CreemModeValue } from "../lib/creem-config.js";

/** Default tier accent colour (neutral slate) applied when none is supplied. */
export const DEFAULT_TIER_COLOR = "#64748b";

/** Maximum number of feature bullets shown on a tier's pricing card. */
export const MAX_TIER_FEATURES = 12;
/** Maximum length of a single feature bullet. */
export const MAX_TIER_FEATURE_LABEL_LENGTH = 80;

export interface Tier {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  /** Monthly price in euros as a numeric string (e.g. "9" or "9.90"), or `null` for free tiers. */
  price: string | null;
  /** Yearly price in euros as a numeric string, or `null` when no yearly billing is offered. */
  priceYearly: string | null;
  /** Hex accent colour `#RRGGBB` (validated at the API boundary; default `#64748b`). */
  color: string;
  /** Iconsax icon name for the tier (one of the shared `TIER_ICONS`), or `null` for none. */
  icon: string | null;
  /** Custom label for the pricing-card CTA button, or `null` to use the portal default. */
  buttonLabel: string | null;
  /** Free-text description shown on the public pricing card (English, ≤500 chars; default `""`). */
  description: string;
  /** Whether the tier is currently offered. Disabled tiers stay visible on the pricing page (marked) but can no longer be assigned. */
  enabled: boolean;
  /** Reason shown when the tier is disabled (English, ≤200 chars; default `""`). Only meaningful when `enabled` is false. */
  disableReason: string;
  /**
   * Whether this tier is the highlighted "recommended" one on the pricing page.
   * At most one tier is recommended at a time (server-enforced): setting this
   * `true` clears it on every other tier. May also be none (all `false`), in
   * which case the pricing cards render flat. Independent of `enabled`.
   */
  recommended: boolean;
  sortOrder: number;
  /** Ordered feature bullets shown on the pricing card, each a short label. Empty array when none are set. */
  features: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TierCreateData {
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired?: boolean;
  price?: string | null;
  priceYearly?: string | null;
  color?: string;
  icon?: string | null;
  buttonLabel?: string | null;
  description?: string;
  enabled?: boolean;
  disableReason?: string;
  /** Mark this tier as the recommended one on create; `true` clears the flag on all other tiers. Defaults to `false`. */
  recommended?: boolean;
  sortOrder?: number;
  /** Ordered feature bullets for the pricing card, each a short label. Defaults to an empty list. */
  features?: string[];
}

export interface TierUpdateData {
  name?: string;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  attributionRequired?: boolean;
  price?: string | null;
  priceYearly?: string | null;
  color?: string;
  icon?: string | null;
  buttonLabel?: string | null;
  description?: string;
  enabled?: boolean;
  disableReason?: string;
  /** Set the recommended flag. `true` makes this the recommended tier and clears it on all others; `false` leaves none recommended. */
  recommended?: boolean;
  sortOrder?: number;
  /** Replace the tier's feature bullets. Omit to leave them unchanged. */
  features?: string[];
}

/**
 * One row from the `tier_creem_products` mapping table (MC-110).
 *
 * The tier-to-product link lives on our side because Creem products carry no
 * metadata field (verified against `creem@1.5.3` and `docs.creem.io` on
 * 2026-07-09): neither `ProductEntity` nor `CreateProductRequestEntity` expose
 * a `metadata` property. Keeping the mapping in our own table also makes it
 * vendor-portable: swapping payment providers does not require re-seeding
 * Creem products with back-references.
 */
export interface TierCreemProductMapping {
  /** Internal tier identifier (e.g. `"tier_club"`). */
  tierId: string;
  /** The offer's billing period, in Creem's own spelling. */
  billingPeriod: BillingPeriodValue;
  /**
   * The Creem environment this product lives in. Test and live are separate
   * accounts, so the same tier and interval carries a different product id in
   * each, and a product id is only meaningful against its own environment.
   */
  mode: CreemModeValue;
  /** The corresponding Creem product ID returned when the product was created. */
  creemProductId: string;
}

/**
 * The billing periods Creem sells over, in its own spelling, so a value
 * travels to the API unchanged.
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

/** The currencies Creem accepts. */
export const OfferCurrency = { Eur: "EUR", Usd: "USD" } as const;

/** An {@link OfferCurrency} member value. */
export type OfferCurrencyValue = (typeof OfferCurrency)[keyof typeof OfferCurrency];

/** Whether tax sits inside the price or is added to it. */
export const TaxMode = { Inclusive: "inclusive", Exclusive: "exclusive" } as const;

/** A {@link TaxMode} member value. */
export type TaxModeValue = (typeof TaxMode)[keyof typeof TaxMode];

/** How Creem treats what is being sold for tax. */
export const TaxCategory = { Saas: "saas", DigitalGoodsService: "digital-goods-service", Ebooks: "ebooks" } as const;

/** A {@link TaxCategory} member value. */
export type TaxCategoryValue = (typeof TaxCategory)[keyof typeof TaxCategory];

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

/** The fields an offer is created with. Everything else takes its default. */
export type TierOfferCreateData = Omit<TierOffer, "id"> extends infer T ? T : never;

/** The fields an offer can be changed by. Omitted ones stay as they are. */
export type TierOfferUpdateData = Partial<Omit<TierOffer, "id" | "tierId">>;

/**
 * Identifies one row of `tier_creem_products` without its product id.
 *
 * These three columns are the table's unique key, and the first two are also
 * an offer's natural key, so a mapping cannot point at a period the plan does
 * not sell.
 */
export interface TierCreemProductKey {
  /** Internal tier identifier. */
  tierId: string;
  /** The offer's billing period, in Creem's spelling. */
  billingPeriod: BillingPeriodValue;
  /** The Creem environment. */
  mode: CreemModeValue;
}

export interface TierRepository {
  listTiers(): Promise<Tier[]>;
  createTier(data: TierCreateData): Promise<Tier>;
  updateTier(id: string, data: TierUpdateData): Promise<Tier>;
  deleteTier(id: string): Promise<void>;
  /**
   * Returns the rows from `tier_creem_products` that belong to one Creem
   * environment, mapping each internal tier plus billing interval to the
   * product ID that environment knows.
   *
   * This mapping exists on our side because Creem products carry no metadata
   * field. Creem remains the source of truth for prices; we own the
   * tier-to-product link.
   *
   * The mode is required rather than optional because a process talks to one
   * environment only, decided by its API key. Reading the other environment's
   * rows would ask Creem for products that do not exist there.
   *
   * @param mode - The Creem environment whose rows are wanted.
   */
  listCreemProductMappings(mode: CreemModeValue): Promise<TierCreemProductMapping[]>;

  /**
   * Returns every row from `tier_creem_products`, across both Creem
   * environments.
   *
   * This is for the admin surface, which shows which environment already has a
   * product for a tier and interval and which does not. Nothing that talks to
   * Creem uses it, because a product id only resolves against its own
   * environment.
   */
  listAllCreemProductMappings(): Promise<TierCreemProductMapping[]>;

  /** Every offer of one plan, in the order it is shown. */
  listOffers(tierId: string): Promise<TierOffer[]>;

  /** Every offer of every plan, so a caller can price a whole list at once. */
  listAllOffers(): Promise<TierOffer[]>;

  /**
   * Adds an offer to a plan.
   *
   * @throws When the plan already sells over that billing period. One plan
   *   sells once per period; a second would be invisible except on the
   *   pricing page.
   */
  createOffer(data: TierOfferCreateData): Promise<TierOffer>;

  /** Changes an offer. Omitted fields keep their value. */
  updateOffer(id: string, data: TierOfferUpdateData): Promise<TierOffer>;

  /**
   * Removes an offer and, through the database, every Creem product mapped to
   * it. Archiving those products at Creem is the caller's job and comes first.
   */
  deleteOffer(id: string): Promise<void>;

  /**
   * Returns the mapping for one tier, interval and Creem environment, or
   * `null` when that combination has no product yet.
   *
   * @param key - Which mapping is wanted.
   */
  findCreemProductMapping(key: TierCreemProductKey): Promise<TierCreemProductMapping | null>;

  /**
   * Records that a Creem product belongs to a tier, interval and environment.
   *
   * There is deliberately no upsert. Overwriting an existing mapping would
   * leave the previous product active at Creem with nothing pointing at it,
   * and an unreferenced active product is exactly what nobody would go looking
   * for. Replacing one therefore means archiving the old product first, which
   * is the caller's job.
   *
   * @param mapping - The tier, interval, environment and product id.
   * @throws When that tier, interval and environment already has a product.
   */
  createCreemProductMapping(mapping: TierCreemProductMapping): Promise<void>;

  /**
   * Removes the mapping for one tier, interval and Creem environment.
   *
   * This is the second half of archiving a product and is never done on its
   * own: a row pointing at an archived product shows an unbuyable price on the
   * pricing page, and a product archived without removing the row shows the
   * same.
   *
   * @param key - Which mapping to remove.
   * @returns `true` when a row was removed, `false` when there was none.
   */
  deleteCreemProductMapping(key: TierCreemProductKey): Promise<boolean>;
}
