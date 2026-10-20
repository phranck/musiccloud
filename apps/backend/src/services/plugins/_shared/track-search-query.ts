/**
 * @file Bounded provider lookup text built from the shared matching policy.
 *
 * Title interpretations, identity safeguards and confidence have one owner in
 * `confidence.ts`. The re-exports preserve the query-helper surface consumed by
 * adapters and enrichment without a second scoring implementation.
 */
import type { NormalizedTrack, SearchQuery } from "../../types.js";
import { artistNameForSearch } from "./artists.js";
import { isFreeTextSearch, trackSearchTitles } from "./confidence.js";

export {
  isTrackSearchFallbackMatch,
  scoreSearchCandidate as scoreCatalogueTrackCandidate,
  trackSearchTitles,
} from "./confidence.js";

/**
 * Builds lookup metadata without replacing a canonical provider display credit.
 * The resolver builds the query for every destination search with it, and the repair planners judge stored
 * destinations with the same query, so both sides ask the same question.
 *
 * @param sourceTrack - Confirmed source recording and its provider provenance.
 * @returns A fresh query with published artist-name interpretations and original recording evidence.
 */
export function recordingSearchQuery(sourceTrack: NormalizedTrack): SearchQuery {
  const artists = sourceTrack.artists.map((artist) => artistNameForSearch(artist, sourceTrack.sourceService));
  return {
    title: sourceTrack.title,
    artist: artists[0] ?? "",
    artists,
    album: sourceTrack.albumName,
    durationMs: sourceTrack.durationMs,
  };
}

/**
 * Builds bounded plain-text alternatives without changing free-text semantics.
 *
 * @param query - Structured recording metadata or the resolver's free-text marker.
 * @returns At most two artist/title queries, or the original free text alone.
 */
export function trackSearchTexts(query: SearchQuery): string[] {
  if (isFreeTextSearch(query)) return [query.title];
  return trackSearchTitles(query.title).map((title) => `${query.artist} ${title}`.trim());
}
