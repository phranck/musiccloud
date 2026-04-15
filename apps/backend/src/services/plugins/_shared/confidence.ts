/**
 * @file Confidence scoring helper for adapter `searchTrack` implementations.
 *
 * Eighteen of the twenty adapters need the exact same two-branch scorer:
 *
 * 1. **Free-text query** (`query.title === query.artist`): the resolver
 *    signals that the user supplied a single free-text string rather
 *    than a structured title+artist pair. In that case we cannot call
 *    `calculateConfidence` meaningfully (there is no separate artist
 *    to compare against), so we trust the API's own relevance ranking
 *    and decay the confidence by candidate position: position 0 gets
 *    0.85, each subsequent position loses 0.05, and the floor is 0.4.
 *
 * 2. **Structured query**: run `calculateConfidence` against the
 *    normalised query/track pair. This is the usual cross-service
 *    resolve path where the resolver already has a real source track
 *    and is probing each adapter for a match.
 *
 * Keeping this in one place means both branches are tuned uniformly:
 * the free-text constants (`0.85`, `0.05`, `0.4`) are empirical and
 * were picked to keep free-text searches above `MATCH_MIN_CONFIDENCE`
 * for the first ~9 positions. Changing any of them would shift the
 * behaviour of every scraper adapter at once, which is the intended
 * coupling.
 */
import { calculateConfidence } from "../../../lib/resolve/normalize";
import type { NormalizedTrack, SearchQuery } from "../../types.js";

/**
 * Scores one search result candidate against the incoming query.
 *
 * @param query - the search query as passed to `searchTrack`
 * @param track - the normalised candidate produced by the adapter
 * @param index - zero-based position of `track` in the adapter's result list
 * @returns a confidence score in `[0, 1]`
 */
export function scoreSearchCandidate(query: SearchQuery, track: NormalizedTrack, index: number): number {
  if (query.title === query.artist) {
    // Free-text path: see the file header for the decay formula rationale.
    return Math.max(0.4, 0.85 - index * 0.05);
  }
  return calculateConfidence(
    { title: query.title, artists: [query.artist], durationMs: undefined },
    { title: track.title, artists: track.artists, durationMs: track.durationMs },
  );
}
