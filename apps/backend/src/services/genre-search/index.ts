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
import { getGenreBrowseGrid, isLastfmAvailable, lastfmSearchByGenre } from "./lastfm.js";
import { parseGenreQuery } from "./parser.js";

export type { ParsedGenreQuery } from "./parser.js";
export { GenreQueryParseError, parseGenreQuery } from "./parser.js";

export class NoGenreSearchAdapterError extends Error {
  constructor() {
    super("Genre search unavailable (LASTFM_API_KEY not configured)");
    this.name = "NoGenreSearchAdapterError";
  }
}

/**
 * Check whether the query is a genre-browse request (`genre:?`).
 * Must be called before `runGenreSearch` to intercept the special case.
 */
export function isGenreBrowseQuery(query: string): boolean {
  return /^\s*genre\s*:\s*\?\s*$/i.test(query);
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

/** True iff the query starts with the `genre:` prefix (case-insensitive). */
export function isGenreSearchQuery(query: string): boolean {
  return query.trim().toLowerCase().startsWith("genre:");
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
