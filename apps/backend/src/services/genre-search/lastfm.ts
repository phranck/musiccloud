/**
 * @file Last.fm-backed genre-search implementation.
 *
 * Uses Last.fm's tag system for genre discovery. Last.fm has thousands of
 * community-curated tags (trance, bebop, shoegaze, krautrock, ...) far
 * beyond the ~22 top-level genres that Spotify/Apple/Deezer expose.
 *
 * ## Endpoints
 *
 *   tag.getTopTracks  — top tracks for a tag, ranked by listener count
 *   tag.getTopAlbums  — top albums for a tag (includes artwork)
 *   tag.getTopArtists — top artists for a tag
 *
 * ## Artwork strategy
 *
 *   - Albums: Last.fm includes real cover art directly in the response.
 *   - Tracks: Last.fm returns a placeholder. We do a parallel batch of
 *     `track.getInfo` calls to get the album cover for each track.
 *   - Artists: Resolved via the shared Spotify-backed `getArtistImages()`.
 *
 * All artwork URLs are permanently cached in Postgres (track_images,
 * album_images, artist_images) so repeat queries have zero extra HTTP cost.
 *
 * ## Sampling
 *
 * Last.fm tags are already ranked by popularity. We fetch a larger pool
 * (up to 50) and apply the same sampling strategies as the Deezer/Apple
 * adapters: top-N for `hot`, stratified sample for `mixed`.
 *
 * ## No credential required
 *
 * Only the LASTFM_API_KEY env var, which the project already has for
 * artist-info enrichment.
 */

import { fetchWithTimeout } from "../../lib/infra/fetch.js";
import { log } from "../../lib/infra/logger.js";
import { extractPrimaryArtist } from "../artist-utils.js";
import { cacheAlbumImage, cacheTrackImage, getArtistImages, getTrackImages, trackImageKey } from "../image-cache.js";
import type { GenreSearchResult, NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../types.js";
import { evenSpacedSample, stratifiedSample } from "./sampler.js";

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0";
const MAX_POOL = 50;
const HOT_SPREAD_FACTOR = 3;
const HOT_SPREAD_MIN = 30;

function apiKey(): string {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("LASTFM_API_KEY not configured");
  return key;
}

/** Returns true when the Last.fm API key is present. */
export function isLastfmAvailable(): boolean {
  return !!process.env.LASTFM_API_KEY;
}

// ─── Last.fm response shapes ───────────────────────────────────────────────

interface LfmImage {
  "#text": string;
  size: string;
}

interface LfmTrack {
  name: string;
  artist: { name: string; mbid?: string };
  mbid?: string;
  url?: string;
  duration?: string;
  image?: LfmImage[];
}

interface LfmAlbum {
  name: string;
  artist: { name: string; mbid?: string };
  mbid?: string;
  url?: string;
  image?: LfmImage[];
}

interface LfmArtist {
  name: string;
  mbid?: string;
  url?: string;
  image?: LfmImage[];
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────

async function lfmFetch<T>(method: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ method, api_key: apiKey(), format: "json", ...params });
  const res = await fetchWithTimeout(`${LASTFM_BASE}/?${qs.toString()}`, {}, 5000);
  if (!res.ok) throw new Error(`Last.fm ${method} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchTopTracks(tag: string, limit: number): Promise<LfmTrack[]> {
  const data = await lfmFetch<{ tracks?: { track?: LfmTrack[] } }>("tag.getTopTracks", {
    tag,
    limit: String(limit),
  });
  return data.tracks?.track ?? [];
}

async function fetchTopAlbums(tag: string, limit: number): Promise<LfmAlbum[]> {
  const data = await lfmFetch<{ albums?: { album?: LfmAlbum[] } }>("tag.getTopAlbums", {
    tag,
    limit: String(limit),
  });
  return data.albums?.album ?? [];
}

async function fetchTopArtists(tag: string, limit: number): Promise<LfmArtist[]> {
  const data = await lfmFetch<{ topartists?: { artist?: LfmArtist[] } }>("tag.getTopArtists", {
    tag,
    limit: String(limit),
  });
  return data.topartists?.artist ?? [];
}

// ─── Image helpers ─────────────────────────────────────────────────────────

function pickImage(images: LfmImage[] | undefined): string | undefined {
  if (!images || images.length === 0) return undefined;
  const xl = images.find((i) => i.size === "extralarge");
  const url = xl?.["#text"] || images[images.length - 1]?.["#text"];
  if (!url) return undefined;
  // Last.fm placeholder hash — not a real image
  if (url.includes("2a96cbd8b46e442fc41c2b86b821562f")) return undefined;
  return url;
}

// ─── Mappers ───────────────────────────────────────────────────────────────

function mapTrack(raw: LfmTrack): NormalizedTrack {
  return {
    sourceService: "deezer", // Last.fm URLs won't resolve; use a service the resolve flow can handle
    sourceId: raw.mbid || `lfm-${raw.artist.name}-${raw.name}`,
    title: raw.name,
    artists: [raw.artist.name],
    artworkUrl: undefined, // filled post-mapping via image cache
    durationMs: raw.duration ? Number(raw.duration) * 1000 : undefined,
    webUrl:
      raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.artist.name)}/_/${encodeURIComponent(raw.name)}`,
  };
}

function mapAlbum(raw: LfmAlbum): NormalizedAlbum {
  return {
    sourceService: "deezer",
    sourceId: raw.mbid || `lfm-${raw.artist.name}-${raw.name}`,
    title: raw.name,
    artists: [raw.artist.name],
    artworkUrl: pickImage(raw.image),
    webUrl:
      raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.artist.name)}/${encodeURIComponent(raw.name)}`,
  };
}

function mapArtist(raw: LfmArtist): NormalizedArtist {
  return {
    sourceService: "deezer",
    sourceId: raw.mbid || `lfm-${raw.name}`,
    name: raw.name,
    imageUrl: undefined, // filled post-mapping via Spotify image cache
    webUrl: raw.url ?? `https://www.last.fm/music/${encodeURIComponent(raw.name)}`,
  };
}

// ─── Dedup + interleave (reused from Deezer/Apple adapters) ────────────────

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const l of lists) {
      if (i < l.length) out.push(l[i]);
    }
  }
  return out;
}

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

// ─── Public entry point ────────────────────────────────────────────────────

export interface LastfmGenreSearchInput {
  genres: string[];
  vibe: "hot" | "mixed";
  tracks: number;
  albums: number;
  artists: number;
}

/**
 * Run a genre-search query against Last.fm's tag system.
 *
 * Fetches tracks, albums, and artists for each tag (genre) in parallel,
 * interleaves multi-genre results, dedupes, samples, and enriches with
 * artwork from the permanent image cache.
 */
export async function lastfmSearchByGenre(input: LastfmGenreSearchInput): Promise<GenreSearchResult> {
  if (input.tracks === 0 && input.albums === 0 && input.artists === 0) {
    return { tracks: [], albums: [], artists: [] };
  }

  // Fetch raw data for all genres in parallel
  const perGenre = await Promise.all(
    input.genres.map(async (genre) => {
      const [rawTracks, rawAlbums, rawArtists] = await Promise.all([
        input.tracks > 0 ? fetchTopTracks(genre, MAX_POOL) : Promise.resolve([]),
        input.albums > 0 ? fetchTopAlbums(genre, MAX_POOL) : Promise.resolve([]),
        input.artists > 0 ? fetchTopArtists(genre, MAX_POOL) : Promise.resolve([]),
      ]);
      return {
        tracks: rawTracks.map(mapTrack),
        albums: rawAlbums.map(mapAlbum),
        artists: rawArtists.map(mapArtist),
      };
    }),
  );

  // Interleave + dedupe across genres
  const tracksPool = dedupeBy(interleave(perGenre.map((p) => p.tracks)), (t) =>
    extractPrimaryArtist(t.artists[0] || t.sourceId),
  );
  const albumsPool = dedupeBy(interleave(perGenre.map((p) => p.albums)), (a) => a.sourceId);
  const artistsPool = dedupeBy(interleave(perGenre.map((p) => p.artists)), (a) => a.sourceId);

  // Sample
  const spreadRange = Math.min(
    Math.max(HOT_SPREAD_MIN, HOT_SPREAD_FACTOR * Math.max(input.albums, input.artists)),
    MAX_POOL,
  );

  const finalizeTop = <T>(pool: T[], target: number): T[] => {
    if (target === 0) return [];
    return input.vibe === "mixed" ? stratifiedSample(pool, target) : pool.slice(0, target);
  };
  const finalizeSpread = <T>(pool: T[], target: number): T[] => {
    if (target === 0) return [];
    if (input.vibe === "mixed") return stratifiedSample(pool, target);
    return evenSpacedSample(pool.slice(0, spreadRange), target);
  };

  const finalTracks = finalizeTop(tracksPool, input.tracks);
  const finalAlbums = finalizeSpread(albumsPool, input.albums);
  const finalArtists = finalizeSpread(artistsPool, input.artists);

  // ─── Artwork enrichment (parallel) ─────────────────────────────────────

  const enrichOps: Promise<void>[] = [];

  // Tracks: DB cache first, Last.fm track.getInfo for misses
  if (finalTracks.length > 0) {
    enrichOps.push(
      (async () => {
        const trackKeys = finalTracks.map((t) => ({ artist: t.artists[0], title: t.title }));
        const imageMap = await getTrackImages(trackKeys);
        for (const t of finalTracks) {
          t.artworkUrl = imageMap.get(trackImageKey(t.artists[0], t.title)) ?? t.artworkUrl;
        }
      })(),
    );
  }

  // Albums: write-through cache (Last.fm already provided artwork)
  if (finalAlbums.length > 0) {
    enrichOps.push(
      (async () => {
        for (const a of finalAlbums) {
          if (a.artworkUrl) {
            try {
              await cacheAlbumImage(a.artists[0], a.title, a.artworkUrl, "lastfm");
            } catch {
              // best-effort
            }
          }
        }
      })(),
    );
  }

  // Artists: Spotify-backed image cache
  if (finalArtists.length > 0) {
    enrichOps.push(
      (async () => {
        const imageMap = await getArtistImages(finalArtists.map((a) => a.name));
        for (const a of finalArtists) {
          a.imageUrl = imageMap.get(a.name) ?? a.imageUrl;
        }
      })(),
    );
  }

  await Promise.all(enrichOps);

  // Write-through for tracks that got artwork (for future cache hits)
  for (const t of finalTracks) {
    if (t.artworkUrl) {
      cacheTrackImage(t.artists[0], t.title, t.artworkUrl, "lastfm").catch(() => {});
    }
  }

  log.debug(
    "LastfmGenreSearch",
    `Returned ${finalTracks.length}T/${finalAlbums.length}A/${finalArtists.length}Ar for [${input.genres.join(", ")}]`,
  );

  return {
    tracks: finalTracks,
    albums: finalAlbums,
    artists: finalArtists,
  };
}
