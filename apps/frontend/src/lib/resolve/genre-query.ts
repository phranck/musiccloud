/**
 * The resolve-query string that opens the genre overview / browse grid.
 *
 * Submitting this exact query puts the app into the genre-browse screen (the
 * tile grid). Kept as a named constant so the `genre:` grammar lives in one
 * place instead of being re-typed at each call site.
 */
export const GENRE_BROWSE_QUERY = "genre:?";

/**
 * Builds the resolve query that searches for tracks of a single genre.
 *
 * Encodes the `genre:` query grammar the resolve backend understands: the
 * genre name follows the `genre:` prefix and a space. Used when a genre tile is
 * clicked to submit a genre search for that tile's name.
 *
 * @param name - The genre name (e.g. `electronic`).
 * @returns The resolve query string (e.g. `genre: electronic`).
 */
export function buildGenreQuery(name: string): string {
  return `genre: ${name}`;
}

/**
 * The homepage query-string parameter that carries a genre name to auto-search.
 *
 * Genre links rendered outside the landing page's own search flow (e.g. on a
 * persistent share page, which has no in-page search) point at the homepage with
 * this parameter set; the homepage reads it on mount and runs the genre search.
 */
export const GENRE_SEARCH_PARAM = "genre";

/**
 * Builds a homepage link that auto-runs a genre search for the given genre.
 *
 * Used by genre links that live where no in-page search flow exists (the CC
 * details card on a persistent share page). With Astro's ClientRouter this
 * resolves as a soft navigation, so the homepage mounts and submits the genre
 * search ({@link buildGenreQuery}) without a full reload, then renders the genre
 * results in place.
 *
 * @param name - The genre name (e.g. `electronic`).
 * @returns The root-relative homepage URL (e.g. `/?genre=electronic`).
 */
export function genreSearchHref(name: string): string {
  return `/?${GENRE_SEARCH_PARAM}=${encodeURIComponent(name)}`;
}
