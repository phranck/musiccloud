/**
 * @file Completeness of negative evidence from bounded candidate-page searches.
 *
 * A validated positive recording can survive an unrelated candidate failure.
 * Without that match, any rejected candidate leaves the search incomplete, even
 * when another page answered 404 or described a different recording. Returning
 * a clean miss there would suppress the provider through the resolver's miss cache.
 */

import type { ServiceId } from "@musiccloud/shared";
import { log } from "../../../lib/infra/logger.js";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
} from "../../types.js";
import { scoreAlbumCandidate, scoreSearchCandidate } from "./confidence.js";
import {
  logCandidateScore,
  type PositionedTrack,
  pickBestCandidate,
  pickBestTrack,
  searchMatchResult,
  trackScoreLogger,
} from "./rank.js";

/**
 * Keeps the track and the position of each candidate page that loaded and
 * described a track.
 *
 * @param results - The settled page requests in search order.
 * @returns One entry per fulfilled, non-null page, with the page's position in
 *   `results`, so a failed or empty page does not shift the positions after it.
 */
function settledTracks(results: readonly PromiseSettledResult<NormalizedTrack | null>[]): PositionedTrack[] {
  return results.flatMap((result, index) =>
    result.status === "fulfilled" && result.value ? [{ track: result.value, index }] : [],
  );
}

/**
 * Ranks the track pages a search fetched one by one and decides the search.
 *
 * Each loaded track scores with the position of its page, writes its score
 * debug line, and the best one counts as found from `MATCH_MIN_CONFIDENCE` on.
 *
 * @param query - The track searched for.
 * @param results - The settled track page requests in search order. A
 *   fulfilled `null` is a page that described no track.
 * @param service - The service the pages came from, named when a failed page
 *   leaves the search incomplete.
 * @param component - The log component of the score and miss lines, usually
 *   the adapter's display name.
 * @returns The search result.
 * @throws The first page failure when no track qualified, because the miss
 *   would not be complete.
 */
export function bestSettledTrack(
  query: SearchQuery,
  results: readonly PromiseSettledResult<NormalizedTrack | null>[],
  service: ServiceId,
  component: string,
): MatchResult {
  const { best, confidence } = pickBestTrack(
    settledTracks(results),
    (track, index) => scoreSearchCandidate(query, track, index),
    trackScoreLogger(component),
  );
  const match = searchMatchResult("track", best, confidence);
  throwIfSearchIncomplete(results, match.found, service);
  if (!match.found) {
    log.debug(component, `Best confidence ${confidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
  }
  return match;
}

/**
 * Ranks the album pages a search fetched one by one and decides the search.
 *
 * @param query - The album searched for.
 * @param results - The settled album page requests in search order. A
 *   fulfilled `null` is a page that described no album.
 * @param service - The service the pages came from, named when a failed page
 *   leaves the search incomplete.
 * @param component - The log component that writes one `"Title" -> confidence`
 *   line per album. Without it, no score line is written.
 * @returns The best album once it scores at least `MATCH_MIN_CONFIDENCE`,
 *   otherwise a miss with the best score reached.
 * @throws The first page failure when no album qualified, because the miss
 *   would not be complete.
 */
export function bestSettledAlbum(
  query: AlbumSearchQuery,
  results: readonly PromiseSettledResult<NormalizedAlbum | null>[],
  service: ServiceId,
  component?: string,
): AlbumMatchResult {
  const albums = results.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []));
  const { best, confidence } = pickBestCandidate(
    albums,
    (album) => scoreAlbumCandidate(query, album),
    component === undefined
      ? undefined
      : (album, _index, albumConfidence) => logCandidateScore(component, `"${album.title}"`, albumConfidence),
  );
  const match = searchMatchResult("album", best, confidence);
  throwIfSearchIncomplete(results, match.found, service);
  return match;
}

/**
 * Rejects incomplete negative evidence after the adapter has scored its candidates.
 * @param results - Settled candidate requests; an empty array is a valid completed search.
 * @param matched - Whether the adapter accepted a qualifying recording or album.
 * @param service - Provider attached to a recoverable partial-result deviation.
 * @throws The first candidate failure when no positive match resolves the uncertainty.
 */
export function throwIfSearchIncomplete(
  results: readonly PromiseSettledResult<unknown>[],
  matched: boolean,
  service: ServiceId,
): void {
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (!failure) return;
  if (!matched) throw failure.reason;
  log.deviation(
    {
      component: "Adapter",
      adapterId: service,
      errorCode: "MC-API-0004",
      operation: "catalog_candidate_fetch",
      outcome: "positive_partial_candidates",
    },
    failure.reason,
  );
}
