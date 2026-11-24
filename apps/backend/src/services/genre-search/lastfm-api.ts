/**
 * @file Last.fm tag endpoints and the mappers from their responses to the
 * normalized track, album and artist shapes.
 *
 * ## Endpoints
 *
 *   - `tag.getTopTracks` returns the top tracks for a tag, ranked by listener count.
 *   - `tag.getTopAlbums` returns the top albums for a tag, artwork included.
 *   - `tag.getTopArtists` returns the top artists for a tag.
 *
 * ## No credential required
 *
 * Only the LASTFM_API_KEY env var, which the project already has for
 * artist-info enrichment.
 */

import { log } from "../../lib/infra/logger.js";
import { cacheAlbumImage } from "../image-cache.js";
import { type LastFmImage, lastFmApiKey, lastFmGet, pickLastFmImage } from "../plugins/lastfm/lastfm-response.js";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../types.js";

/** How many top albums are asked for when a genre's cover is looked up. */
const GENRE_COVER_ALBUM_LIMIT = 5;

/** The artwork source recorded with every cover written to the image cache. */
const ARTWORK_SOURCE = "lastfm";

/**
 * Logs a degraded step of the Last.fm genre search under its stable error code.
 *
 * @param operation - The step that degraded.
 * @param outcome - What the caller got instead.
 * @param error - The failure.
 */
export function logLastfmDeviation(operation: string, outcome: string, error: unknown): void {
  log.deviation(
    {
      component: "LastfmGenreSearch",
      errorCode: "MC-API-0004",
      operation,
      outcome,
    },
    error,
  );
}

/** Returns true when the Last.fm API key is present. */
export function isLastfmAvailable(): boolean {
  return lastFmApiKey() !== null;
}

// ─── Last.fm response shapes ───────────────────────────────────────────────

interface LfmTrack {
  name: string;
  artist: { name: string; mbid?: string };
  mbid?: string;
  url?: string;
  duration?: string;
  image?: LastFmImage[];
}

interface LfmAlbum {
  name: string;
  artist: { name: string; mbid?: string };
  mbid?: string;
  url?: string;
  image?: LastFmImage[];
}

interface LfmArtist {
  name: string;
  mbid?: string;
  url?: string;
  image?: LastFmImage[];
}

/** An album of a genre together with the cover URL Last.fm gave for it. */
export interface GenreAlbumCover {
  album: LfmAlbum;
  url: string;
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────
//
// A tag Last.fm does not know reads as one without music. A refusal inside a
// 200 answer, such as the rate limit, throws, so it counts as a failure rather
// than as an empty tag.

/**
 * Fetches the top tracks of a tag.
 *
 * @param tag - The tag as Last.fm spells it.
 * @param limit - How many tracks to ask for.
 * @returns The raw tracks, empty for a tag without music.
 */
export async function fetchTopTracks(tag: string, limit: number): Promise<LfmTrack[]> {
  const data = await lastFmGet<{ tracks?: { track?: LfmTrack[] } }>("tag.getTopTracks", {
    tag,
    limit: String(limit),
  });
  return data?.tracks?.track ?? [];
}

/**
 * Fetches the top albums of a tag.
 *
 * @param tag - The tag as Last.fm spells it.
 * @param limit - How many albums to ask for.
 * @returns The raw albums, empty for a tag without music.
 */
export async function fetchTopAlbums(tag: string, limit: number): Promise<LfmAlbum[]> {
  const data = await lastFmGet<{ albums?: { album?: LfmAlbum[] } }>("tag.getTopAlbums", {
    tag,
    limit: String(limit),
  });
  return data?.albums?.album ?? [];
}

/**
 * Fetches the top artists of a tag.
 *
 * @param tag - The tag as Last.fm spells it.
 * @param limit - How many artists to ask for.
 * @returns The raw artists, empty for a tag without music.
 */
export async function fetchTopArtists(tag: string, limit: number): Promise<LfmArtist[]> {
  const data = await lastFmGet<{ topartists?: { artist?: LfmArtist[] } }>("tag.getTopArtists", {
    tag,
    limit: String(limit),
  });
  return data?.topartists?.artist ?? [];
}

/**
 * Asks Last.fm for the genre's top albums and returns the first one that has
 * a cover.
 *
 * @param tag - The tag as Last.fm spells it.
 * @returns The first album with a cover and its URL, or `null` when none has one.
 * @throws When the Last.fm request fails.
 */
export async function findGenreAlbumCover(tag: string): Promise<GenreAlbumCover | null> {
  const albums = await fetchTopAlbums(tag, GENRE_COVER_ALBUM_LIMIT);
  for (const album of albums) {
    const url = pickLastFmImage(album.image);
    if (url) return { album, url };
  }
  return null;
}

/**
 * Best-effort cover lookup for a genre: ask Last.fm for its top albums and
 * return the first image that can be extracted. The genre-artwork route uses
 * it as the color-sampling seed and never shows it to the user, so `null` is
 * acceptable: the artwork generator then falls back to a default accent.
 *
 * @param genre - The genre tag.
 * @returns The cover URL, or `null` when none was found or the request failed.
 */
export async function getGenreCoverUrl(genre: string): Promise<string | null> {
  try {
    return (await findGenreAlbumCover(genre))?.url ?? null;
  } catch (error) {
    logLastfmDeviation("genre_cover_lookup", "default_accent_fallback", error);
    return null;
  }
}

/**
 * Writes an album cover to the permanent image cache without making the caller
 * wait. A failed write is logged and costs only a later cache miss.
 *
 * @param artist - The album's artist.
 * @param title - The album title.
 * @param url - The cover URL to store.
 * @param operation - The step name logged when the write fails.
 * @param outcome - What the caller got instead, logged when the write fails.
 */
export function cacheAlbumImageInBackground(
  artist: string,
  title: string,
  url: string,
  operation: string,
  outcome: string,
): void {
  cacheAlbumImage(artist, title, url, ARTWORK_SOURCE).catch((error) => logLastfmDeviation(operation, outcome, error));
}

// ─── Mappers ───────────────────────────────────────────────────────────────

/**
 * Maps a Last.fm track to the normalized shape. The artwork is filled in later
 * from the image cache.
 *
 * @param raw - The Last.fm track.
 * @returns The normalized track.
 */
export function mapTrack(raw: LfmTrack): NormalizedTrack {
  return {
    sourceService: "deezer", // Last.fm URLs won't resolve; use a service the resolve flow can handle
    sourceId: raw.mbid || `lfm-${raw.artist.name}-${raw.name}`,
    title: raw.name,
    artists: [raw.artist.name],
    artworkUrl: undefined, // filled post-mapping via image cache
    durationMs: raw.duration ? Number(raw.duration) * 1000 : undefined,
    mbid: raw.mbid || undefined,
    webUrl:
      raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.artist.name)}/_/${encodeURIComponent(raw.name)}`,
  };
}

/**
 * Maps a Last.fm album to the normalized shape, taking the cover Last.fm sent.
 *
 * @param raw - The Last.fm album.
 * @returns The normalized album.
 */
export function mapAlbum(raw: LfmAlbum): NormalizedAlbum {
  return {
    sourceService: "deezer",
    sourceId: raw.mbid || `lfm-${raw.artist.name}-${raw.name}`,
    title: raw.name,
    artists: [raw.artist.name],
    artworkUrl: pickLastFmImage(raw.image) ?? undefined,
    mbid: raw.mbid || undefined,
    webUrl:
      raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.artist.name)}/${encodeURIComponent(raw.name)}`,
  };
}

/**
 * Maps a Last.fm artist to the normalized shape. The image is filled in later
 * from the image cache.
 *
 * @param raw - The Last.fm artist.
 * @returns The normalized artist.
 */
export function mapArtist(raw: LfmArtist): NormalizedArtist {
  return {
    sourceService: "deezer",
    sourceId: raw.mbid || `lfm-${raw.name}`,
    name: raw.name,
    imageUrl: undefined, // filled post-mapping via Spotify image cache
    mbid: raw.mbid || undefined,
    webUrl: raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.name)}`,
  };
}
