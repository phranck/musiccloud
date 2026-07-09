/**
 * @file Creem product catalog fetch with in-memory TTL cache (MC-110, Task 7).
 *
 * Responsibilities:
 * - Read the `tier_creem_products` mapping table (our side) to learn which
 *   Creem product ID corresponds to each (tierId, interval) pair.
 * - Fetch the live price and currency for each product from the Creem API.
 * - Return a two-level map: `tierId -> interval -> { productId, price, currency }`.
 * - Cache the result for `CATALOG_TTL_MS` milliseconds so repeated calls
 *   within one deployment window do not hammer the Creem API or the DB.
 */

import { getTierRepository } from "../db/index.js";
import { getCreemClient } from "./creem-client.js";

/**
 * How long the in-memory catalog is considered fresh.
 *
 * Five minutes balances two concerns: price changes at Creem are rare (at most
 * a few times per year), but we do not want a cache that would survive a
 * price-update deployment unnoticed. With a 5-minute TTL a freshly restarted
 * backend picks up any Creem price change within minutes, while steady-state
 * traffic incurs at most one Creem API call per 5 minutes.
 */
const CATALOG_TTL_MS = 5 * 60_000;

/** Live price entry for a single (tierId, interval) combination (MC-110). */
export interface CreemTierPrice {
  /** The Creem product ID for this tier-interval pair. */
  productId: string;
  /**
   * Price in the smallest currency unit (cents for EUR/USD, etc.), as returned
   * directly by the Creem API. Creem is the source of truth for this value.
   */
  price: number;
  /** ISO 4217 currency code returned by Creem (e.g. `"EUR"`). */
  currency: string;
}

/**
 * Two-level catalog map: `tierId -> interval -> live price from Creem`.
 *
 * The outer key is our internal tier identifier (e.g. `"tier_club"`).
 * The inner key is our normalised billing interval (`"month"` or `"year"`).
 * The value is the live price fetched from the Creem API.
 */
export type CreemCatalog = Record<string, Record<string, CreemTierPrice>>;

/** Cached catalog, or `null` when the cache has been cleared or never populated. */
let cachedCatalog: CreemCatalog | null = null;

/**
 * Unix timestamp (ms) of the last successful catalog fetch. `0` means the
 * cache has never been populated or has been explicitly cleared.
 */
let cachedAt = 0;

/**
 * Clears the module-level catalog cache so the next call to `getCreemCatalog`
 * performs a fresh DB and Creem API round-trip.
 *
 * This is exported primarily for test isolation: call it in `beforeEach` to
 * guarantee each test starts from a cold cache.
 */
export function resetCreemCatalogCache(): void {
  cachedCatalog = null;
  cachedAt = 0;
}

/**
 * Returns the Creem product catalog as a two-level map keyed by internal tier
 * ID and billing interval.
 *
 * Design:
 * - **Prices are the source of truth at Creem.** We never store prices in our
 *   own database; we always fetch them from the Creem API so that a price
 *   change at Creem is reflected automatically within one TTL window.
 * - **The tier-to-product mapping lives in our DB** (`tier_creem_products`),
 *   because Creem products carry no metadata field (verified against
 *   `creem@1.5.3` and `docs.creem.io` on 2026-07-09). The mapping is seeded
 *   once via `scripts/creem-seed.mjs` and never changes unless tiers are
 *   re-seeded.
 * - **In-memory TTL cache** (`CATALOG_TTL_MS = 5 minutes`): the catalog is
 *   read once per process and served from memory for subsequent requests. This
 *   avoids a DB query and a Creem API call on every pricing-page load while
 *   keeping price data fresh within a short window. The cache is scoped to the
 *   module; a process restart always triggers a fresh fetch.
 *
 * @returns A map of `tierId -> interval -> { productId, price, currency }`.
 */
export async function getCreemCatalog(): Promise<CreemCatalog> {
  if (cachedCatalog !== null && Date.now() - cachedAt < CATALOG_TTL_MS) {
    return cachedCatalog;
  }

  const repo = await getTierRepository();
  const mappings = await repo.listCreemProductMappings();

  const client = getCreemClient();
  const catalog: CreemCatalog = {};

  for (const mapping of mappings) {
    const product = await client.products.get(mapping.creemProductId);

    if (!catalog[mapping.tierId]) {
      catalog[mapping.tierId] = {};
    }

    catalog[mapping.tierId]![mapping.interval] = {
      productId: mapping.creemProductId,
      price: product.price,
      currency: product.currency,
    };
  }

  cachedCatalog = catalog;
  cachedAt = Date.now();
  return catalog;
}
