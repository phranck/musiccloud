/**
 * Pure parsing helpers for Discogs API data.
 *
 * These functions have no side effects, perform no I/O, and carry no
 * state. They are the foundational building blocks used by higher-level
 * normalisation and enrichment code in the same directory.
 */

/**
 * A single entry from the Discogs Master Versions endpoint
 * (`GET /masters/{id}/versions`).
 *
 * Only the fields required for original-pressing selection are included.
 * The Discogs client (Task 5) reuses this interface when mapping the raw
 * API response into a typed list before calling `selectOriginalVinylVersion`.
 *
 * @property id - Discogs release ID of this pressing.
 * @property released - Release year string as returned by the API, e.g. `"1959"`.
 *   May carry extra characters; only the leading four digits are used for
 *   year comparison.
 * @property format - Comma-joined format descriptor returned by the API,
 *   e.g. `"LP, Album, Stereo"` or `"LP, Album, Reissue, Mono"`.
 * @property country - Two-letter country code of the pressing, when present.
 */
export interface DiscogsMasterVersion {
  id: number;
  released: string;
  format: string;
  country?: string;
}

/**
 * Parses a Discogs track-duration string into milliseconds.
 *
 * Discogs encodes durations as `"M:SS"` or `"MM:SS"` (minutes colon
 * zero-padded seconds). The function accepts both forms and returns the
 * total duration in milliseconds so it can be stored and compared with
 * the rest of the musiccloud track model.
 *
 * @param value - The raw duration string from the Discogs `tracklist[].duration` field.
 * @returns Total duration in milliseconds, or `null` when the value is
 *   empty, missing, or does not match the expected `M:SS` / `MM:SS` format.
 */
export function parseDiscogsDuration(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseInt(match[2], 10);
  return (minutes * 60 + seconds) * 1000;
}

/**
 * Derives the physical vinyl side letter from a Discogs track position.
 *
 * Discogs encodes positions as a leading alphabetic prefix followed by an
 * optional numeric suffix, for example `"A"`, `"B2"`, `"C1"`. The side
 * letter is the leading `[A-Za-z]+` prefix. Purely numeric positions (e.g.
 * `"3"`) indicate a CD or non-sided format and yield `null`.
 *
 * The returned label is always upper-cased to ensure consistent grouping
 * regardless of how the source data was capitalised.
 *
 * @param position - The raw position string from the Discogs `tracklist[].position` field.
 * @returns The uppercase side letter (e.g. `"A"`, `"B"`, `"C"`), or `null`
 *   when the position is empty or starts with a digit rather than a letter.
 */
export function sideLabelFromPosition(position: string): string | null {
  const match = /^([A-Za-z]+)/.exec(position);
  if (!match) {
    return null;
  }
  return match[1].toUpperCase();
}

/**
 * Selects the original vinyl pressing from a list of Discogs master versions.
 *
 * "Original" is defined as the non-reissue vinyl version with the earliest
 * release year. When two versions share the same earliest year, the one that
 * appears first in the input array is returned (stable, input-order tie-break).
 *
 * Filtering rules applied in order:
 * 1. Keep only versions whose `format` contains `"Vinyl"` or `"LP"`
 *    (case-insensitive). All other formats (CD, Cassette, …) are discarded.
 * 2. Drop versions whose `format` contains `"Reissue"` (case-insensitive).
 * 3. Among the remaining candidates, pick the one with the smallest year
 *    derived from the leading four digits of the `released` field.
 *
 * @param versions - Array of version entries from the Discogs Master Versions
 *   endpoint (`GET /masters/{id}/versions`).
 * @returns The best-matching `DiscogsMasterVersion`, or `null` when no version
 *   survives the filters (empty input, only reissues, only non-vinyl formats).
 */
export function selectOriginalVinylVersion(versions: DiscogsMasterVersion[]): DiscogsMasterVersion | null {
  const VINYL_RE = /\b(vinyl|lp)\b/i;
  const REISSUE_RE = /\breissue\b/i;

  const candidates = versions.filter((v) => VINYL_RE.test(v.format) && !REISSUE_RE.test(v.format));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, current) => {
    const bestYear = Number.parseInt(best.released.slice(0, 4), 10);
    const currentYear = Number.parseInt(current.released.slice(0, 4), 10);
    return currentYear < bestYear ? current : best;
  });
}
