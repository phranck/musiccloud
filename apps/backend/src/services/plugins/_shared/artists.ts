/**
 * @file Artist-name splitting for adapters that receive combined strings.
 *
 * Several services return the artist credit as one string like
 * `"Artist A, Artist B & Artist C"` rather than a proper array.
 * This helper normalises those into the `string[]` shape that
 * `NormalizedTrack.artists` / `NormalizedAlbum.artists` expect, while
 * collapsing the two common separators (comma, ampersand) consistently.
 *
 * Adapters that already receive structured artist lists from their API
 * should NOT use this helper; they can build the array directly and
 * skip the parsing step.
 */

/**
 * Splits a combined artist-name string into individual entries, falling
 * back to a single-element array with the given fallback when the input
 * is empty or yields no non-empty parts.
 *
 * @param raw      - combined artist credit, typically from an API response
 * @param fallback - name to use when `raw` is empty or unparseable (default `"Unknown Artist"`)
 * @returns non-empty array of trimmed artist names
 */
export function splitArtistNames(raw: string | undefined | null, fallback = "Unknown Artist"): string[] {
  if (!raw) return [fallback];
  const parts = raw
    .split(/[,&]/)
    .map((a) => a.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [fallback];
}
