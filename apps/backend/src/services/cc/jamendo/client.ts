/**
 * Jamendo API v3.0 client for the Creative-Commons path.
 *
 * Standalone module, deliberately not registered in the commercial
 * `services/plugins/registry.ts`. Wraps the Jamendo REST endpoints, enforces
 * the required `client_id`, and maps raw responses to CC domain objects.
 */

import { decodeHtmlEntities } from "../../../lib/html.js";
import type {
  CcAlbum,
  CcArtist,
  CcArtistMusicInfo,
  CcGenre,
  CcTrack,
  JamendoAlbumRaw,
  JamendoArtistRaw,
  JamendoEnvelope,
  JamendoTrackRaw,
} from "./types.js";

const JAMENDO_BASE = "https://api.jamendo.com/v3.0";

/**
 * Search/filter parameters accepted by the track endpoints. Mirrors the subset
 * of Jamendo `GET /tracks` params the CC path uses; values are stringified and
 * URL-encoded by {@link jamendoFetch}.
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
 * Reads the configured Jamendo client id, throwing when it is absent so callers
 * fail loudly instead of silently hitting an unauthenticated endpoint.
 *
 * @returns The non-empty `JAMENDO_CLIENT_ID`.
 * @throws Error when `JAMENDO_CLIENT_ID` is unset or empty.
 */
function requireClientId(): string {
  const id = process.env.JAMENDO_CLIENT_ID;
  if (!id) {
    throw new Error("JAMENDO_CLIENT_ID is not set");
  }
  return id;
}

// ── Jamendo request throttle ──────────────────────────────────────────────
//
// Jamendo rate-limits request bursts (a handful of requests per second with no
// spacing trips it). EVERY Jamendo call in the CC path funnels through
// `jamendoFetch`, so one shared throttle here keeps the whole path under the
// limit: requests run serially, each starting at least `JAMENDO_MIN_GAP_MS`
// after the previous one settled. Combined with the permanent `genre_artworks`
// cache (a genre's cover is fetched once, ever), steady-state load is near
// zero — the only burst is the one-time browse-grid artwork generation, which
// this spaces out safely. The gap is env-overridable (tests set it to 0).
const JAMENDO_MIN_GAP_MS = Number(process.env.JAMENDO_MIN_GAP_MS ?? 350);
let jamendoGate: Promise<void> = Promise.resolve();

/**
 * Runs `task` after the previous Jamendo request, spaced by
 * {@link JAMENDO_MIN_GAP_MS}. The shared gate is advanced regardless of the
 * task's outcome, so one failed request never wedges the queue. The caller
 * still receives the task's real result or error.
 */
function throttleJamendo<T>(task: () => Promise<T>): Promise<T> {
  const result = jamendoGate.then(task);
  const spacer = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, JAMENDO_MIN_GAP_MS));
  jamendoGate = result.then(spacer, spacer);
  return result;
}

/**
 * Low-level GET against a Jamendo endpoint. Adds `client_id`, `format=json`
 * and every provided param, then validates the response envelope. Every call
 * is funnelled through {@link throttleJamendo} so the CC path stays under
 * Jamendo's burst rate limit.
 *
 * @typeParam T - Element type of the `results` array.
 * @param path - Endpoint path below the API base, e.g. `/tracks`.
 * @param params - Query params; `undefined`/empty values are skipped.
 * @returns The parsed `results` array.
 * @throws Error on transport failure, non-OK HTTP, or `status === "failed"`.
 */
export async function jamendoFetch<T>(path: string, params: Record<string, string | number | undefined>): Promise<T[]> {
  return throttleJamendo(async () => {
    const url = new URL(`${JAMENDO_BASE}${path}`);
    url.searchParams.set("client_id", requireClientId());
    url.searchParams.set("format", "json");
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Jamendo request failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as JamendoEnvelope<T>;
    if (body.headers.status !== "success") {
      throw new Error(`Jamendo API error: ${body.headers.error_message ?? body.headers.code}`);
    }
    return body.results;
  });
}

/**
 * Maps a raw Jamendo track to the CC domain shape.
 * Converts duration seconds → ms and prefers the track image over the album
 * image for artwork.
 *
 * @param raw - Raw Jamendo track object.
 * @returns The mapped {@link CcTrack}.
 */
export function mapJamendoTrack(raw: JamendoTrackRaw): CcTrack {
  return {
    jamendoId: raw.id,
    title: decodeHtmlEntities(raw.name),
    artistName: decodeHtmlEntities(raw.artist_name),
    jamendoArtistId: raw.artist_id,
    albumName: raw.album_name ? decodeHtmlEntities(raw.album_name) : undefined,
    jamendoAlbumId: raw.album_id || undefined,
    artworkUrl: raw.image || raw.album_image || undefined,
    durationMs: raw.duration ? raw.duration * 1000 : undefined,
    releaseDate: raw.releasedate || undefined,
    licenseCcurl: raw.license_ccurl || undefined,
    streamUrl: raw.audio,
    downloadUrl: raw.audiodownload || undefined,
    downloadAllowed: Boolean(raw.audiodownload_allowed),
    waveform: raw.waveform || undefined,
    shareUrl: raw.shareurl || undefined,
  };
}

/**
 * Searches CC tracks via `GET /tracks`. Accepts free-text (`search`) or the
 * structured fields (`name`/`artist_name`/`album_name`) the hero parser yields.
 *
 * @param query - Search/filter params.
 * @returns Mapped CC tracks (possibly empty).
 * @throws Error on missing client id or API failure (see {@link jamendoFetch}).
 */
export async function searchCcTracks(query: CcTrackQuery): Promise<CcTrack[]> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", {
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
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", { id: jamendoId, limit: 1 });
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
  const seedRaw = await jamendoFetch<JamendoTrackRaw>("/tracks", {
    id: seedJamendoId,
    include: "musicinfo",
    limit: 1,
  });
  const genres = seedRaw[0]?.musicinfo?.tags?.genres ?? [];
  if (genres.length === 0) {
    return [];
  }
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", {
    fuzzytags: genres.join("+"),
    order: "popularity_total",
    limit,
  });
  return raw.map(mapJamendoTrack);
}

/**
 * Maps a raw Jamendo album to the CC domain shape.
 *
 * @param raw - Raw Jamendo album object.
 * @returns The mapped {@link CcAlbum}.
 */
export function mapJamendoAlbum(raw: JamendoAlbumRaw): CcAlbum {
  return {
    jamendoId: raw.id,
    name: decodeHtmlEntities(raw.name),
    jamendoArtistId: raw.artist_id,
    artistName: decodeHtmlEntities(raw.artist_name),
    artworkUrl: raw.image || undefined,
    releaseDate: raw.releasedate || undefined,
    zipUrl: raw.zip || undefined,
    shareUrl: raw.shareurl || undefined,
  };
}

/**
 * Maps a raw Jamendo artist to the CC domain shape.
 *
 * @param raw - Raw Jamendo artist object.
 * @returns The mapped {@link CcArtist}.
 */
export function mapJamendoArtist(raw: JamendoArtistRaw): CcArtist {
  return {
    jamendoId: raw.id,
    name: decodeHtmlEntities(raw.name),
    website: raw.website || undefined,
    imageUrl: raw.image || undefined,
    shareUrl: raw.shareurl || undefined,
  };
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
 * Fetches the `include=musicinfo` profile enrichment for a Jamendo artist —
 * image, genre tags, and bio — feeding the CC artist-info card's profile
 * section. One throttled call (mirrors the `include=musicinfo` mechanic of
 * {@link getSimilarCcTracks}); `jamendoFetch` enforces `client_id`, the JSON
 * envelope, and the shared burst throttle.
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
  const raw = await jamendoFetch<JamendoArtistRaw>("/artists", {
    id: jamendoArtistId,
    include: "musicinfo",
    limit: 1,
  });
  const first = raw[0];
  if (!first) return null;
  const imageUrl = first.image || null;
  const genres = (first.musicinfo?.tags ?? []).slice(0, CC_ARTIST_GENRES_LIMIT);
  const bioSummary = first.musicinfo?.description?.[locale] || first.musicinfo?.description?.en || null;
  // No image, no genres, and no bio means there is nothing worth showing —
  // report "no profile" so the artist card self-hides instead of rendering an
  // empty shell with only the credit footer.
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
 * @throws Error on missing client id or API failure (see {@link jamendoFetch}).
 */
export async function getCcAlbumTracks(jamendoAlbumId: string, limit = CC_ALBUM_TRACKS_LIMIT): Promise<CcTrack[]> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", { album_id: jamendoAlbumId, limit });
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
 * @throws Error on missing client id or API failure (see {@link jamendoFetch}).
 */
export async function getCcArtistTopTracks(
  jamendoArtistId: string,
  limit = CC_ARTIST_TOP_TRACKS_LIMIT,
): Promise<CcTrack[]> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", {
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
 * The curated Creative-Commons genre set surfaced by the `genre:?` browse grid.
 *
 * Jamendo exposes no "top genres" endpoint — its `/radios` list is only ~14
 * editorial stations — so this is a hand-curated list of Jamendo genre tags,
 * each verified to return tracks via `tags=<name>`. `name` is the exact
 * lowercase Jamendo tag used for both the genre search and the artwork cover
 * lookup; `displayName` is the human label rendered on the tile and baked into
 * the generated artwork. Ordered roughly by familiarity so the grid reads
 * top-down.
 */
const CC_GENRES: CcGenre[] = [
  { name: "rock", displayName: "Rock" },
  { name: "pop", displayName: "Pop" },
  { name: "electro", displayName: "Electronic" },
  { name: "hiphop", displayName: "Hip Hop" },
  { name: "jazz", displayName: "Jazz" },
  { name: "classical", displayName: "Classical" },
  { name: "metal", displayName: "Metal" },
  { name: "folk", displayName: "Folk" },
  { name: "indie", displayName: "Indie" },
  { name: "alternative", displayName: "Alternative" },
  { name: "punk", displayName: "Punk" },
  { name: "grunge", displayName: "Grunge" },
  { name: "postrock", displayName: "Post-Rock" },
  { name: "blues", displayName: "Blues" },
  { name: "reggae", displayName: "Reggae" },
  { name: "ska", displayName: "Ska" },
  { name: "funk", displayName: "Funk" },
  { name: "soul", displayName: "Soul" },
  { name: "rnb", displayName: "R&B" },
  { name: "gospel", displayName: "Gospel" },
  { name: "disco", displayName: "Disco" },
  { name: "house", displayName: "House" },
  { name: "deephouse", displayName: "Deep House" },
  { name: "techno", displayName: "Techno" },
  { name: "trance", displayName: "Trance" },
  { name: "dubstep", displayName: "Dubstep" },
  { name: "drumnbass", displayName: "Drum & Bass" },
  { name: "breakbeat", displayName: "Breakbeat" },
  { name: "edm", displayName: "EDM" },
  { name: "dance", displayName: "Dance" },
  { name: "synthwave", displayName: "Synthwave" },
  { name: "electronica", displayName: "Electronica" },
  { name: "downtempo", displayName: "Downtempo" },
  { name: "chillout", displayName: "Chillout" },
  { name: "ambient", displayName: "Ambient" },
  { name: "lounge", displayName: "Lounge" },
  { name: "newage", displayName: "New Age" },
  { name: "world", displayName: "World" },
  { name: "latin", displayName: "Latin" },
  { name: "country", displayName: "Country" },
  { name: "swing", displayName: "Swing" },
  { name: "experimental", displayName: "Experimental" },
  { name: "psychedelic", displayName: "Psychedelic" },
  { name: "instrumental", displayName: "Instrumental" },
  { name: "acoustic", displayName: "Acoustic" },
  { name: "soundtrack", displayName: "Soundtrack" },
  { name: "cinematic", displayName: "Cinematic" },
  { name: "orchestral", displayName: "Orchestral" },
  { name: "piano", displayName: "Piano" },
];

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
 * query — the same source {@link searchCcTracks} uses. This keeps the CC genre
 * tile cover 100% Jamendo, never Last.fm or any commercial fallback. A `null`
 * return (no track, or no image on the top track) is the expected no-cover
 * signal — the artwork generator then renders a flat-colour tile with the
 * genre name baked in, so the grid never shows a broken tile.
 *
 * @param genre - The Jamendo genre tag, e.g. `"jazz"` (the `CcGenre.name`).
 * @returns The high-res cover URL, or `null` when Jamendo returned no usable
 *   image for the genre.
 * @throws Error on missing client id or API failure (see {@link jamendoFetch}).
 */
export async function getCcGenreCoverUrl(genre: string): Promise<string | null> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", {
    tags: genre,
    order: "popularity_total",
    imagesize: 600,
    limit: 1,
  });
  return raw[0]?.image || raw[0]?.album_image || null;
}
