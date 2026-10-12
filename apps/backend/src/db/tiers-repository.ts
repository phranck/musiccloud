/**
 * Repository contract for the tier (API tariff) system (MC-092): read, create,
 * update, and delete tier definitions. The admin dashboard manages tiers; the
 * public Developer Portal reads them for its pricing page.
 */

import type { ApiTier, CreemModeValue, CreemProductMapping, TierOffer } from "@musiccloud/shared";

/** The longest plan or offer id a request may name. */
const MAX_ID_LENGTH = 64;

/**
 * The shape of a plan id.
 *
 * A plan id comes from `nanoid()`, whose alphabet is letters, digits, `_` and
 * `-`, or is seeded, as `tier_free` is. Nothing else makes one, so a request
 * naming any other character names no plan.
 */
export const TIER_ID_PATTERN = "^[A-Za-z0-9_-]+$";

/**
 * The shape of an offer id.
 *
 * Wider than {@link TIER_ID_PATTERN} by the colon, because the offers that
 * existed when plan prices moved onto offers carry ids such as
 * `legacy-offer-month:<tierId>`.
 */
export const OFFER_ID_PATTERN = "^[A-Za-z0-9_:-]+$";

/** A plan id as a route schema states it, for a path parameter or a body property. */
export const tierIdSchema = {
  type: "string",
  minLength: 1,
  maxLength: MAX_ID_LENGTH,
  pattern: TIER_ID_PATTERN,
} as const;

/** An offer id as a route schema states it. */
export const offerIdSchema = {
  type: "string",
  minLength: 1,
  maxLength: MAX_ID_LENGTH,
  pattern: OFFER_ID_PATTERN,
} as const;

export interface TierCreateData {
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired?: boolean;
  color?: string;
  icon?: string | null;
  buttonLabel?: string | null;
  description?: string;
  /** Defaults to `false`, because a plan without offers is free and would be choosable at once. */
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
export type TierCreemProductKey = Omit<CreemProductMapping, "creemProductId">;

export interface TierRepository {
  listTiers(): Promise<ApiTier[]>;
  createTier(data: TierCreateData): Promise<ApiTier>;
  updateTier(id: string, data: TierUpdateData): Promise<ApiTier>;
  deleteTier(id: string): Promise<void>;
  /**
   * Returns the rows from `tier_creem_products` that belong to one Creem
   * environment, mapping each internal tier plus billing interval to the
   * product ID that environment knows.
   *
   * This mapping exists on our side because Creem products carry no metadata
   * field. A price is entered on the offer and applied to the product, and
   * Creem holds what the product charges; we own the tier-to-product link.
   *
   * The mode is required rather than optional because a process talks to one
   * environment only, decided by its API key. Reading the other environment's
   * rows would ask Creem for products that do not exist there.
   *
   * @param mode - The Creem environment whose rows are wanted.
   */
  listCreemProductMappings(mode: CreemModeValue): Promise<CreemProductMapping[]>;

  /**
   * Returns every row from `tier_creem_products`, across both Creem
   * environments.
   *
   * This is for the admin surface, which shows which environment already has a
   * product for a tier and interval and which does not. Nothing that talks to
   * Creem uses it, because a product id only resolves against its own
   * environment.
   */
  listAllCreemProductMappings(): Promise<CreemProductMapping[]>;

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
  findCreemProductMapping(key: TierCreemProductKey): Promise<CreemProductMapping | null>;

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
  createCreemProductMapping(mapping: CreemProductMapping): Promise<void>;

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
