/**
 * @file Apple Music storefront cascade for lookups that carry no storefront.
 *
 * Apple Music's catalog and search index are per storefront, so an ISRC lookup
 * or a text search from another service asks several storefronts in turn.
 * This module owns the order of that cascade, the rules for when a failed
 * storefront still allows a clean miss, and the shared text search across it.
 */
import { type ResourceKind, Service } from "@musiccloud/shared";
import { log } from "../../../lib/infra/logger";
import type { ResolveError } from "../../../lib/resolve/errors";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
import { requireProviderCollection, requireProviderObject } from "../_shared/provider-response.js";
import { type BestCandidate, pickBestCandidate } from "../_shared/rank.js";
import { appleMusicFetch } from "./token.js";

/**
 * Fallback storefronts for cross-service queries that have no URL-derived
 * storefront (i.e. `findByIsrc`, `searchTrack`, `searchAlbum` and
 * `searchArtist` of `appleMusicAdapter`). This is an explicit fallback
 * sequence, not a claim about catalog-size ranking. The attempt count is bounded.
 */
const FALLBACK_STOREFRONTS = ["us", "gb", "de", "jp", "fr"] as const;

/**
 * Maximum storefront attempts. Request timeouts belong to appleMusicFetch;
 * this bounds request count, not a guaranteed end-to-end latency.
 */
const STOREFRONT_CASCADE_LIMIT = 5;

/**
 * Builds the priority-ordered storefront list for catalog/search queries that
 * don't carry a storefront in the URL. Apple Music's catalog and search index
 * are per-storefront - a track present in `de` is invisible to a `us` query.
 *
 * Priority:
 * 1. ISRC country code (registrant - strongest signal when present)
 * 2. APPLE_MUSIC_STOREFRONT env override (operator preference)
 * 3. {@link FALLBACK_STOREFRONTS} (large global catalogs)
 *
 * Notes:
 * - An ISRC registrant prefix is only a lookup hint, not proof of regional
 *   availability or a supported Apple storefront. Unavailable storefronts
 *   fall through under StorefrontCascadeOutcome's status rules.
 * - The list is deduped (case-insensitive) and capped at
 *   {@link STOREFRONT_CASCADE_LIMIT}.
 *
 * @param isrcHint - Optional ISRC whose first two letters name the registrant country.
 * @returns Lowercase two-letter storefront codes in the order they are asked.
 */
export function getStorefrontCascade(isrcHint?: string): string[] {
  const out: string[] = [];
  const add = (s: string | null | undefined): void => {
    const v = s?.toLowerCase();
    if (v && /^[a-z]{2}$/.test(v) && !out.includes(v)) out.push(v);
  };

  if (isrcHint && isrcHint.length >= 2) add(isrcHint.slice(0, 2));
  add(process.env.APPLE_MUSIC_STOREFRONT);
  for (const s of FALLBACK_STOREFRONTS) add(s);
  return out.slice(0, STOREFRONT_CASCADE_LIMIT);
}

/** Confidence at/above which {@link searchAcrossStorefronts} early-exits the cascade. */
const SEARCH_EARLY_EXIT_CONFIDENCE = 0.85;

/**
 * Apple Music wrapper around {@link serviceHttpError} that adds the
 * storefront to the error context (Apple Music's regional 404 case is the
 * most common cause of "track not found" and the storefront is the key
 * diagnostic detail).
 *
 * @param status - HTTP status Apple Music answered with.
 * @param kind - Resource that was requested.
 * @param id - Public lookup identifier or search title.
 * @param storefront - Storefront the request went to.
 * @returns The mapped error with `storefront` in its context.
 */
export function appleMusicHttpError(status: number, kind: ResourceKind, id: string, storefront: string): ResolveError {
  const err = serviceHttpError(Service.AppleMusic, status, kind, id);
  if (err.context) (err.context as Record<string, string | number>).storefront = storefront;
  return err;
}

/**
 * Keeps positive evidence without manufacturing a complete negative from a failed cascade.
 * A 404 storefront may be unavailable while another storefront answers; an
 * authentication, quota or server failure still prevents caching a clean miss.
 */
export class StorefrontCascadeOutcome {
  private answered = false;
  private lastFailure: { status: number; storefront: string } | null = null;

  /** Records response status and returns whether its document may be decoded. */
  record(response: Response, storefront: string): boolean {
    if (response.ok) {
      this.answered = true;
      return true;
    }
    if (!this.lastFailure || response.status !== 404) {
      this.lastFailure = { status: response.status, storefront };
    }
    return false;
  }

  /**
   * Rejects incomplete negative evidence while retaining a validated positive match.
   * @param kind - Resource being matched.
   * @param id - Public lookup identifier or search title.
   * @param matched - Whether a qualifying resource was found despite another failure.
   * @throws The provider failure when no positive evidence resolves the uncertainty.
   */
  throwIfUnresolved(kind: ResourceKind, id: string, matched = false): void {
    if (!this.lastFailure) return;
    const { status, storefront } = this.lastFailure;
    if (!matched && (!this.answered || status !== 404)) {
      throw appleMusicHttpError(status, kind, id, storefront);
    }
    if (matched && status !== 404) {
      log.deviation(
        {
          component: "Apple Music",
          adapterId: Service.AppleMusic,
          errorCode: "MC-API-0004",
          operation: "storefront_catalog_lookup",
          outcome: "positive_partial_storefronts",
          status,
          storefront,
          kind,
        },
        appleMusicHttpError(status, kind, id, storefront),
      );
    }
  }
}

/**
 * Reads Apple's valid empty result object without accepting a missing search envelope.
 * @param results - Search results, where an absent category means no matching resources.
 * @param category - Requested resource category, whose present data must be an array.
 * @returns Reported resources or an empty list for an omitted category.
 * @throws When the root result object or a present category's collection is malformed.
 */
function searchResources<Resource>(
  results: Record<string, { data?: Resource[] }> | undefined,
  category: "songs" | "albums" | "artists",
): Resource[] {
  const root = requireProviderObject(results, Service.AppleMusic, `${category} search`);
  const resources = root[category];
  return resources === undefined
    ? []
    : requireProviderCollection(resources?.data, Service.AppleMusic, `${category} search`);
}

/**
 * How many hits each storefront search asks Apple Music for: `5`.
 */
const APPLE_MUSIC_SEARCH_LIMIT = 5;

/**
 * One text search across the storefront cascade.
 *
 * @property category - The Apple search category, which is both the `types`
 *   parameter and the key of the results object: `"songs"`, `"albums"` or
 *   `"artists"`.
 * @property term - The search text, already URL-encoded.
 * @property kind - What is searched for, which a cascade failure names.
 * @property id - The title or name searched for, which a cascade failure names.
 * @property map - Turns one Apple resource into the normalized entity.
 * @property score - Scores one entity; receives its position in its
 *   storefront's hits, counted from `0`.
 * @property toResult - Turns the best entity across all storefronts and its
 *   score into the adapter result. Its `found` decides whether a failed
 *   storefront is only logged or thrown.
 */
interface StorefrontSearch<Resource, Entity, Result extends { found: boolean }> {
  category: "songs" | "albums" | "artists";
  term: string;
  kind: ResourceKind;
  id: string;
  map: (resource: Resource) => Entity;
  score: (entity: Entity, index: number) => number;
  toResult: (best: Entity | null, confidence: number) => Result;
}

/**
 * Searches each storefront of `getStorefrontCascade` and keeps the best hit
 * across all of them.
 *
 * Within one storefront the earliest of the highest scores wins, through
 * `pickBestCandidate`. A later storefront replaces the kept hit only when its
 * best scores strictly higher. The cascade stops once the kept hit reaches
 * `SEARCH_EARLY_EXIT_CONFIDENCE`, so the common case asks one storefront.
 *
 * @param search - What to search for and how to score and report it.
 * @returns The result `search.toResult` builds from the best hit.
 * @throws The provider failure of a storefront when no storefront answered,
 *   or when the result is a miss and a storefront failed with anything but
 *   `404`, because that miss would not be complete.
 */
export async function searchAcrossStorefronts<Resource, Entity, Result extends { found: boolean }>(
  search: StorefrontSearch<Resource, Entity, Result>,
): Promise<Result> {
  let kept: BestCandidate<Entity> = { best: null, confidence: 0 };
  const cascade = new StorefrontCascadeOutcome();

  for (const storefront of getStorefrontCascade()) {
    const response = await appleMusicFetch(
      `/catalog/${storefront}/search?types=${search.category}&term=${search.term}&limit=${APPLE_MUSIC_SEARCH_LIMIT}`,
    );
    if (!cascade.record(response, storefront)) continue;

    const data = await response.json();
    const entities = searchResources<Resource>(data.results, search.category).map(search.map);
    const storefrontBest = pickBestCandidate(entities, search.score);
    if (storefrontBest.confidence > kept.confidence) kept = storefrontBest;

    if (kept.confidence >= SEARCH_EARLY_EXIT_CONFIDENCE) break;
  }

  const result = search.toResult(kept.best, kept.confidence);
  cascade.throwIfUnresolved(search.kind, search.id, result.found);
  return result;
}
