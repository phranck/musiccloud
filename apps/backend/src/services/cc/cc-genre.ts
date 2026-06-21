/**
 * @file CC-native genre discovery — 100% Jamendo.
 *
 * Mirrors the commercial genre feature structurally (`services/genre-search`)
 * but is sourced exclusively from Jamendo, per the hard product rule that the
 * CC path never touches Last.fm, Deezer, or any commercial fallback.
 *
 * ## Two operations
 *
 *  - **Browse** (`runCcGenreBrowse`): Jamendo's curated genre stations
 *    (`GET /radios`) become the browse-grid tiles.
 *  - **Search** (`runCcGenreSearch`): a `genre: <name>` query lists Jamendo
 *    tracks of that genre (`GET /tracks?tags=<name>`).
 *
 * ## Scope: tracks only
 *
 * Only the tracks column is populated. Album and artist columns are
 * deliberately returned as `null` — CC album/artist pages do not exist yet,
 * and filling those columns with commercial data would violate the
 * Jamendo-only rule. They are deferred, not faked.
 *
 * ## Query parser reuse (DRY)
 *
 * The same `parseGenreQuery` that backs the commercial route parses CC genre
 * queries. The CC path only consumes `genres` and `tracks` from the parse
 * result; the per-type album/artist counts are ignored on purpose (tracks-only
 * scope). A `GenreQueryParseError` bubbles out for the route handler to map to
 * HTTP 400.
 */

import type {
  ApiGenreTile,
  ApiGenreTrackCandidate,
  ResolveGenreBrowseResponse,
  ResolveGenreSearchResponse,
} from "@musiccloud/shared";
import { parseGenreQuery } from "../genre-search/index.js";
import { getCcGenres, searchCcTracks } from "./jamendo/client.js";
import type { CcGenre, CcTrack } from "./jamendo/types.js";

/** Default track count when the query does not specify `tracks:`. */
const DEFAULT_CC_GENRE_TRACKS = 10;

/**
 * Cache-bust version for the CC genre tile artwork URLs. The artwork route
 * serves its JPEG bytes with `Cache-Control: immutable`, so browsers keep old
 * images forever once fetched. Bump this integer whenever the CC artwork
 * source or rendering rules change so every tile URL becomes a new cache key
 * and clients refetch. Mirrors `ARTWORK_VERSION` in the commercial
 * `services/genre-search/lastfm.ts`.
 */
const CC_ARTWORK_VERSION = 3;

/**
 * Maps a Jamendo genre to a browse-grid tile.
 *
 * `artworkUrl` points at the CC genre-artwork proxy
 * (`/api/cc/genre-artwork/:genreKey`), which serves a procedurally generated
 * tile: a representative Jamendo album cover with the genre name baked into the
 * upper-left — identical font, size, and margins to the commercial tiles. The
 * `?v=` query is a cache-bust keyed on {@link CC_ARTWORK_VERSION}. No
 * `accentColor` is emitted — that field is a commercial-path optimisation
 * derived from generated artwork the CC browse response does not pre-compute.
 *
 * @param genre - A Jamendo genre from `getCcGenres`.
 * @returns The wire-format genre tile.
 */
function toGenreTile(genre: CcGenre): ApiGenreTile {
  return {
    name: genre.name,
    displayName: genre.displayName,
    artworkUrl: `/api/cc/genre-artwork/${encodeURIComponent(genre.name)}?v=${CC_ARTWORK_VERSION}`,
  };
}

/**
 * Maps a Jamendo CC track to a genre-search track candidate.
 *
 * The `id` is the `jamendo:<jamendoId>` candidate id so a click can be sent
 * straight back to the CC resolve endpoint as `selectedCandidate` (see
 * `services/cc/cc-resolver.ts#parseCcCandidateId`). `webUrl` carries the
 * canonical Jamendo page; both `webUrl` and the `id` are load-bearing for the
 * frontend click handler.
 *
 * @param track - A mapped Jamendo CC track.
 * @returns The wire-format track candidate.
 */
function toGenreTrackCandidate(track: CcTrack): ApiGenreTrackCandidate {
  return {
    id: `jamendo:${track.jamendoId}`,
    title: track.title,
    artists: [track.artistName],
    albumName: track.albumName,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    webUrl: track.shareUrl ?? "",
  };
}

/**
 * Builds the CC genre browse grid from Jamendo's curated radio stations.
 *
 * @returns A `genre-browse` response whose tiles are Jamendo genres.
 * @throws Error on missing Jamendo client id or API failure.
 */
export async function runCcGenreBrowse(): Promise<ResolveGenreBrowseResponse> {
  const genres = await getCcGenres();
  return { status: "genre-browse", genres: genres.map(toGenreTile) };
}

/**
 * Runs a CC genre track search against Jamendo.
 *
 * Reuses {@link parseGenreQuery} (DRY) for syntax, then queries
 * `GET /tracks?tags=<genres joined by '+'>` for the parsed genres. Only the
 * tracks column is populated; albums and artists are `null` by design
 * (tracks-only scope — no commercial fallback). The `query` echo reports
 * `albums`/`artists` as `null` to signal those columns were not requested.
 *
 * @param query - Raw `genre: <name>[|<name>...]` query string.
 * @returns A `genre-search` response with a Jamendo tracks column.
 * @throws {GenreQueryParseError} on syntactically invalid input.
 * @throws Error on missing Jamendo client id or API failure.
 */
export async function runCcGenreSearch(query: string): Promise<ResolveGenreSearchResponse> {
  const parsed = parseGenreQuery(query);
  const limit = parsed.tracks ?? DEFAULT_CC_GENRE_TRACKS;

  const tracks = await searchCcTracks({ tags: parsed.genres.join("+"), limit });

  return {
    status: "genre-search",
    query: {
      genres: parsed.genres,
      vibe: parsed.vibe,
      tracks: parsed.tracks,
      albums: null,
      artists: null,
    },
    results: {
      tracks: tracks.map(toGenreTrackCandidate),
      albums: null,
      artists: null,
    },
    warnings: parsed.warnings ?? [],
  };
}
