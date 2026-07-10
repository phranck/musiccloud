/**
 * Pure parsing helpers for Discogs API data.
 *
 * These functions have no side effects, perform no I/O, and carry no
 * state. They are the foundational building blocks used by higher-level
 * normalisation and enrichment code in the same directory.
 */

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
