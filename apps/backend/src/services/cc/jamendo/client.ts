/**
 * Jamendo API v3.0 client for the Creative-Commons path.
 *
 * Standalone module, deliberately not registered in the commercial
 * `services/plugins/registry.ts`. Holds the endpoint wrappers the CC services
 * and routes call. The request transport (client id, throttle, timeout, retry)
 * lives in `transport.ts`, the raw-to-domain mappers in `map.ts`, and the
 * curated genre table in `genres.ts`.
 */

import { jamendoBioToHtml } from "./bio.js";
import { CC_GENRES } from "./genres.js";
import { mapJamendoAlbum, mapJamendoArtist, mapJamendoTrack } from "./map.js";
import { fetchJamendoTracks, jamendoFetch } from "./transport.js";
import type {
  CcAlbum,
  CcArtist,
  CcArtistMusicInfo,
  CcGenre,
  CcTrack,
  JamendoAlbumRaw,
  JamendoArtistRaw,
} from "./types.js";

export { JamendoUnavailableError } from "./transport.js";

/**
 * Search/filter parameters accepted by the track endpoints. Mirrors the subset
 * of Jamendo `GET /tracks` params the CC path uses; values are stringified and
 * URL-encoded by the transport ({@link fetchJamendoTracks}).
 */
export interface CcTrackQuery {
  search?: string;
  name?: string;
  artist_name?: string;
  album_name?: string;
  tags?: string;
  fuzzytags?: string;
  limit?: number;
  offset?: number;
}

/**
 * Searches CC tracks via `GET /tracks`. Accepts free-text (`search`) or the
 * structured fields (`name`/`artist_name`/`album_name`) the hero parser yields.
 *
 * @param query - Search/filter params.
 * @returns Mapped CC tracks (possibly empty).
 * @throws Error on missing client id or API failure (see {@link fetchJamendoTracks}).
 */
export async function searchCcTracks(query: CcTrackQuery): Promise<CcTrack[]> {
  const raw = await fetchJamendoTracks({
    search: query.search,
    name: query.name,
    artist_name: query.artist_name,
    album_name: query.album_name,
    tags: query.tags,
    fuzzytags: query.fuzzytags,
    limit: query.limit,
    offset: query.offset,
  });
  return raw.map(mapJamendoTrack);
}

/**
 * Fetches a single CC track by its Jamendo id.
 *
 * @param jamendoId - Jamendo track id.
 * @returns The mapped track, or null when none matches.
 * @throws Error on missing client id or API failure.
 */
export async function getCcTrack(jamendoId: string): Promise<CcTrack | null> {
  const raw = await fetchJamendoTracks({
    id: jamendoId,
    include: "musicinfo+stats+licenses",
    limit: 1,
  });
  const first = raw[0];
  return first ? mapJamendoTrack(first) : null;
}

/**
 * Fetches CC tracks similar to a seed track, approximated by shared genre tags.
 *
 * Jamendo's `GET /tracks/similar` returns nothing for the CC catalogue (verified
 * empty across seeds), so similarity is derived from the seed's genres: read the
 * seed's `musicinfo.tags.genres`, then fuzzy-tag search the most popular tracks
 * sharing those genres. Two throttled calls. Callers filter out the seed's own
 * artist so "similar" stays genuinely other artists.
 *
 * @param seedJamendoId - Jamendo id of the seed track.
 * @param limit - Maximum number of similar tracks (default 12).
 * @returns Mapped tracks sharing the seed's genres (empty when the seed has no
 *   genre tags or none match).
 * @throws Error on missing client id or API failure.
 */
export async function getSimilarCcTracks(seedJamendoId: string, limit = 12): Promise<CcTrack[]> {
  const seedRaw = await fetchJamendoTracks({
    id: seedJamendoId,
    include: "musicinfo",
    limit: 1,
  });
  const genres = seedRaw[0]?.musicinfo?.tags?.genres ?? [];
  if (genres.length === 0) {
    return [];
  }
  const raw = await fetchJamendoTracks({
    fuzzytags: genres.join("+"),
    order: "popularity_total",
    limit,
  });
  return raw.map(mapJamendoTrack);
}

/**
 * Fetches a single CC album by its Jamendo id.
 *
 * @param jamendoId - Jamendo album id.
 * @returns The mapped album, or null when none matches.
 * @throws Error on missing client id or API failure.
 */
export async function getCcAlbum(jamendoId: string): Promise<CcAlbum | null> {
  const raw = await jamendoFetch<JamendoAlbumRaw>("/albums", { id: jamendoId, limit: 1 });
  const first = raw[0];
  return first ? mapJamendoAlbum(first) : null;
}

/**
 * Fetches a single CC artist by its Jamendo id.
 *
 * @param jamendoId - Jamendo artist id.
 * @returns The mapped artist, or null when none matches.
 * @throws Error on missing client id or API failure.
 */
export async function getCcArtist(jamendoId: string): Promise<CcArtist | null> {
  const raw = await jamendoFetch<JamendoArtistRaw>("/artists", { id: jamendoId, limit: 1 });
  const first = raw[0];
  return first ? mapJamendoArtist(first) : null;
}

/**
 * Upper bound on genre tags carried into the artist profile. Honours the
 * `ArtistProfile.genres` "max 3" wire contract.
 */
const CC_ARTIST_GENRES_LIMIT = 3;

/**
 * Fetches the profile enrichment (image, genre tags, bio) for a Jamendo artist
 * from the dedicated `/artists/musicinfo` endpoint, feeding the CC artist-info
 * card's profile section. One throttled call; `jamendoFetch` enforces
 * `client_id`, the JSON envelope, and the shared burst throttle.
 *
 * The dedicated endpoint is required: `/artists?include=musicinfo` returns only
 * the image and an empty `musicinfo`, while `/artists/musicinfo` returns the
 * `tags` and locale-keyed `description` (bio).
 *
 * The bio is locale-resolved: the requested `locale`, then English, then
 * `null`. Genres are capped at {@link CC_ARTIST_GENRES_LIMIT} so the profile
 * never exceeds the wire contract's three-genre maximum.
 *
 * @param jamendoArtistId - Jamendo artist id.
 * @param locale - Preferred bio language (default `"en"`); falls back to English.
 * @returns The artist's profile enrichment, or `null` when Jamendo has no record
 *   for the id or the record carries no image, genres, and bio.
 * @throws Error on missing client id or API failure (see {@link jamendoFetch}).
 */
export async function getCcArtistMusicInfo(jamendoArtistId: string, locale = "en"): Promise<CcArtistMusicInfo | null> {
  const raw = await jamendoFetch<JamendoArtistRaw>("/artists/musicinfo", {
    id: jamendoArtistId,
    limit: 1,
  });
  const first = raw[0];
  if (!first) return null;
  const imageUrl = first.image || null;
  const genres = (first.musicinfo?.tags ?? []).slice(0, CC_ARTIST_GENRES_LIMIT);
  const bioSummary = jamendoBioToHtml(first.musicinfo?.description?.[locale] || first.musicinfo?.description?.en);
  // No image, no genres, and no bio means there is nothing worth showing, so
  // the result is "no profile" and the artist card self-hides instead of
  // rendering an empty shell with only the credit footer.
  if (!imageUrl && genres.length === 0 && !bioSummary) return null;
  return { imageUrl, genres, bioSummary };
}

/**
 * Upper bound on tracks fetched for a CC album view. Albums rarely exceed this;
 * the cap keeps the single Jamendo call bounded.
 */
const CC_ALBUM_TRACKS_LIMIT = 50;

/**
 * Fetches the tracks of a CC album via `GET /tracks?album_id=<id>`. Jamendo
 * returns an album's tracks in release order, so the list is render-ready.
 *
 * @param jamendoAlbumId - Jamendo album id.
 * @param limit - Maximum tracks (default {@link CC_ALBUM_TRACKS_LIMIT}).
 * @returns Mapped CC tracks (possibly empty).
 * @throws Error on missing client id or API failure (see {@link fetchJamendoTracks}).
 */
export async function getCcAlbumTracks(jamendoAlbumId: string, limit = CC_ALBUM_TRACKS_LIMIT): Promise<CcTrack[]> {
  const raw = await fetchJamendoTracks({ album_id: jamendoAlbumId, limit });
  return raw.map(mapJamendoTrack);
}

/**
 * Upper bound on tracks fetched for a CC artist's top-tracks view.
 */
const CC_ARTIST_TOP_TRACKS_LIMIT = 20;

/**
 * Fetches an artist's most-popular CC tracks via
 * `GET /tracks?artist_id=<id>&order=popularity_total`.
 *
 * @param jamendoArtistId - Jamendo artist id.
 * @param limit - Maximum tracks (default {@link CC_ARTIST_TOP_TRACKS_LIMIT}).
 * @returns Mapped CC tracks ordered by descending popularity (possibly empty).
 * @throws Error on missing client id or API failure (see {@link fetchJamendoTracks}).
 */
export async function getCcArtistTopTracks(
  jamendoArtistId: string,
  limit = CC_ARTIST_TOP_TRACKS_LIMIT,
): Promise<CcTrack[]> {
  const raw = await fetchJamendoTracks({
    artist_id: jamendoArtistId,
    order: "popularity_total",
    limit,
  });
  return raw.map(mapJamendoTrack);
}

/**
 * Fetches multiple CC artists in a single call via `GET /artists?id=<id1>+<id2>…`.
 * Enriches the genre-search artist column with the images and share URLs the
 * track query does not carry. Jamendo returns the artists in an arbitrary order
 * (not the request order) and may omit ones it has no record for, so callers
 * must match results back by `jamendoId` rather than position.
 *
 * @param jamendoArtistIds - Jamendo artist ids; an empty array short-circuits to `[]`.
 * @returns Mapped CC artists (possibly fewer than requested, arbitrary order).
 * @throws Error on missing client id or API failure (see {@link jamendoFetch}).
 */
export async function getCcArtistsByIds(jamendoArtistIds: string[]): Promise<CcArtist[]> {
  if (jamendoArtistIds.length === 0) {
    return [];
  }
  const raw = await jamendoFetch<JamendoArtistRaw>("/artists", {
    id: jamendoArtistIds.join("+"),
    limit: jamendoArtistIds.length,
  });
  return raw.map(mapJamendoArtist);
}

/**
 * Returns the curated CC genre set (see {@link CC_GENRES}).
 *
 * Async to keep a stable provider contract for the browse service and the
 * artwork route's per-tile `displayName` lookups; the list is static, so no
 * Jamendo round-trip happens.
 *
 * @returns The curated Jamendo genres (Jamendo tag + display label).
 */
export async function getCcGenres(): Promise<CcGenre[]> {
  return CC_GENRES;
}

/**
 * Fetches the URL of a high-resolution cover representative of a genre, used
 * as the source image for the CC genre tile artwork.
 *
 * Queries `GET /tracks` for the genre's most-popular track and returns its
 * 600px album cover. Jamendo's genre tags live on tracks, not albums: an
 * `/albums?tags=` query ignores the tag and returns the same globally-popular
 * album for every genre, so the cover must come from a tag-filtered track
 * query, the same source {@link searchCcTracks} uses. This keeps the CC genre
 * tile cover 100% Jamendo, never Last.fm or any commercial fallback. A `null`
 * return (no track, or no image on the top track) is the expected no-cover
 * signal. The artwork generator then renders a flat-colour tile with the genre
 * name baked in, so the grid never shows a broken tile.
 *
 * @param genre - The Jamendo genre tag, e.g. `"jazz"` (the `CcGenre.name`).
 * @returns The high-res cover URL, or `null` when Jamendo returned no usable
 *   image for the genre.
 * @throws Error on missing client id or API failure (see {@link fetchJamendoTracks}).
 */
export async function getCcGenreCoverUrl(genre: string): Promise<string | null> {
  const raw = await fetchJamendoTracks({
    tags: genre,
    order: "popularity_total",
    imagesize: 600,
    limit: 1,
  });
  return raw[0]?.image || raw[0]?.album_image || null;
}
