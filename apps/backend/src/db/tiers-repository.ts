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
  /** Billing interval in our normalised form: `"month"` or `"year"`. */
  interval: string;
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
 * Identifies one row of `tier_creem_products` without its product id.
 *
 * These three columns are the table's unique key, so they are what every read
 * and every removal addresses a mapping by.
 */
export interface TierCreemProductKey {
  /** Internal tier identifier. */
  tierId: string;
  /** Billing interval, `"month"` or `"year"`. */
  interval: string;
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
