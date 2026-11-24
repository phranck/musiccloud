/**
 * @file The one ranking loop every adapter search uses.
 *
 * An adapter search scores each hit a service returns and keeps the hit with
 * the highest confidence. Whether that hit counts as found is decided against
 * one threshold, `MATCH_MIN_CONFIDENCE` unless the caller names another. Both
 * steps live here, so every adapter breaks a tie and reports a miss the same
 * way.
 */

import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize.js";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumMatchResult,
  ArtistMatchResult,
  MatchResult,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedTrack,
} from "../../types.js";

/**
 * The best hit of a ranked search and its score.
 *
 * @property best - The hit with the highest score, the earliest one on a tie,
 *   or `null` when there was no hit at all.
 * @property confidence - The score of `best`, or `0` when there was no hit.
 */
export interface BestCandidate<T> {
  best: T | null;
  confidence: number;
}

/**
 * Keeps the hit with the highest score.
 *
 * A later hit replaces the kept one only when it scores strictly higher, so the
 * earliest hit wins a tie and the order the service ranked its hits in decides
 * between equal scores. The first hit is kept even when it scores `0`; the
 * caller's threshold, not this function, turns a weak best hit into a miss.
 *
 * @param items - The hits in the order the service returned them.
 * @param score - Scores one hit; receives the hit and its position in `items`,
 *   counted from `0`.
 * @returns The best hit and its score, or `{ best: null, confidence: 0 }` when
 *   `items` is empty.
 */
export function pickBestCandidate<T>(items: Iterable<T>, score: (item: T, index: number) => number): BestCandidate<T> {
  let best: T | null = null;
  let confidence = 0;
  let index = 0;
  for (const item of items) {
    const itemConfidence = score(item, index);
    if (best === null || itemConfidence > confidence) {
      best = item;
      confidence = itemConfidence;
    }
    index++;
  }
  return { best, confidence };
}

/**
 * The entity and result shape of each kind of adapter search, keyed by the
 * field the found entity sits in.
 */
interface SearchMatchKinds {
  track: { entity: NormalizedTrack; result: MatchResult };
  album: { entity: NormalizedAlbum; result: AlbumMatchResult };
  artist: { entity: NormalizedArtist; result: ArtistMatchResult };
}

/** The kind of adapter search: `"track"`, `"album"` or `"artist"`. */
export type SearchMatchKind = keyof SearchMatchKinds;

/**
 * Turns the best hit of a search into the result an adapter search returns.
 *
 * @param kind - Which search this is: `"track"`, `"album"` or `"artist"`. It
 *   names the field the found entity is returned in.
 * @param best - The best hit, or `null` or `undefined` when there was none.
 * @param confidence - The score of `best`, reported in both outcomes.
 * @param threshold - The lowest score that counts as found. Defaults to
 *   `MATCH_MIN_CONFIDENCE`; a score exactly at the threshold is found.
 * @returns `{ found: true, [kind]: best, confidence, matchMethod: "search" }`
 *   when `best` exists and scores at least `threshold`, otherwise
 *   `{ found: false, confidence, matchMethod: "search" }`.
 */
export function searchMatchResult<K extends SearchMatchKind>(
  kind: K,
  best: SearchMatchKinds[K]["entity"] | null | undefined,
  confidence: number,
  threshold: number = MATCH_MIN_CONFIDENCE,
): SearchMatchKinds[K]["result"] {
  if (!best || confidence < threshold) {
    return { found: false, confidence, matchMethod: "search" };
  }
  return { found: true, [kind]: best, confidence, matchMethod: "search" } as SearchMatchKinds[K]["result"];
}

/**
 * One search hit together with how well its artist name matches the name
 * searched for.
 *
 * @property item - The hit whose name is closest to the searched one.
 * @property confidence - `calculateArtistNameConfidence` of the two names, from 0 to 0.95.
 */
export interface RankedArtistNameMatch<T> {
  item: T;
  confidence: number;
}

/**
 * Picks the search hit whose artist name is closest to the name searched for.
 *
 * A service ranks artist search hits by its own relevance, which can put a
 * different artist with a similar name first: Spotify answers `Fontaines D.C.`
 * and Deezer `FON` for `Fön`. Every artist search therefore reads several hits
 * and chooses among them by name through this one rule.
 *
 * @param queryName - The artist name that was searched for.
 * @param items - The hits in the order the service returned them.
 * @param nameOf - Reads the artist name of one hit.
 * @returns The hit with the highest `calculateArtistNameConfidence`, the
 *   earliest one on a tie, or `null` when `items` is empty. The caller compares
 *   `confidence` with its own threshold, usually `MATCH_MIN_CONFIDENCE`.
 */
export function rankByArtistName<T>(
  queryName: string,
  items: readonly T[],
  nameOf: (item: T) => string,
): RankedArtistNameMatch<T> | null {
  const { best, confidence } = pickBestCandidate(items, (item) =>
    calculateArtistNameConfidence(queryName, nameOf(item)),
  );
  return best === null ? null : { item: best, confidence };
}
