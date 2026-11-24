/**
 * @file The `genre-search` response envelope both genre searches answer with.
 *
 * The commercial search (`genre-search/index.ts`, Last.fm) and the Creative
 * Commons search (`cc/cc-genre.ts`, Jamendo) parse the same query with
 * `parseGenreQuery` and answer with the same envelope: the status, the echoed
 * query, three result columns and the parser warnings. They differ only in the
 * candidate types and in how each column is filled, which the caller passes in.
 */

import type { ParsedGenreQuery } from "./parser.js";

/** The `status` discriminator of a genre-search response. */
const GENRE_SEARCH_STATUS = "genre-search";

/**
 * A producer for one result column. Called only when the query requested that
 * column, so an unrequested column does no work.
 *
 * @typeParam Candidate - The candidate type of the column.
 * @param count - The number of rows the query requested for the column, a positive integer.
 * @returns The column's candidates, directly or as a promise.
 */
export type GenreSearchColumn<Candidate> = (count: number) => Candidate[] | Promise<Candidate[]>;

/**
 * The producers of the three result columns.
 *
 * @typeParam Track - The track candidate type.
 * @typeParam Album - The album candidate type.
 * @typeParam Artist - The artist candidate type.
 */
export interface GenreSearchColumns<Track, Album, Artist> {
  /** Fills the tracks column. */
  tracks: GenreSearchColumn<Track>;
  /** Fills the albums column. */
  albums: GenreSearchColumn<Album>;
  /** Fills the artists column. */
  artists: GenreSearchColumn<Artist>;
}

/**
 * A `genre-search` response with the candidate types of one search family.
 *
 * @typeParam Track - The track candidate type.
 * @typeParam Album - The album candidate type.
 * @typeParam Artist - The artist candidate type.
 */
export interface GenreSearchEnvelope<Track, Album, Artist> {
  /** Always `genre-search`. */
  status: typeof GENRE_SEARCH_STATUS;
  /** The parsed query as the search interpreted it. A `null` count means the column was not requested. */
  query: {
    genres: string[];
    vibe: ParsedGenreQuery["vibe"];
    tracks: number | null;
    albums: number | null;
    artists: number | null;
  };
  /** One list per column, or `null` for a column the query did not request. */
  results: {
    tracks: Track[] | null;
    albums: Album[] | null;
    artists: Artist[] | null;
  };
  /** The parser's non-fatal notes; an empty array for a clean query. */
  warnings: string[];
}

/**
 * Runs a column producer when the query requested the column.
 *
 * @param count - The requested count, or `null` when the column was not requested.
 * @param column - The producer of the column.
 * @returns The column's candidates, or `null` when the column was not requested.
 */
async function fillColumn<Candidate>(
  count: number | null,
  column: GenreSearchColumn<Candidate>,
): Promise<Candidate[] | null> {
  return count !== null ? await column(count) : null;
}

/**
 * Builds the `genre-search` response from a parsed query and the producers of
 * its three columns. The columns are filled in the order tracks, albums,
 * artists, one after another, and only those the query requested.
 *
 * @param parsed - The query as `parseGenreQuery` returned it.
 * @param columns - The producers of the tracks, albums and artists columns.
 * @returns The response envelope with the echoed query, the columns and the parser warnings.
 */
export async function buildGenreSearchEnvelope<Track, Album, Artist>(
  parsed: ParsedGenreQuery,
  columns: GenreSearchColumns<Track, Album, Artist>,
): Promise<GenreSearchEnvelope<Track, Album, Artist>> {
  const tracks = await fillColumn(parsed.tracks, columns.tracks);
  const albums = await fillColumn(parsed.albums, columns.albums);
  const artists = await fillColumn(parsed.artists, columns.artists);
  return {
    status: GENRE_SEARCH_STATUS,
    query: {
      genres: parsed.genres,
      vibe: parsed.vibe,
      tracks: parsed.tracks,
      albums: parsed.albums,
      artists: parsed.artists,
    },
    results: { tracks, albums, artists },
    warnings: parsed.warnings,
  };
}
