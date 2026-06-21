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
 *  - **Search** (`runCcGenreSearch`): a `genre: <name>` query returns three
 *    columns — tracks, albums and artists — all derived from a single Jamendo
 *    `GET /tracks?tags=<name>` query (albums/artists deduped from the track
 *    rows), plus one `GET /artists?id=…` lookup to enrich the artist column
 *    with images and share URLs. Album/artist clicks resolve to CC album/artist
 *    views via their `jamendo-album:` / `jamendo-artist:` candidate ids.
 *
 * ## Single Jamendo query per column set (rate-limit)
 *
 * All three columns come from one tags query (the artist enrichment adds one
 * more call only when the artist column is requested), keeping the CC path well
 * under Jamendo's burst limit. The track rows are over-fetched a little so the
 * album/artist dedup still yields enough distinct rows.
 *
 * ## Query parser reuse (DRY)
 *
 * The same `parseGenreQuery` that backs the commercial route parses CC genre
 * queries. The CC path consumes `genres` and the per-type `tracks`/`albums`/
 * `artists` counts: a `null` count means that column was not requested and is
 * returned as `null`. A `GenreQueryParseError` bubbles out for the route handler
 * to map to HTTP 400.
 */

import type {
  ApiGenreAlbumCandidate,
  ApiGenreArtistCandidate,
  ApiGenreTile,
  ApiGenreTrackCandidate,
  ResolveGenreBrowseResponse,
  ResolveGenreSearchResponse,
} from "@musiccloud/shared";
import { parseGenreQuery } from "../genre-search/index.js";
import { ccAlbumCandidateId, ccArtistCandidateId, ccCandidateId } from "./cc-resolver.js";
import { getCcArtistsByIds, getCcGenres, searchCcTracks } from "./jamendo/client.js";
import type { CcArtist, CcGenre, CcTrack } from "./jamendo/types.js";

/**
 * Over-fetch factor for the album/artist columns. A popular genre repeats the
 * same artists and albums across its top tracks, so to fill an N-row album or
 * artist column the track query must pull more than N rows before dedup.
 */
const CC_GENRE_DEDUP_OVERFETCH = 3;

/**
 * Cache-bust version for the CC genre tile artwork URLs. The artwork route
 * serves its JPEG bytes with `Cache-Control: immutable`, so browsers keep old
 * images forever once fetched. Bump this integer whenever the CC artwork
 * source or rendering rules change so every tile URL becomes a new cache key
 * and clients refetch. Mirrors `ARTWORK_VERSION` in the commercial
 * `services/genre-search/lastfm.ts`.
 */
const CC_ARTWORK_VERSION = 5;

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
 * The `id` is the `jamendo:<jamendoId>` candidate id (via {@link ccCandidateId})
 * so a click can be sent straight back to the CC resolve endpoint as
 * `selectedCandidate`. `webUrl` carries the canonical Jamendo page.
 *
 * @param track - A mapped Jamendo CC track.
 * @returns The wire-format track candidate.
 */
function toGenreTrackCandidate(track: CcTrack): ApiGenreTrackCandidate {
  return {
    id: ccCandidateId(track.jamendoId),
    title: track.title,
    artists: [track.artistName],
    albumName: track.albumName,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    webUrl: track.shareUrl ?? "",
  };
}

/**
 * Derives the album column from the genre's track rows: the first track of each
 * distinct album becomes one album candidate, capped at `limit`. Tracks without
 * an album id are skipped. The `id` is a `jamendo-album:` candidate id so a click
 * resolves to the CC album view; `webUrl` is empty because the CC click path
 * routes by id, not by URL.
 *
 * @param tracks - The genre's track rows (over-fetched for dedup).
 * @param limit - Maximum album rows to emit.
 * @returns Up to `limit` distinct album candidates, in track order.
 */
function deriveAlbumColumn(tracks: CcTrack[], limit: number): ApiGenreAlbumCandidate[] {
  const seen = new Set<string>();
  const out: ApiGenreAlbumCandidate[] = [];
  for (const track of tracks) {
    if (!track.jamendoAlbumId || seen.has(track.jamendoAlbumId)) {
      continue;
    }
    seen.add(track.jamendoAlbumId);
    out.push({
      id: ccAlbumCandidateId(track.jamendoAlbumId),
      title: track.albumName ?? "",
      artists: [track.artistName],
      artworkUrl: track.artworkUrl,
      webUrl: "",
    });
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

/**
 * Maps a distinct genre artist to an artist candidate, enriched with the image
 * and share URL from a {@link getCcArtistsByIds} lookup when Jamendo returned one.
 *
 * @param jamendoArtistId - Jamendo artist id (the dedup key and candidate id source).
 * @param name - Artist name from the track row.
 * @param enriched - The matching artist from the id lookup, if any.
 * @returns The wire-format artist candidate.
 */
function toGenreArtistCandidate(
  jamendoArtistId: string,
  name: string,
  enriched: CcArtist | undefined,
): ApiGenreArtistCandidate {
  return {
    id: ccArtistCandidateId(jamendoArtistId),
    name,
    imageUrl: enriched?.imageUrl,
    webUrl: enriched?.shareUrl ?? "",
  };
}

/**
 * Derives the artist column from the genre's track rows: distinct artists in
 * track order, capped at `limit`, then enriched with images and share URLs via
 * one `GET /artists?id=…` call. Jamendo returns the enrichment in arbitrary
 * order, so it is matched back by id.
 *
 * @param tracks - The genre's track rows (over-fetched for dedup).
 * @param limit - Maximum artist rows to emit.
 * @returns Up to `limit` distinct artist candidates, in track order.
 */
async function deriveArtistColumn(tracks: CcTrack[], limit: number): Promise<ApiGenreArtistCandidate[]> {
  const orderedIds: string[] = [];
  const names = new Map<string, string>();
  for (const track of tracks) {
    if (names.has(track.jamendoArtistId)) {
      continue;
    }
    names.set(track.jamendoArtistId, track.artistName);
    orderedIds.push(track.jamendoArtistId);
    if (orderedIds.length >= limit) {
      break;
    }
  }

  const enriched = await getCcArtistsByIds(orderedIds);
  const byId = new Map(enriched.map((artist) => [artist.jamendoId, artist]));
  return orderedIds.map((id) => toGenreArtistCandidate(id, names.get(id) ?? "", byId.get(id)));
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
 * Runs a CC genre search against Jamendo and builds all three result columns.
 *
 * Reuses {@link parseGenreQuery} (DRY) for syntax, then pulls one
 * `GET /tracks?tags=<genres joined by '+'>` page sized to fill the requested
 * columns. Tracks map directly; albums and artists are deduped from the same
 * rows ({@link deriveAlbumColumn} / {@link deriveArtistColumn}), the artist
 * column adding one `GET /artists?id=…` enrichment call. A `null` per-type count
 * means that column was not requested and is returned as `null` (and its work is
 * skipped).
 *
 * @param query - Raw `genre: <name>[|<name>...]` query string.
 * @returns A `genre-search` response with up to three Jamendo-sourced columns.
 * @throws {GenreQueryParseError} on syntactically invalid input.
 * @throws Error on missing Jamendo client id or API failure.
 */
export async function runCcGenreSearch(query: string): Promise<ResolveGenreSearchResponse> {
  const parsed = parseGenreQuery(query);
  const wantTracks = parsed.tracks;
  const wantAlbums = parsed.albums;
  const wantArtists = parsed.artists;

  // One tags query feeds all three columns; over-fetch so the album/artist dedup
  // still yields enough distinct rows.
  const fetchLimit = Math.max(
    wantTracks ?? 0,
    (wantAlbums ?? 0) * CC_GENRE_DEDUP_OVERFETCH,
    (wantArtists ?? 0) * CC_GENRE_DEDUP_OVERFETCH,
    1,
  );
  const tracks = await searchCcTracks({ tags: parsed.genres.join("+"), limit: fetchLimit });

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
      tracks: wantTracks !== null ? tracks.slice(0, wantTracks).map(toGenreTrackCandidate) : null,
      albums: wantAlbums !== null ? deriveAlbumColumn(tracks, wantAlbums) : null,
      artists: wantArtists !== null ? await deriveArtistColumn(tracks, wantArtists) : null,
    },
    warnings: parsed.warnings ?? [],
  };
}
