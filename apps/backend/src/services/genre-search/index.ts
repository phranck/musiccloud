/**
 * @file Public entry point for the genre-search feature.
 *
 * Ties the parser, the adapter registry, and the response-type mapper
 * together. Called from `POST /api/v1/resolve` whenever the incoming
 * query starts with `genre:`.
 *
 * ## Adapter selection
 *
 * The orchestrator picks the first *active* adapter (enabled + available)
 * whose `searchByGenre` is defined. In v1 that is Deezer. No fallback
 * chain — if Deezer is down or disabled, the caller gets a
 * `NoGenreSearchAdapterError` and should return 503 to the user.
 *
 * ## Error surface
 *
 * Three typed errors bubble out of this module so the route handler can
 * map them to precise HTTP status codes:
 *
 *   - `GenreQueryParseError`      → 400 (bad syntax)
 *   - `UnknownGenreError`         → 400 (unknown genre, with supported list)
 *   - `NoGenreSearchAdapterError` → 503 (no adapter available)
 *
 * Any other thrown error comes from the adapter itself (Deezer HTTP/API
 * failure) and should also translate to 503.
 */
import { UnknownAppleGenreError } from "../plugins/apple-music/genre-search.js";
import { getActiveAdapters } from "../plugins/registry.js";
import type {
  GenreAlbumCandidate,
  GenreArtistCandidate,
  GenreSearchResponse,
  GenreTrackCandidate,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedTrack,
} from "../types.js";
import { UnknownGenreError } from "./genre-map.js";
import { parseGenreQuery } from "./parser.js";

export { listSupportedGenres, UnknownGenreError } from "./genre-map.js";
export type { ParsedGenreQuery } from "./parser.js";
export { GenreQueryParseError, parseGenreQuery } from "./parser.js";

export class NoGenreSearchAdapterError extends Error {
  constructor() {
    super("No active adapter supports genre search");
    this.name = "NoGenreSearchAdapterError";
  }
}

/**
 * Parse and run a genre-search query, returning the discriminated-union
 * response variant.
 *
 * @throws {GenreQueryParseError} on syntactic errors
 * @throws {UnknownGenreError} when a genre name cannot be resolved
 * @throws {NoGenreSearchAdapterError} when no active adapter implements it
 */
export async function runGenreSearch(queryString: string): Promise<GenreSearchResponse> {
  const parsed = parseGenreQuery(queryString);

  const adapters = await getActiveAdapters();
  const adapter = adapters.find((a) => typeof a.searchByGenre === "function");
  if (!adapter?.searchByGenre) {
    throw new NoGenreSearchAdapterError();
  }

  let raw: import("../types.js").GenreSearchResult;
  try {
    raw = await adapter.searchByGenre({
      genres: parsed.genres,
      vibe: parsed.vibe,
      tracks: parsed.tracks ?? 0,
      albums: parsed.albums ?? 0,
      artists: parsed.artists ?? 0,
    });
  } catch (err) {
    // Normalize adapter-specific unknown-genre errors into the shared type
    // so the route handler only needs to check one error class.
    if (err instanceof UnknownAppleGenreError) {
      throw new UnknownGenreError(err.input, err.supportedGenres);
    }
    throw err;
  }

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
