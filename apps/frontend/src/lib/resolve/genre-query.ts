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
