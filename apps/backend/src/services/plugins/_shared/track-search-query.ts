/**
 * @file Bounded query alternatives and identity guards for catalogue fallbacks.
 *
 * Video titles often append featured-artist credits and social handles. Those
 * remain display metadata; only an alternative search term drops that suffix.
 * A broad query never turns its provider ranking into recording confidence.
 */
import { calculateArtistNameConfidence, stringSimilarity } from "../../../lib/resolve/normalize.js";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type { NormalizedTrack, SearchQuery } from "../../types.js";
import { isFreeTextSearch, scoreSearchCandidate } from "./confidence.js";

/** Exact artist names and their leading-"The" equivalents qualify for a broad fallback. */
const MIN_FALLBACK_ARTIST_CONFIDENCE = 0.9;
/** The existing scorer's widest duration tier, applied as a hard fallback bound. */
const MAX_FALLBACK_DURATION_DIFFERENCE_MS = 10_000;
/** Performance versions must not disappear when a broad query is used. */
const VERSION_QUALIFIER =
  /(?:\(|\[|\s-\s)\s*(live|remix|acoustic|instrumental|karaoke|cover|slowed|sped\s+up|radio\s+edit)\b/i;

/**
 * Returns the original title and at most one credit-free search alternative.
 *
 * @param title - Display title, which is never modified in place.
 * @returns One or two nonempty, distinct title strings in preference order.
 */
export function trackSearchTitles(title: string): string[] {
  const original = title.trim();
  const clean = original.replace(/\s+(?:[([]\s*)?(?:feat(?:uring)?\.?|ft\.?)\s+.+$/i, "").trim();
  return [...new Set([original, clean].filter(Boolean))];
}

/**
 * Builds bounded plain-text alternatives without changing free-text semantics.
 *
 * @param query - Structured recording metadata or the resolver's free-text mark.
 * @returns At most two artist/title queries, or the original free text alone.
 */
export function trackSearchTexts(query: SearchQuery): string[] {
  if (isFreeTextSearch(query)) return [query.title];
  return trackSearchTitles(query.title).map((title) => `${query.artist} ${title}`.trim());
}

/**
 * Rejects unrelated recordings returned by a broad catalogue query.
 *
 * @param query - Original structured metadata, not the broadened query string.
 * @param candidate - Catalogue recording being considered.
 * @returns Whether title, primary artist, duration and version remain compatible.
 */
export function isTrackSearchFallbackMatch(query: SearchQuery, candidate: NormalizedTrack): boolean {
  // Known recording metadata includes artists. Its title can legitimately be
  // the artist's name without opting into the unstructured ranking shortcut.
  if (isFreeTextSearch(query) && !query.artists?.length) return true;
  const sameArtist = candidate.artists.some(
    (artist) => calculateArtistNameConfidence(query.artist, artist) >= MIN_FALLBACK_ARTIST_CONFIDENCE,
  );
  const sameTitle = trackSearchTitles(query.title).some((wanted) =>
    trackSearchTitles(candidate.title).some((actual) => stringSimilarity(wanted, actual) >= MATCH_MIN_CONFIDENCE),
  );
  const wantedVersion = VERSION_QUALIFIER.exec(query.title)?.[1]?.toLowerCase();
  const actualVersion = VERSION_QUALIFIER.exec(candidate.title)?.[1]?.toLowerCase();
  const sameDuration =
    !query.durationMs ||
    !candidate.durationMs ||
    Math.abs(query.durationMs - candidate.durationMs) <= MAX_FALLBACK_DURATION_DIFFERENCE_MS;
  return sameArtist && sameTitle && wantedVersion === actualVersion && sameDuration;
}

/**
 * Scores the same bounded title interpretations used to search the catalogue.
 *
 * A credit-free query must not be accepted and then penalized for the display
 * title's social handles. Artist, duration and version guards still use the
 * original metadata, and an unstructured user search retains ranking semantics.
 *
 * @param query - Original metadata; this function does not mutate it.
 * @param candidate - Catalogue recording, retaining its original display title.
 * @param index - Provider rank for an unstructured user search.
 * @returns Guarded confidence under the existing scoring weights, or zero.
 */
export function scoreCatalogueTrackCandidate(query: SearchQuery, candidate: NormalizedTrack, index: number): number {
  if (!isTrackSearchFallbackMatch(query, candidate)) return 0;
  if (isFreeTextSearch(query)) return scoreSearchCandidate(query, candidate, index);
  return Math.max(
    ...trackSearchTitles(query.title).flatMap((wanted) =>
      trackSearchTitles(candidate.title).map((actual) =>
        scoreSearchCandidate({ ...query, title: wanted }, { ...candidate, title: actual }, index),
      ),
    ),
  );
}
