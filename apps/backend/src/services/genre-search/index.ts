/**
 * @file Public entry point for the genre-search feature.
 *
 * Ties the parser and the Last.fm genre-search adapter together.
 * Called from `POST /api/v1/resolve` whenever the incoming query
 * starts with `genre:`.
 *
 * ## Data source: Last.fm tags
 *
 * Last.fm's community-curated tag system provides thousands of genres
 * and subgenres (trance, bebop, shoegaze, krautrock, ...) far beyond
 * the ~22 top-level genres offered by Spotify, Apple Music, or Deezer.
 * No fallback chain — Last.fm is the sole genre-search backend.
 *
 * ## Error surface
 *
 * Two typed errors bubble out so the route handler can map them to
 * precise HTTP status codes:
 *
 *   - `GenreQueryParseError` → 400 (bad syntax)
 *   - `NoGenreSearchAdapterError` → 503 (LASTFM_API_KEY missing)
 *
 * Last.fm tags are free-form — any string is accepted. If a tag has
 * no results, the response simply comes back with empty lists rather
 * than an error.
 */
import type {
  GenreAlbumCandidate,
  GenreArtistCandidate,
  GenreBrowseResponse,
  GenreSearchResponse,
  GenreTrackCandidate,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedTrack,
} from "../types.js";
import { getGenreBrowseGrid } from "./browse-grid.js";
import { isLastfmAvailable } from "./lastfm-api.js";
import { lastfmSearchByGenre } from "./lastfm-search.js";
import { GENRE_QUERY_PREFIX_PATTERN, parseGenreQuery } from "./parser.js";

export type { ParsedGenreQuery } from "./parser.js";
export { GenreQueryParseError, parseGenreQuery } from "./parser.js";

/**
 * The whole genre-browse query, `genre:?`: the {@link GENRE_QUERY_PREFIX_PATTERN}
 * followed by a single `?` and nothing else apart from whitespace. Built from
 * the prefix pattern so the browse and the search agree on what a `genre:`
 * prefix is.
 */
const GENRE_BROWSE_QUERY_PATTERN = new RegExp(
  `${GENRE_QUERY_PREFIX_PATTERN.source}\\s*\\?\\s*$`,
  GENRE_QUERY_PREFIX_PATTERN.flags,
);

export class NoGenreSearchAdapterError extends Error {
  constructor() {
    super("Genre search unavailable (LASTFM_API_KEY not configured)");
    this.name = "NoGenreSearchAdapterError";
  }
}

/**
 * Check whether the query is a genre-browse request (`genre:?`).
 * Must be called before `runGenreSearch` to intercept the special case.
 *
 * @param query - The raw resolve query as the user typed it.
 * @returns `true` when the query is the `genre:` prefix, in any spelling
 *   {@link GENRE_QUERY_PREFIX_PATTERN} accepts, followed only by `?`.
 */
export function isGenreBrowseQuery(query: string): boolean {
  return GENRE_BROWSE_QUERY_PATTERN.test(query);
}

/**
 * Return the genre browse grid (popular tags with thumbnails).
 *
 * @throws {NoGenreSearchAdapterError} when LASTFM_API_KEY is missing
 */
export async function runGenreBrowse(): Promise<GenreBrowseResponse> {
  if (!isLastfmAvailable()) throw new NoGenreSearchAdapterError();
  const genres = await getGenreBrowseGrid();
  return { status: "genre-browse", genres };
}

/**
 * Parse and run a genre-search query, returning the discriminated-union
 * response variant.
 *
 * @throws {GenreQueryParseError} on syntactic errors
 * @throws {NoGenreSearchAdapterError} when LASTFM_API_KEY is missing
 */
export async function runGenreSearch(queryString: string): Promise<GenreSearchResponse> {
  const parsed = parseGenreQuery(queryString);

  if (!isLastfmAvailable()) {
    throw new NoGenreSearchAdapterError();
  }

  const raw = await lastfmSearchByGenre({
    genres: parsed.genres,
    vibe: parsed.vibe,
    tracks: parsed.tracks ?? 0,
    albums: parsed.albums ?? 0,
    artists: parsed.artists ?? 0,
  });

  return {
    status: "genre-search",
    query: {
      genres: parsed.genres,
      vibe: parsed.vibe,
      tracks: parsed.tracks,
      albums: parsed.albums,
      artists: parsed.artists,
    },
    results: {
      tracks: parsed.tracks !== null ? raw.tracks.map(toTrackCandidate) : null,
      albums: parsed.albums !== null ? raw.albums.map(toAlbumCandidate) : null,
      artists: parsed.artists !== null ? raw.artists.map(toArtistCandidate) : null,
    },
    warnings: parsed.warnings,
  };
}

/**
 * Check whether the query is a genre search, which the route hands to
 * `runGenreSearch`. A `genre:?` query matches as well, so callers test
 * `isGenreBrowseQuery` first.
 *
 * @param query - The raw resolve query as the user typed it.
 * @returns `true` when the query starts with the `genre:` prefix in any
 *   spelling {@link GENRE_QUERY_PREFIX_PATTERN} accepts, such as `genre : rock`.
 */
export function isGenreSearchQuery(query: string): boolean {
  return GENRE_QUERY_PREFIX_PATTERN.test(query);
}

// ─── Mappers: NormalizedX → GenreXCandidate ─────────────────────────────────

function toTrackCandidate(t: NormalizedTrack): GenreTrackCandidate {
  return {
    id: t.sourceId,
    title: t.title,
    artists: t.artists,
    albumName: t.albumName,
    artworkUrl: t.artworkUrl,
    durationMs: t.durationMs,
    webUrl: t.webUrl,
  };
}

function toAlbumCandidate(a: NormalizedAlbum): GenreAlbumCandidate {
  return {
    id: a.sourceId,
    title: a.title,
    artists: a.artists,
    artworkUrl: a.artworkUrl,
    webUrl: a.webUrl,
  };
}

function toArtistCandidate(a: NormalizedArtist): GenreArtistCandidate {
  return {
    id: a.sourceId,
    name: a.name,
    imageUrl: a.imageUrl,
    webUrl: a.webUrl,
  };
}
