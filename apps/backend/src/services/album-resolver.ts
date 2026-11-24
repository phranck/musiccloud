/**
 * @file Album resolve pipeline: URL -> cross-service link set.
 *
 * Parallel in structure to `artist-resolver.ts` and the track half of
 * `resolver.ts`, but with album-specific identifiers and matching
 * strategies. Entry points are `resolveAlbumUrl` (URL input) and
 * `resolveAlbumTextSearch` (free-text input).
 *
 * This file holds the public types and the pipeline. The cache lookups and
 * the gap fill of a cached album live in `album-resolver/cache.ts`, and the
 * matching strategies below live in `album-resolver/matching.ts`.
 *
 * ## Three matching strategies, in order
 *
 * Per target service, `resolveAlbumOnService` tries three strategies
 * and stops at the first hit. The order is deliberately from strongest
 * to weakest evidence:
 *
 * | Strategy          | Evidence                     | Confidence  |
 * | ----------------- | ---------------------------- | ----------- |
 * | UPC lookup        | Shared Universal Product Code| 1.0         |
 * | ISRC inference    | Sampled track ISRCs agree    | 0.7 to 0.9  |
 * | Text search       | Title + artist fuzzy match   | scored      |
 *
 * UPC is the album-level analogue of ISRC: a strict, globally unique
 * ID assigned by the music industry, so a UPC match is as strong as an
 * identifier match gets.
 *
 * ## ISRC inference (`inferAlbumViaIsrc`)
 *
 * Many services expose `findByIsrc` for tracks but not an album-level
 * ID lookup. We piggyback on the track API: sample up to
 * `ISRC_SAMPLE_SIZE` (5) tracks from the source album, call
 * `findByIsrc` on each against the target service, collect the album
 * names those tracks belong to, and pick the most common. If at least
 * `ISRC_INFERENCE_MIN_MATCH_FRACTION` (1/3) of sampled tracks agree on
 * the same album name, we accept it.
 *
 * Confidence is scored in the 0.7 to 0.9 range: stronger than pure
 * text search (ISRCs verify the tracks exist on the target) but
 * weaker than a direct UPC match (album identity is inferred, not
 * asserted). The sampling step spreads across the tracklist evenly so
 * a single disc-one block does not dominate the vote.
 *
 * Once the name is inferred, we follow up with a real album search
 * (`resolveAlbumViaSearch`) to get a proper album URL, artwork, and
 * `topTrackPreviewUrl`. If that follow-up fails, we fall back to the
 * first sampled track's URL - a working link on the target, even if
 * it points at a track rather than the album.
 *
 * ## `topTrackPreviewUrl` threading
 *
 * Album payloads carry a preview URL for the share page's inline
 * player. Deezer's `/search/album` endpoint does not return tracks,
 * so `resolveAlbumViaSearch` follows up with `getAlbum(sourceId)`
 * when the search result lacks a preview and the adapter supports previews.
 * Without this, Deezer-matched albums would ship a silent preview player.
 *
 * ## YouTube Music derivation
 *
 * YouTube exposes albums as playlists with an `OLAK5uy_` prefix in
 * the `list=` query param. The YT and YT Music URLs map mechanically:
 * swap `www.youtube.com/...?list=OLAK5uy_...` to
 * `music.youtube.com/playlist?list=OLAK5uy_...`. If YouTube matched
 * via its playlist endpoint, we synthesise the YouTube Music link
 * from the same playlist ID instead of running a separate search.
 * Fresh results and cached gap fills share this derivation, and newly
 * derived cached links are persisted through `addLinksToAlbum`.
 *
 * ## Recording artwork and completion
 *
 * `artwork.ts` owns cover eligibility and extra lookup priority. YouTube images
 * are never recording fallbacks, and Apple restrictions remain. A valid stored
 * cover wins over enrichment. Cached cover changes use `recording-artwork.ts`
 * and a cover-only compare-and-set; artist portraits use a separate policy.
 * A missing cover permits bounded metadata refresh even with complete links
 * and a fresh preview, because stored service links do not include covers.
 *
 * Album lookups await their complete `Promise.allSettled` batch. This result
 * type has no detached late-link contract; that contract belongs to tracks in
 * `resolver.ts`, whose file header maps the complete request/persistence chain.
 */
import type { MatchMethod } from "@musiccloud/shared";
import { log } from "../lib/infra/logger.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError, searchExhaustedError } from "../lib/resolve/errors.js";
import { fillMissingAlbumServices, tryAlbumCache } from "./album-resolver/cache.js";
import { pickLabelFromLinks, resolveAlbumAcrossServices } from "./album-resolver/matching.js";
import { pickRecordingArtworkUrl } from "./artwork.js";
import { confidenceForMethod } from "./confidence.js";
import { IDENTIFIER_MATCH_CONFIDENCE } from "./constants.js";
import { collectAlbumExternalIds } from "./external-ids.js";
import { findInactiveServiceFor, getActiveAdapters } from "./index.js";
import { findAdapterForUrl, sourceLink } from "./resolved-links.js";
import { serviceLinkLookup } from "./service-link-lookup.js";
import type { ExternalIdRecord, NormalizedAlbum, ServiceAdapter, ServiceId } from "./types.js";

// ─── Public Types ───────────────────────────────────────────────────────────

export interface ResolvedAlbumLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: MatchMethod;
  externalId?: string;
  /** Preview URL of the most popular track from this service (Deezer only) */
  topTrackPreviewUrl?: string;
  /** Artwork URL from the resolved album (used for artwork fallback) */
  artworkUrl?: string;
  /**
   * Record label from the resolved album. Drives the `label` backfill
   * when the source adapter does not return one (e.g. Spotify after the
   * Feb-2026 removal of `album.label`).
   */
  label?: string;
  /**
   * UPC reported by this service for the album. May differ from the
   * source album's UPC for regional re-issues. Drives the
   * `album_external_ids` aggregation.
   */
  upc?: string;
  /**
   * MusicBrainz Release MBID reported by this service for the album.
   * Today only the MusicBrainz adapter populates this. Drives
   * `album_external_ids` aggregation as `idType='mbid'`.
   */
  mbid?: string;
}

export interface AlbumResolutionResult {
  sourceAlbum: NormalizedAlbum;
  links: ResolvedAlbumLink[];
  albumId?: string; // present when loaded from cache
  /** Stored share id prevents a cached snapshot from rewriting concurrent metadata. */
  shortId?: string;
  /**
   * External-id observations harvested across every adapter contacted
   * during the album resolve. Persisted into `album_external_ids`.
   * Always present; empty array when no IDs were collected.
   */
  externalIds: ExternalIdRecord[];
}

// ─── Identify album service ───────────────────────────────────────────────────

/**
 * Finds the active adapter that recognizes an album URL.
 *
 * @param url - The album URL, tracking parameters stripped.
 * @returns The first active adapter whose `detectAlbumUrl` returns an id, or
 *   `undefined` when none does.
 */
async function identifyAlbumService(url: string): Promise<ServiceAdapter | undefined> {
  return findAdapterForUrl(await getActiveAdapters(), url, "detectAlbumUrl");
}

// ─── Main entry points ────────────────────────────────────────────────────────

/**
 * Main URL entry point. Strips tracking params, cache-hits by URL, by
 * the link's own service id (source or UPC links only) or by UPC,
 * otherwise walks the full pipeline: identify source, fetch metadata,
 * resolve across other services, enrich, persist.
 *
 * @param inputUrl - streaming-service URL identifying an album
 * @returns resolved album result with source plus cross-service links
 * @throws `ResolveError("SERVICE_DISABLED")` if the URL belongs to a currently-disabled plugin
 * @throws `ResolveError("NOT_MUSIC_LINK")` if no adapter recognizes the URL shape
 * @throws `ResolveError("INVALID_URL")` if the adapter cannot extract an album ID
 * @throws `ResolveError("SERVICE_DOWN")` (or the adapter's own MC code) if metadata fetch fails
 */
export async function resolveAlbumUrl(inputUrl: string): Promise<AlbumResolutionResult> {
  const cleanUrl = stripTrackingParams(inputUrl);

  // 1. Cache lookup by URL
  const cached = await tryAlbumCache({ url: cleanUrl });
  if (cached) return fillMissingAlbumServices(cached);

  // 2. Identify which service the URL belongs to. A source that is switched
  //    off or lacks credentials surfaces SERVICE_DISABLED instead of the
  //    generic NOT_MUSIC_LINK.
  const inactiveService = await findInactiveServiceFor(cleanUrl);
  if (inactiveService) {
    throw new ResolveError("SERVICE_DISABLED", undefined, { service: inactiveService });
  }
  const sourceAdapter = await identifyAlbumService(cleanUrl);
  if (!sourceAdapter || !sourceAdapter.getAlbum || !sourceAdapter.detectAlbumUrl) {
    throw new ResolveError("NOT_MUSIC_LINK", "Unrecognized album URL");
  }

  const albumId = sourceAdapter.detectAlbumUrl(cleanUrl);
  if (!albumId) {
    throw new ResolveError("INVALID_URL", "Could not extract album ID from URL");
  }

  // 2b. Cache lookup by the link's own id: an album the database already holds
  //     with this link resolves without asking the service, so a link it knows
  //     still resolves while that service is down.
  const cachedByLink = await tryAlbumCache({ serviceLink: serviceLinkLookup(sourceAdapter, albumId) });
  if (cachedByLink) return fillMissingAlbumServices(cachedByLink);

  // 3. Fetch album metadata
  let sourceAlbum: NormalizedAlbum;
  try {
    sourceAlbum = await sourceAdapter.getAlbum(albumId);
  } catch (error) {
    // Preserve the adapter's MC code (e.g. MC-API-1404, MC-AUTH-2401) so the
    // user sees the specific reason rather than a generic "service down".
    if (error instanceof ResolveError) throw error;
    throw new ResolveError(
      "SERVICE_DOWN",
      `Failed to fetch album from ${sourceAdapter.id}: ${error instanceof Error ? error.message : error}`,
    );
  }

  // 4. Cache lookup by UPC (dedup: same album from different URL)
  if (sourceAlbum.upc) {
    const cachedByUpc = await tryAlbumCache({ upc: sourceAlbum.upc });
    if (cachedByUpc) return fillMissingAlbumServices(cachedByUpc);
  }

  // 5. Resolve on all other services in parallel
  const links = await resolveAlbumAcrossServices(sourceAlbum, sourceAdapter);

  // 6. Keep a cover that is not Apple's. Tidal's API v2 and the Apple Music
  // adapter return none, so their albums borrow one from another service.
  sourceAlbum = {
    ...sourceAlbum,
    artworkUrl: pickRecordingArtworkUrl(sourceAlbum.artworkUrl, links, sourceAlbum.sourceService),
  };

  // 6b. Same idea for label: Spotify removed `album.label` in Feb 2026,
  // and not every adapter returns one. Borrow from Deezer first
  // (keyless, broad), Apple Music second.
  if (!sourceAlbum.label) {
    const label = pickLabelFromLinks(links);
    if (label) sourceAlbum = { ...sourceAlbum, label };
  }

  // 7. Add source service link
  links.unshift(
    sourceLink(sourceAdapter, sourceAlbum, { confidence: IDENTIFIER_MATCH_CONFIDENCE, matchMethod: "source" }),
  );

  return {
    sourceAlbum,
    links,
    externalIds: collectAlbumExternalIds(sourceAlbum, links),
  };
}

/**
 * Text-search entry point. Iterates adapters in registry order
 * (`registry.ts` PLUGINS array), returns on the first match.
 * Caches by UPC before running cross-service resolve.
 *
 * @param query - free-text album title (also used as artist in the
 *                search, since adapters accept both in one query field)
 * @returns resolved album result
 * @throws `ResolveError("TRACK_NOT_FOUND")` if no adapter finds a matching album
 */
export async function resolveAlbumTextSearch(query: string): Promise<AlbumResolutionResult> {
  const active = await getActiveAdapters();
  const searchAdapters = active.filter(
    (a) => Boolean(a.albumCapabilities?.supportsAlbumSearch) && Boolean(a.searchAlbum),
  );
  let failedSearches = 0;

  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchAlbum?.({
        title: query,
        artist: query,
      });

      if (result?.found && result.album) {
        // Cache lookup by UPC before full cross-service resolve
        if (result.album.upc) {
          const cached = await tryAlbumCache({ upc: result.album.upc });
          if (cached) return fillMissingAlbumServices(cached);
        }

        const links = await resolveAlbumAcrossServices(result.album, adapter);
        let sourceAlbum = {
          ...result.album,
          artworkUrl: pickRecordingArtworkUrl(result.album.artworkUrl, links, result.album.sourceService),
        };

        if (!sourceAlbum.label) {
          const label = pickLabelFromLinks(links);
          if (label) sourceAlbum = { ...sourceAlbum, label };
        }

        links.unshift(
          sourceLink(adapter, sourceAlbum, {
            confidence: confidenceForMethod("search", result.confidence),
            matchMethod: "search",
          }),
        );

        return {
          sourceAlbum,
          links,
          externalIds: collectAlbumExternalIds(sourceAlbum, links),
        };
      }
    } catch (error) {
      failedSearches++;
      log.deviation(
        {
          adapterId: adapter.id,
          component: "AlbumResolver",
          errorCode: "MC-API-0004",
          operation: "album_text_search",
          outcome: "next_adapter",
        },
        error,
      );
    }
  }

  throw searchExhaustedError(searchAdapters.length, failedSearches, "No album found for the search query");
}
