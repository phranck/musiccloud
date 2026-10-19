/**
 * @file Bounded provider lookup text built from the shared matching policy.
 *
 * Title interpretations, identity safeguards and confidence have one owner in
 * `confidence.ts`. The re-exports preserve the query-helper surface consumed by
 * adapters and enrichment without a second scoring implementation.
 */
import type { SearchQuery } from "../../types.js";
import { isFreeTextSearch, trackSearchTitles } from "./confidence.js";

export {
  isTrackSearchFallbackMatch,
  scoreSearchCandidate as scoreCatalogueTrackCandidate,
  trackSearchTitles,
} from "./confidence.js";

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
