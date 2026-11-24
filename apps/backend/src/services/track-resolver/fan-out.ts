/**
 * @file Looks a track up on every other service: the deadline-bounded fan-out,
 * the per-service timeout and the matching strategy of one service.
 *
 * `fan-out-deadline.ts` owns `RESOLVE_RESPONSE_DEADLINE_MS`. Early results form
 * the response while each pending lookup remains bounded by
 * {@link ADAPTER_TIMEOUT_MS}. A deadline is not cancellation, and late
 * successful destinations remain useful.
 */
import { getPlatformLabel, type MatchMethod } from "@musiccloud/shared";
import { log } from "../../lib/infra/logger.js";
import { UpstreamUnavailableError } from "../../lib/infra/upstream-unavailable.js";
import { pickRecordingArtworkUrl } from "../artwork.js";
import { confidenceForMethod } from "../confidence.js";
import { IDENTIFIER_MATCH_CONFIDENCE, LINK_QUALITY_THRESHOLD, SEARCH_FALLBACK_CONFIDENCE } from "../constants.js";
import { RESOLVE_RESPONSE_DEADLINE_MS, settleWithinDeadline } from "../fan-out-deadline.js";
import { getActiveAdapters } from "../index.js";
import { isTrackSearchFallbackMatch, recordingSearchQuery } from "../plugins/_shared/track-search-query.js";
import { collectSettledLinks } from "../resolved-links.js";
import type { MatchResult, NormalizedTrack, ServiceAdapter } from "../types.js";
import { normalizeTrackLinks } from "./completion.js";
import type { ResolvedLink } from "./types.js";

/**
 * Looks the source track up on every other active service, answering with what
 * arrived by {@link RESOLVE_RESPONSE_DEADLINE_MS} and handing the rest on as
 * late links.
 *
 * @param sourceTrack - The track the resolve started from.
 * @param excludeAdapter - The source service, which is not asked again.
 * @returns See {@link CrossServiceLinks}.
 */
export async function resolveAcrossServices(
  sourceTrack: NormalizedTrack,
  excludeAdapter: ServiceAdapter,
): Promise<CrossServiceLinks> {
  const active = await getActiveAdapters();
  const targetAdapters = active.filter((a) => a.id !== excludeAdapter.id);

  const fanOut = await settleWithinDeadline(
    targetAdapters.map((adapter) => resolveOnServiceWithTimeout(adapter, sourceTrack)),
    RESOLVE_RESPONSE_DEADLINE_MS,
  );

  // Rejections stay unlogged by the collector, because
  // `resolveOnServiceWithTimeout` already logs every failure.
  const links = collectSettledLinks(targetAdapters, fanOut.early, { component: "Resolver" });
  normalizeTrackLinks(links);

  // For services with no match, add YouTube search fallback
  const coveredServices = new Set([excludeAdapter.id, ...links.map((l) => l.service)]);

  if (!coveredServices.has("youtube") && sourceTrack.title && sourceTrack.artists.length > 0) {
    const searchQuery = encodeURIComponent(`${sourceTrack.artists[0]} ${sourceTrack.title}`);
    links.push({
      service: "youtube",
      displayName: getPlatformLabel("youtube"),
      url: `https://music.youtube.com/search?q=${searchQuery}`,
      confidence: SEARCH_FALLBACK_CONFIDENCE,
      matchMethod: "search-fallback",
    });
  }

  // Sort by confidence (highest first)
  links.sort((a, b) => b.confidence - a.confidence);

  // Filter out low-confidence matches (but keep search fallbacks)
  const responseLinks = links.filter(
    (l) => l.confidence >= LINK_QUALITY_THRESHOLD || l.matchMethod === "search-fallback",
  );

  const lateAdapterIndices = indicesStillRunning(fanOut.early);
  if (lateAdapterIndices.length === 0) return { links: responseLinks };

  log.debug(
    "Resolver",
    `Answering without ${lateAdapterIndices.map((index) => targetAdapters[index].id).join(", ")}; their links are stored when they arrive`,
  );
  const lateLinks = fanOut.all.then((results) => {
    const late = collectSettledLinks(
      lateAdapterIndices.map((index) => targetAdapters[index]),
      lateAdapterIndices.map((index) => results[index]),
      { component: "Resolver" },
    );
    normalizeTrackLinks(late);
    return late.filter((l) => l.confidence >= LINK_QUALITY_THRESHOLD);
  });

  return { links: responseLinks, lateLinks };
}

/**
 * Links found for a source track on the other services.
 *
 * @property links - What arrived before {@link RESOLVE_RESPONSE_DEADLINE_MS},
 *   ready for the response: with the derived YouTube Music link and the YouTube
 *   search fallback, sorted by confidence and filtered by link quality.
 * @property lateLinks - Present when services were still running at the
 *   deadline. Settles, never rejects, with the qualifying links they produced,
 *   for `persistLateTrackLinks` in `persist-links.ts` to store on the track.
 */
export interface CrossServiceLinks {
  links: ResolvedLink[];
  lateLinks?: Promise<ResolvedLink[]>;
}

/**
 * @param early - The settled-by-deadline results of a fan-out.
 * @returns The positions of the services that had not settled by the deadline.
 */
export function indicesStillRunning(early: ReadonlyArray<PromiseSettledResult<unknown> | undefined>): number[] {
  return early.flatMap((result, index) => (result === undefined ? [index] : []));
}

/**
 * Upper bound for one service's lookup. The response no longer waits for it,
 * see {@link RESOLVE_RESPONSE_DEADLINE_MS}, but the background work that stores
 * late links does, and a service that never answers must not hold that open.
 */
const ADAPTER_TIMEOUT_MS = 10_000;

/**
 * {@link resolveOnService} raced against {@link ADAPTER_TIMEOUT_MS}. The timer
 * is cleared once the lookup settles, so a fast answer leaves nothing pending.
 */
export function resolveOnServiceWithTimeout(
  adapter: ServiceAdapter,
  sourceTrack: NormalizedTrack,
  knownLink?: ResolvedLink,
): Promise<ResolvedLink | null> {
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => reject(new Error(`Timeout after ${ADAPTER_TIMEOUT_MS}ms`)), ADAPTER_TIMEOUT_MS);
  });
  return Promise.race([resolveOnService(adapter, sourceTrack, knownLink), timeout])
    .catch((error) => {
      log.deviation(
        {
          component: "Resolver",
          adapterId: adapter.id,
          errorCode: "MC-API-0004",
          operation: "resolve_recording_destination",
          outcome: "destination_not_added",
        },
        error,
      );
      throw error;
    })
    .finally(() => clearTimeout(timeoutTimer));
}

/**
 * Refreshes a known destination by its id, otherwise tries ISRC before text.
 *
 * @param adapter - Enabled, configured provider owning the destination.
 * @param sourceTrack - Original recording identity; display metadata stays intact.
 * @param knownLink - Existing destination being refreshed for preview or artwork.
 * @returns A validated match with enrichment metadata, or null for a clean miss.
 * @throws Provider failures, which must not become negative catalogue cache entries.
 */
async function resolveOnService(
  adapter: ServiceAdapter,
  sourceTrack: NormalizedTrack,
  knownLink?: ResolvedLink,
): Promise<ResolvedLink | null> {
  if (knownLink) {
    const sourceId = adapter.detectUrl(knownLink.url);
    if (sourceId) {
      const track = await adapter.getTrack(sourceId);
      if (!isTrackSearchFallbackMatch(recordingSearchQuery(sourceTrack), track)) {
        log.deviation(
          {
            component: "Resolver",
            adapterId: adapter.id,
            errorCode: "MC-API-0004",
            operation: "cached_recording_identity",
            outcome: "cover_not_borrowed",
          },
          new Error("Cached catalogue metadata does not match the recording"),
        );
        return null;
      }
      return resolvedTrackLink(adapter, track, knownLink.confidence, knownLink.matchMethod);
    }
  }
  // Strategy 1: ISRC lookup (most reliable)
  if (adapter.capabilities.supportsIsrc && sourceTrack.isrc) {
    if (adapter.id === "youtube") {
      // YouTube doesn't support ISRC anyway, but just in case
      return resolveViaSearch(adapter, sourceTrack);
    }

    const track = await adapter.findByIsrc(sourceTrack.isrc);
    if (track) {
      return resolvedTrackLink(adapter, track, IDENTIFIER_MATCH_CONFIDENCE, "isrc");
    }
  }

  // Strategy 2: Text search (fallback)
  return resolveViaSearch(adapter, sourceTrack);
}

/**
 * Accepts structured text matches only when they retain the confirmed recording identity.
 * @param adapter - Provider being queried through its existing search operation.
 * @param sourceTrack - Original recording, never rewritten by lookup normalization.
 * @returns A compatible link or null for a completed clean miss.
 * @throws Provider failures and incompatible claimed positives, neither of which is a catalog miss.
 */
async function resolveViaSearch(adapter: ServiceAdapter, sourceTrack: NormalizedTrack): Promise<ResolvedLink | null> {
  const query = recordingSearchQuery(sourceTrack);
  const result: MatchResult = await adapter.searchTrack(query);

  if (!result.found) return null;
  if (!result.track || !isTrackSearchFallbackMatch(query, result.track)) {
    throw new UpstreamUnavailableError(adapter.id, "track search returned incompatible recording metadata");
  }

  return resolvedTrackLink(
    adapter,
    result.track,
    confidenceForMethod(result.matchMethod, result.confidence),
    result.matchMethod,
  );
}

/**
 * Retains enrichment metadata consistently across identifier, text and refresh matches.
 *
 * @param adapter - Provider that returned the recording.
 * @param track - Validated recording metadata, not a search-result page.
 * @param confidence - Score already assigned by the matching strategy.
 * @param matchMethod - Evidence behind that score; refreshes preserve it.
 * @returns The destination plus metadata consumed by persistence and cover policy.
 */
export function resolvedTrackLink(
  adapter: ServiceAdapter,
  track: NormalizedTrack,
  confidence: number,
  matchMethod: MatchMethod,
): ResolvedLink {
  return {
    service: adapter.id,
    displayName: adapter.displayName,
    url: track.webUrl,
    confidence,
    matchMethod,
    externalId: track.sourceId,
    previewUrl: track.previewUrl,
    artworkUrl: pickRecordingArtworkUrl(undefined, [{ service: adapter.id, artworkUrl: track.artworkUrl }]),
    isrc: track.isrc,
    mbid: track.mbid,
    iswc: track.iswc,
  };
}
