/**
 * @file Resolver-chain navigation and ownership for recording destinations.
 *
 * Start here to follow a URL, text query, or picked candidate through matching,
 * cache enrichment, persistence, and the later read-only share response. Album
 * and artist matching remain in `album-resolver.ts` and `artist-resolver.ts`.
 * This module coordinates tracks rather than defining provider HTTP contracts.
 *
 * ## Request and source selection
 *
 * `routes/resolve.ts` dispatches a URL, text query, or `selectedCandidate` after
 * its registered authentication scope and client/site rate limits. The landing
 * client's `apps/frontend/src/hooks/useAppState.ts` sends
 * text first and the selected provider/id in its follow-up. A stored YouTube
 * source therefore does not imply that every caller pasted a YouTube URL.
 *
 * `resolve-response.ts` classifies URLs through plugin detectors and chooses
 * the track, album, or artist resolver. `resolveQuery` is the track front door;
 * `resolveUrl` strips tracking, expands registered short links, and coalesces
 * concurrent requests for the same canonical URL with `resolveCanonicalUrlOnce`.
 *
 * Text discovery walks `plugins/registry.ts` order. Native candidate lists use
 * `AUTO_SELECT_THRESHOLD` to choose automatic resolution or disambiguation.
 * Providers exposing only one match resolve under their own accepted score.
 * `resolveSelectedCandidate` fetches the chosen id rather than searching again.
 * Provider order and enabled/credential gates belong to the registry, not here.
 *
 * ## Cache identity is not destination completeness
 *
 * The URL path checks canonical URL, then a known provider id, then ISRC after
 * fetching metadata. Provider-id cache lookup accepts source/identifier links,
 * not potentially ambiguous text matches. Candidate selection also checks the
 * fetched canonical URL because video sources have no ISRC.
 *
 * Every recognized cache hit enters `fillMissingServices`. It preserves newly
 * confirmed source observations before querying gaps, so a redundant search
 * cannot discard a destination already obtained by the caller. Observed ISRCs
 * guide lookups without replacing canonical display metadata or the share id.
 * The canonical row does not expire; preview rows have their own expiry.
 *
 * A gap-fill records only fulfilled, empty lookups as `service_link_misses`.
 * Rejections, malformed replies, and timeouts are not catalogue misses. Covered
 * services refreshed for enrichment do not acquire contradictory miss rows.
 * `constants.ts` owns the miss TTL and all matching/disambiguation thresholds.
 *
 * ## Per-provider matching and link normalization
 *
 * `resolveOnService` uses a known provider id for metadata refresh, otherwise
 * ISRC before text. A failed identifier request is an upstream failure, while
 * an actual empty identifier result permits text fallback. Adapters own their
 * HTTP contracts and candidate validation. `plugins/_shared/confidence.ts`
 * owns free-text interpretation, bounded title interpretations and recording
 * guards. `track-search-query.ts` builds requests from that same policy.
 * `recordingSearchQuery` applies verified provider artist-label interpretations
 * to lookup values only. `resolveViaSearch` checks accepted adapter results
 * again before link or negative-cache persistence. Canonical metadata survives.
 * `confidence.ts` interprets match methods; `constants.ts` owns acceptance gates.
 *
 * `normalizeTrackLinks` runs after source assembly and on completed deadline
 * batches. It keeps one destination per provider and derives YouTube Music
 * only from the shared `lib/platform/youtube-video.ts` recording-id grammar.
 * A `search-fallback` opens search results, not the recording; it never seeds
 * a derived recording link. Registry filtering applies the parent's toggle to
 * persisted YouTube Music aliases as well as ordinary destinations.
 *
 * ## Deadline and persistence ownership
 *
 * `fan-out-deadline.ts` owns `RESOLVE_RESPONSE_DEADLINE_MS`. Early results form
 * the response while each pending lookup remains bounded by `ADAPTER_TIMEOUT_MS`.
 * A deadline is not cancellation. Late successful destinations remain useful.
 *
 * `completeFreshResolution` applies visibility, normalization, artwork policy,
 * and initial identifier collection. `persist-resolution.ts` stores a fresh
 * recording or preserves cached ids. Only after this primary persistence does
 * `resolve-response.ts` start `persistLateTrackLinks`, because late writes need
 * a real track id. Cached gap-fill batches already know that id and persist
 * themselves. Both store links, provider-specific identifier observations, and
 * previews. `external-ids.ts` owns provenance and deduplication of identifiers.
 * Preview expiry is parsed by `lib/preview-url.ts`; an encoded expiry remains
 * significant even for a provider preferred by the preview-selection policy.
 *
 * ## Artwork and share reads
 *
 * `artwork.ts` owns recording-cover eligibility and bounded lookup priority.
 * YouTube imagery is never a recording fallback, and Apple restrictions remain.
 * Fresh image provenance identifies the image's provider, not merely whichever
 * service supplied title metadata. Artist portraits keep their separate policy.
 *
 * Cached/late changes use `recording-artwork.ts` and cover-only compare-and-set
 * storage, so another resolve or an operator's valid cover is not overwritten.
 * Stored links contain no covers, which is why a missing cover permits bounded
 * metadata refresh even when destinations and previews are already complete.
 *
 * `lib/server/share-page.ts` filters stored recording images for output and OG
 * metadata without upstream calls or repair writes. Opening a share does not
 * resolve missing destinations. Explicit resolution enriches service coverage;
 * `routes/share.ts` separately owns HTTP caching of the resulting payload.
 *
 * The OG metadata escape hatch is entered only after metadata fetch fails and
 * the availability check reports missing configuration. Registry gating still
 * runs first; a quota failure is not a reason to scrape. Page metadata enters
 * ordinary matching and image policy rather than bypassing either boundary.
 *
 * ## Module layout
 *
 * This file keeps the entry points and the order of each pipeline. The steps
 * live in `track-resolver/`:
 *
 * - `cache.ts` holds `tryCache`, `fillMissingServices` and the service misses.
 * - `fan-out.ts` holds `resolveAcrossServices` and the per-provider matching.
 * - `completion.ts` holds `completeFreshResolution` and `normalizeTrackLinks`.
 * - `persist-links.ts` stores gap-fill batches and late links.
 * - `candidates.ts` picks the disambiguation candidates.
 * - `page-scrape.ts` holds the OG metadata escape hatch.
 * - `types.ts` holds the result types this file re-exports.
 */

import { isShortLinkHost } from "@musiccloud/shared";
import { createSingleFlight } from "../lib/concurrency.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { isUrl, stripTrackingParams, validateMusicUrl } from "../lib/platform/url.js";
import { ResolveError, searchExhaustedError } from "../lib/resolve/errors.js";
import {
  AUTO_SELECT_THRESHOLD,
  IDENTIFIER_MATCH_CONFIDENCE,
  LINK_QUALITY_THRESHOLD,
  MATCH_MIN_CONFIDENCE,
  MAX_CANDIDATES,
} from "./constants.js";
import { findInactiveServiceFor, getActiveAdapters, identifyService, isPluginAvailable } from "./index.js";
import { parseLastfmUrl } from "./plugins/lastfm/url-search.js";
import { sourceLink } from "./resolved-links.js";
import { serviceLinkLookup } from "./service-link-lookup.js";
import { fillMissingServices, tryCache } from "./track-resolver/cache.js";
import { selectDiverseSearchCandidates } from "./track-resolver/candidates.js";
import { completeFreshResolution } from "./track-resolver/completion.js";
import { resolveAcrossServices, resolvedTrackLink } from "./track-resolver/fan-out.js";
import { resolveUrlViaScrape } from "./track-resolver/page-scrape.js";
import type { ResolutionResult, TextSearchResult } from "./track-resolver/types.js";
import type { NormalizedTrack, SearchCandidate, SearchQuery } from "./types.js";

export { persistLateTrackLinks } from "./track-resolver/persist-links.js";
export type { ResolutionResult, ResolvedLink, TextSearchResult } from "./track-resolver/types.js";

/**
 * Confidence scoring constants (unified strategy).
 *
 * MATCH_MIN_CONFIDENCE: Minimum score for an adapter to consider a result "found".
 * LINK_QUALITY_THRESHOLD: Minimum score for inclusion in final cross-service results.
 * AUTO_SELECT_THRESHOLD: Above this, text search auto-selects without disambiguation.
 * CANDIDATE_MIN_CONFIDENCE: Minimum score to appear in disambiguation list.
 * CACHE_CONFIDENCE: Confidence assigned to DB-cached search results.
 * SEARCH_FALLBACK_CONFIDENCE: Confidence for generic "search on X" fallback links.
 */
export { LINK_QUALITY_THRESHOLD, MATCH_MIN_CONFIDENCE };

/**
 * If `url` is a known short link, follows the redirect (HEAD) and returns the
 * final canonical URL. Falls back to the original URL on network failure.
 *
 * Which hosts serve short links is the shared table of music-link hosts, so a
 * service that adds one is followed here once its entry names it.
 */
export async function expandShortLink(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!isShortLinkHost(parsed.hostname)) return url;
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" });
    if (res.url && res.url !== url) return res.url;
  } catch (error) {
    // A network failure falls through so the caller can surface a meaningful error
    log.deviation(
      {
        component: "Resolver",
        errorCode: "MC-API-0004",
        operation: "expand_short_link",
        outcome: "original_url_fallback",
      },
      error,
    );
  }
  return url;
}

/**
 * Main entry point used by both public resolve routes. Dispatches to
 * `resolveUrl` for URL input and `resolveTextSearch` for free text.
 * URL validation runs *before* dispatch so unsupported content types
 * (e.g. playlists, podcasts) surface a precise error rather than
 * entering the track pipeline.
 *
 * @param input - raw user input, URL or text
 * @param expandedUrl - the input already passed through `expandShortLink`,
 *   when the caller expanded it to classify the URL, so it is not expanded a
 *   second time. Ignored for text input.
 * @returns resolved track result
 * @throws `ResolveError` with the validation code when the input is a
 *         non-track URL, or any of the pipeline errors documented on
 *         `resolveUrl` / `resolveTextSearch`
 */
export async function resolveQuery(input: string, expandedUrl?: string): Promise<ResolutionResult> {
  const trimmed = input.trim();

  if (isUrl(trimmed)) {
    // Last.fm is no streaming service. A Popular Tracks row or a genre-search
    // result links there, so the link resolves as the search it stands for.
    const lastfmSearch = parseLastfmUrl(trimmed);
    if (lastfmSearch) return resolveTextSearch(lastfmSearch.text, lastfmSearch.structured);

    // Validate URL for unsupported content types
    const validation = validateMusicUrl(trimmed);
    if (!validation.valid) {
      throw new ResolveError(validation.code, validation.message);
    }
    // Pass the raw URL, because resolveUrl strips tracking params and expands short links
    return resolveUrl(trimmed, expandedUrl);
  }

  return resolveTextSearch(trimmed);
}

/**
 * URL input pipeline. See the file header for the three-layer cache,
 * SERVICE_DISABLED vs NOT_MUSIC_LINK ordering, preview URL preference,
 * artwork rule, and OG-scrape escape hatch.
 *
 * @param inputUrl - streaming-service URL identifying a track
 * @param preExpandedUrl - `inputUrl` already passed through `expandShortLink`
 *   by the caller; when absent it is expanded here
 * @returns resolved track result
 * @throws `ResolveError("SERVICE_DISABLED")` if the URL belongs to a currently-disabled plugin
 * @throws `ResolveError("NOT_MUSIC_LINK")` if no adapter recognizes the URL shape
 * @throws `ResolveError("INVALID_URL")` if the adapter cannot extract a track ID
 * @throws `ResolveError("SERVICE_DOWN")` (or adapter MC code) if metadata fetch fails and scrape also fails
 */
export async function resolveUrl(inputUrl: string, preExpandedUrl?: string): Promise<ResolutionResult> {
  // Strip tracking params, then expand short links (e.g. link.deezer.com/s/…)
  const strippedInput = stripTrackingParams(inputUrl);
  const expandedUrl = preExpandedUrl ?? (await expandShortLink(strippedInput));
  const cleanUrl = stripTrackingParams(expandedUrl); // strip again in case expanded URL carries UTMs

  // Two requests for the same link at once share one resolve, so the second
  // neither runs the fan-out a second time nor persists a second track.
  return resolveCanonicalUrlOnce(cleanUrl, () => resolveCanonicalUrl(cleanUrl));
}

/** One resolve per canonical URL at a time. */
const resolveCanonicalUrlOnce = createSingleFlight<string, ResolutionResult>();

/**
 * The URL pipeline past short-link expansion: the cache lookups, then the
 * source service, then the other services.
 *
 * @param cleanUrl - The canonical URL, tracking parameters stripped.
 * @returns The resolved track.
 */
async function resolveCanonicalUrl(cleanUrl: string): Promise<ResolutionResult> {
  // 1. Cache lookup by the URL the track was first resolved from
  const cachedByCanonical = await tryCache({ url: cleanUrl });
  if (cachedByCanonical) return fillMissingServices(cachedByCanonical);

  // 2. Identify which service the URL belongs to.
  //    Check against ALL plugins first so we can distinguish a truly
  //    unknown URL (NOT_MUSIC_LINK) from a known-but-disabled one
  //    (SERVICE_DISABLED). The user controls which link to paste; the
  //    admin controls which plugins are on.
  const inactiveService = await findInactiveServiceFor(cleanUrl);
  if (inactiveService) {
    throw new ResolveError("SERVICE_DISABLED", undefined, { service: inactiveService });
  }
  const sourceAdapter = await identifyService(cleanUrl);
  if (!sourceAdapter) {
    throw new ResolveError("NOT_MUSIC_LINK", "Unrecognized music service URL");
  }

  const trackId = sourceAdapter.detectUrl(cleanUrl);
  if (!trackId) {
    throw new ResolveError("INVALID_URL", "Could not extract track ID from URL");
  }

  // 2b. Cache lookup by the link's own id: a track the database already holds
  //     with this link resolves without asking the service, so a link it knows
  //     still resolves while that service is down.
  const cachedByLink = await tryCache({ serviceLink: serviceLinkLookup(sourceAdapter, trackId) });
  if (cachedByLink) return fillMissingServices(cachedByLink);

  // 3. Fetch metadata
  let sourceTrack: NormalizedTrack;
  try {
    sourceTrack = await sourceAdapter.getTrack(trackId);
  } catch (error) {
    if (!isPluginAvailable(sourceAdapter.id)) {
      return resolveUrlViaScrape(cleanUrl, sourceAdapter.id);
    }
    if (error instanceof ResolveError) throw error;
    throw new ResolveError(
      "SERVICE_DOWN",
      `Failed to fetch track from ${sourceAdapter.id}: ${error instanceof Error ? error.message : error}`,
    );
  }

  // 3b. Cache lookup by ISRC (in case same track was resolved via different URL)
  if (sourceTrack.isrc) {
    const cachedByIsrc = await tryCache({ isrc: sourceTrack.isrc });
    if (cachedByIsrc)
      return fillMissingServices(cachedByIsrc, [
        resolvedTrackLink(sourceAdapter, sourceTrack, IDENTIFIER_MATCH_CONFIDENCE, "source"),
      ]);
  }

  // 4. Resolve on all other services in parallel
  const { links, lateLinks } = await resolveAcrossServices(sourceTrack, sourceAdapter);

  // 5. Add the source service link. It was not found by any method: it is the
  // address the request came in on, which `source` says and `isrc` did not.
  links.unshift(
    sourceLink(sourceAdapter, sourceTrack, {
      confidence: IDENTIFIER_MATCH_CONFIDENCE,
      matchMethod: "source",
      previewUrl: sourceTrack.previewUrl,
    }),
  );

  // Source assembly is complete before preview, alias, and recording-cover selection.
  return completeFreshResolution(sourceTrack, links, lateLinks);
}

/**
 * Resolves a search to one recording, taking the first active service that
 * reports a match.
 *
 * @param query - The search as text, used as free text when `structured` is absent.
 * @param structured - The title and artist to search for. Each service then
 *   only reports a recording by that artist, so a search for an artist's song
 *   never resolves to another artist's song.
 * @returns The resolved recording with its links on every service.
 * @throws `ResolveError` when no service reports a match.
 */
export async function resolveTextSearch(query: string, structured?: SearchQuery): Promise<ResolutionResult> {
  // Service search: try all active adapters
  const searchAdapters = await getActiveAdapters();
  let failedSearches = 0;
  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack(structured ?? { title: query, artist: query });

      if (result.found && result.track) {
        // Cache lookup by ISRC before full cross-service resolve
        if (result.track.isrc) {
          const cached = await tryCache({ isrc: result.track.isrc });
          if (cached)
            return fillMissingServices(cached, [resolvedTrackLink(adapter, result.track, result.confidence, "search")]);
        }

        const { links, lateLinks } = await resolveAcrossServices(result.track, adapter);
        links.unshift(sourceLink(adapter, result.track, { confidence: result.confidence, matchMethod: "search" }));

        return completeFreshResolution(result.track, links, lateLinks);
      }
    } catch (error) {
      failedSearches++;
      log.debug("Resolver", `[${adapter.id}] text search failed:`, error instanceof Error ? error.message : error);
    }
  }

  throw searchExhaustedError(searchAdapters.length, failedSearches, "No track found for the search query");
}

/**
 * Text search variant used by the authenticated POST endpoint.
 *
 * Returns `{ kind: "resolved" }` when a single clear match exists
 * (either through the adapter's native candidate API, or a good
 * confidence on the plain `searchTrack`). Returns
 * `{ kind: "disambiguation" }` with up to `MAX_CANDIDATES` candidates
 * when confidence is below `AUTO_SELECT_THRESHOLD`. The client then
 * calls `resolveSelectedCandidate` with the picked candidate's ID.
 *
 * Adapters that implement `searchTrackWithCandidates` (e.g. Spotify)
 * get the richer path; others fall back to single-result
 * `searchTrack`, which can only trigger the auto-resolve branch.
 *
 * @param query - free-text search query
 * @param structured - optional pre-parsed query; when supplied, adapters receive this
 *   instead of `{ title: query, artist: query }`. Pass `undefined` for free-text callers.
 * @param candidateLimit - optional cap on the disambiguation list, clamped to
 *   `[1, MAX_CANDIDATES]`. Defaults to `MAX_CANDIDATES` when omitted.
 * @returns either a resolved track or a candidate list
 * @throws `ResolveError("TRACK_NOT_FOUND")` if no adapter returns anything usable
 */
export async function resolveTextSearchWithDisambiguation(
  query: string,
  structured?: SearchQuery,
  candidateLimit?: number,
): Promise<TextSearchResult> {
  log.debug("Resolver", "resolveTextSearchWithDisambiguation called with:", query);

  // Service search: try adapters that support searchTrackWithCandidates, then fall back
  const searchAdapters = await getActiveAdapters();
  let failedSearches = 0;

  for (const adapter of searchAdapters) {
    try {
      // Use searchTrackWithCandidates if available (e.g. Spotify)
      if (adapter.searchTrackWithCandidates) {
        const searchResult = await adapter.searchTrackWithCandidates(structured ?? { title: query, artist: query });

        if (searchResult.candidates.length === 0) continue;

        const topCandidate = searchResult.candidates[0];

        // Auto-select when confidence is high enough
        if (topCandidate.confidence >= AUTO_SELECT_THRESHOLD) {
          // Cache lookup by ISRC before full resolve
          if (topCandidate.track.isrc) {
            const cached = await tryCache({ isrc: topCandidate.track.isrc });
            if (cached)
              return {
                kind: "resolved",
                result: await fillMissingServices(cached, [
                  resolvedTrackLink(adapter, topCandidate.track, topCandidate.confidence, "search"),
                ]),
              };
          }

          const { links, lateLinks } = await resolveAcrossServices(topCandidate.track, adapter);
          links.unshift(
            sourceLink(adapter, topCandidate.track, { confidence: topCandidate.confidence, matchMethod: "search" }),
          );

          return {
            kind: "resolved",
            result: await completeFreshResolution(topCandidate.track, links, lateLinks),
          };
        }

        // Return candidates for disambiguation
        const cap =
          candidateLimit !== undefined ? Math.min(MAX_CANDIDATES, Math.max(1, candidateLimit)) : MAX_CANDIDATES;
        const candidates: SearchCandidate[] = selectDiverseSearchCandidates(searchResult.candidates, cap).map((c) => ({
          id: `${c.track.sourceService}:${c.track.sourceId}`,
          title: c.track.title,
          artists: c.track.artists,
          albumName: c.track.albumName,
          artworkUrl: c.track.artworkUrl,
          durationMs: c.track.durationMs,
          confidence: c.confidence,
        }));

        return { kind: "disambiguation", candidates };
      }

      // Fallback: use regular searchTrack
      const result = await adapter.searchTrack(structured ?? { title: query, artist: query });

      if (result.found && result.track) {
        // Cache lookup by ISRC before full resolve
        if (result.track.isrc) {
          const cached = await tryCache({ isrc: result.track.isrc });
          if (cached)
            return {
              kind: "resolved",
              result: await fillMissingServices(cached, [
                resolvedTrackLink(adapter, result.track, result.confidence, "search"),
              ]),
            };
        }

        const { links, lateLinks } = await resolveAcrossServices(result.track, adapter);
        links.unshift(sourceLink(adapter, result.track, { confidence: result.confidence, matchMethod: "search" }));

        return {
          kind: "resolved",
          result: await completeFreshResolution(result.track, links, lateLinks),
        };
      }
    } catch (error) {
      failedSearches++;
      log.debug(
        "Resolver",
        `[${adapter.id}] disambiguation search failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw searchExhaustedError(searchAdapters.length, failedSearches, "No track found for the search query");
}

/**
 * Second leg of the disambiguation flow. The client passes back the ID
 * of the candidate it picked (format: `<service>:<trackId>`), and the
 * resolver completes the full cross-service resolve against that track.
 *
 * @param candidateId - stable ID from a disambiguation candidate
 *                      (`sourceService:sourceId` as minted in
 *                      `resolveTextSearchWithDisambiguation`)
 * @returns resolved track result
 * @throws `ResolveError("INVALID_URL")` if the candidate ID is malformed
 * @throws `ResolveError("SERVICE_DOWN")` if the referenced service adapter is unavailable
 */
export async function resolveSelectedCandidate(candidateId: string): Promise<ResolutionResult> {
  // candidateId format: "spotify:trackId"
  const [service, trackId] = candidateId.split(":", 2);
  if (!service || !trackId) {
    throw new ResolveError("INVALID_URL", "Invalid candidate ID format");
  }

  const active = await getActiveAdapters();
  const adapter = active.find((a) => a.id === service);
  if (!adapter) {
    throw new ResolveError("SERVICE_DOWN", `${service} is not available`);
  }

  const sourceTrack = await adapter.getTrack(trackId);

  // Video sources have no ISRC. Their canonical URL still identifies the
  // stored recording, which must keep its share id and receive the same gap fill.
  const cached = await tryCache({
    url: sourceTrack.webUrl,
    serviceLink: serviceLinkLookup(adapter, trackId),
    isrc: sourceTrack.isrc,
  });
  if (cached)
    return fillMissingServices(cached, [
      resolvedTrackLink(adapter, sourceTrack, IDENTIFIER_MATCH_CONFIDENCE, "search"),
    ]);

  const { links, lateLinks } = await resolveAcrossServices(sourceTrack, adapter);

  links.unshift(sourceLink(adapter, sourceTrack, { confidence: IDENTIFIER_MATCH_CONFIDENCE, matchMethod: "search" }));

  return completeFreshResolution(sourceTrack, links, lateLinks);
}
