/**
 * @file The one ranking loop every adapter search uses.
 *
 * An adapter search scores each hit a service returns and keeps the hit with
 * the highest confidence. Whether that hit counts as found is decided against
 * one threshold, `MATCH_MIN_CONFIDENCE` unless the caller names another. Both
 * steps live here, so every adapter breaks a tie and reports a miss the same
 * way.
 */

import { log } from "../../../lib/infra/logger.js";
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
 * @param onScored - Called once per hit right after it is scored, in the order
 *   of `items`, with the hit, its position and its score. Adapters pass a
 *   logger from `trackScoreLogger` here. Defaults to no callback.
 * @returns The best hit and its score, or `{ best: null, confidence: 0 }` when
 *   `items` is empty.
 */
export function pickBestCandidate<T>(
  items: Iterable<T>,
  score: (item: T, index: number) => number,
  onScored?: (item: T, index: number, confidence: number) => void,
): BestCandidate<T> {
  let best: T | null = null;
  let confidence = 0;
  let index = 0;
  for (const item of items) {
    const itemConfidence = score(item, index);
    onScored?.(item, index, itemConfidence);
    if (best === null || itemConfidence > confidence) {
      best = item;
      confidence = itemConfidence;
    }
    index++;
  }
  return { best, confidence };
}

/**
 * The arrow between a hit and its score in a score debug line. `"->"` is the
 * default every adapter uses; Napster and Pandora print `"→"`.
 */
export type ScoreArrow = "->" | "→";

/** The arrow `logCandidateScore` and `trackScoreLogger` print unless told otherwise. */
const DEFAULT_SCORE_ARROW: ScoreArrow = "->";

/** Decimal places a score debug line prints the confidence with: `3`. */
const SCORE_LOG_DECIMALS = 3;

/**
 * Writes the debug line for one scored search hit:
 * `  <label> -> confidence=0.875`.
 *
 * @param component - The log component, usually the adapter's display name.
 * @param label - Names the hit, such as `"Title"` or `Artist "Name"`.
 * @param confidence - The hit's score, printed with `SCORE_LOG_DECIMALS` places.
 * @param arrow - The arrow between label and score. Defaults to
 *   `DEFAULT_SCORE_ARROW`.
 */
export function logCandidateScore(
  component: string,
  label: string,
  confidence: number,
  arrow: ScoreArrow = DEFAULT_SCORE_ARROW,
): void {
  log.debug(component, `  ${label} ${arrow} confidence=${confidence.toFixed(SCORE_LOG_DECIMALS)}`);
}

/**
 * Builds the `onScored` callback that writes one debug line per scored track:
 * `  [2] "Title" by Artist A, Artist B -> confidence=0.875`.
 *
 * @param component - The log component, usually the adapter's display name.
 * @param arrow - The arrow between track and score. Defaults to
 *   `DEFAULT_SCORE_ARROW`.
 * @returns A callback taking the track, the position the line prints and the
 *   track's score.
 */
export function trackScoreLogger(
  component: string,
  arrow: ScoreArrow = DEFAULT_SCORE_ARROW,
): (track: NormalizedTrack, index: number, confidence: number) => void {
  return (track, index, confidence) =>
    logCandidateScore(component, `[${index}] "${track.title}" by ${track.artists.join(", ")}`, confidence, arrow);
}

/**
 * A track hit together with the position it scores and logs with.
 *
 * @property track - The normalized track.
 * @property index - Its position in the service's answer, counted from `0`.
 *   An adapter that skips unusable hits keeps the original position, so the
 *   positional part of the score and the debug line stay as the service ranked.
 */
export interface PositionedTrack {
  track: NormalizedTrack;
  index: number;
}

/**
 * Maps the usable hits of a track search and keeps each one's original
 * position.
 *
 * @param items - The raw hits in the order the service returned them.
 * @param isUsable - Whether a raw hit carries what a track needs, such as an
 *   id and a title. An unusable hit is dropped without shifting the positions
 *   of the hits after it.
 * @param toTrack - Maps one usable raw hit to its normalized track.
 * @returns The usable hits as `PositionedTrack` entries, in service order.
 */
export function usableTracks<T>(
  items: readonly T[],
  isUsable: (item: T) => boolean,
  toTrack: (item: T) => NormalizedTrack,
): PositionedTrack[] {
  return items.flatMap((item, index) => (isUsable(item) ? [{ track: toTrack(item), index }] : []));
}

/**
 * Keeps the best of a list of positioned track hits and writes one debug line
 * per hit.
 *
 * @param hits - The usable track hits in the order the service returned them.
 * @param score - Scores one track; receives the track and its `index`.
 * @param logScore - A logger from `trackScoreLogger`, called with each track,
 *   its `index` and its score.
 * @returns The best track and its score, the earliest one on a tie, or
 *   `{ best: null, confidence: 0 }` when `hits` is empty.
 */
export function pickBestTrack(
  hits: readonly PositionedTrack[],
  score: (track: NormalizedTrack, index: number) => number,
  logScore: (track: NormalizedTrack, index: number, confidence: number) => void,
): BestCandidate<NormalizedTrack> {
  const { best, confidence } = pickBestCandidate(
    hits,
    (hit) => score(hit.track, hit.index),
    (hit, _position, hitConfidence) => logScore(hit.track, hit.index, hitConfidence),
  );
  return { best: best?.track ?? null, confidence };
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
