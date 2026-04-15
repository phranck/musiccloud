/**
 * @file Deezer-specific implementation of the genre-search feature.
 *
 * Kept separate from `adapter.ts` because the genre-search feature has
 * its own set of response shapes, mapper functions, and fan-out logic
 * that don't belong in the core resolve-oriented adapter. The `adapter.ts`
 * exposes a thin `searchByGenre` delegate that calls into this file.
 *
 * ## API endpoints used
 *
 * Deezer's chart API returns the most popular entries of a given genre:
 *
 *   GET /chart/{genre_id}/tracks   → ranked list of tracks
 *   GET /chart/{genre_id}/albums   → ranked list of albums
 *   GET /chart/{genre_id}/artists  → ranked list of artists
 *
 * Each accepts `?limit=N` (max 100). For `vibe: "hot"` we request exactly
 * the count the user asked for. For `vibe: "mixed"` we over-fetch to 100
 * and then sample stratifiedly so the result mixes well-known and
 * lesser-known entries.
 *
 * ## OR across multiple genres
 *
 * Each requested genre triggers its own chart request per type. The
 * resulting per-genre lists are then:
 *
 *   1. Interleaved so the first positions rotate through the genres
 *      (avoids genre-1 dominating the top of the output).
 *   2. Deduplicated by `sourceId` (an artist present in several genres
 *      should only show up once).
 *   3. Sampled/truncated to the user-requested count.
 *
 * ## Why our own mappers
 *
 * The chart-endpoint responses are a *subset* of the `/track/{id}` and
 * `/album/{id}` response bodies: no `isrc`, no `release_date`, no `upc`,
 * no full track listing. Reusing `mapTrack` / `mapAlbum` from `adapter.ts`
 * would silently set those fields to `undefined` which is technically
 * fine, but it would also mean changes to those mappers (e.g. requiring
 * a new field) would unexpectedly break chart responses. A separate pair
 * of small mappers keeps that coupling away.
 */
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { resolveGenreName } from "../../genre-search/genre-map.js";
import { stratifiedSample } from "../../genre-search/sampler.js";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../../types.js";

const API_BASE = "https://api.deezer.com";
/** Deezer's max `limit` per chart call — sampling pool size for `mixed`. */
const MAX_POOL = 100;

export interface GenreSearchInput {
  /** User-supplied genre names, already parsed from the query. OR-combined. */
  genres: string[];
  /** Sampling mode. `"hot"` = top-N, `"mixed"` = stratified random sample. */
  vibe: "hot" | "mixed";
  /** Desired count per type. `0` means "don't fetch this type". */
  tracks: number;
  albums: number;
  artists: number;
}

export interface GenreSearchResult {
  tracks: NormalizedTrack[];
  albums: NormalizedAlbum[];
  artists: NormalizedArtist[];
}

// ─── Deezer chart response shapes (we only type the fields we read) ─────────

interface DeezerChartTrack {
  id: number;
  title: string;
  duration: number;
  preview?: string;
  link?: string;
  explicit_lyrics?: boolean;
  artist: { id: number; name: string };
  album?: { id: number; title: string; cover_xl?: string; cover_big?: string };
}

interface DeezerChartAlbum {
  id: number;
  title: string;
  link?: string;
  cover_xl?: string;
  cover_big?: string;
  artist: { id: number; name: string };
}

interface DeezerChartArtist {
  id: number;
  name: string;
  link?: string;
  picture_xl?: string;
  picture_big?: string;
}

interface DeezerErrorResponse {
  error: { type: string; message: string; code: number };
}

function isDeezerError(data: unknown): data is DeezerErrorResponse {
  return typeof data === "object" && data !== null && "error" in data;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function deezerFetch(endpoint: string): Promise<unknown> {
  const res = await fetchWithTimeout(`${API_BASE}${endpoint}`, {}, 5000);
  if (!res.ok) {
    throw new Error(`Deezer ${endpoint} returned HTTP ${res.status}`);
  }
  const data = await res.json();
  if (isDeezerError(data)) {
    throw new Error(`Deezer ${endpoint} error: ${data.error.message}`);
  }
  return data;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapChartTrack(raw: DeezerChartTrack): NormalizedTrack {
  return {
    sourceService: "deezer",
    sourceId: String(raw.id),
    title: raw.title,
    artists: [raw.artist.name],
    albumName: raw.album?.title,
    durationMs: raw.duration * 1000,
    isExplicit: raw.explicit_lyrics ?? false,
    artworkUrl: raw.album?.cover_xl ?? raw.album?.cover_big,
    previewUrl: raw.preview ?? undefined,
    webUrl: raw.link ?? `https://www.deezer.com/track/${raw.id}`,
  };
}

function mapChartAlbum(raw: DeezerChartAlbum): NormalizedAlbum {
  return {
    sourceService: "deezer",
    sourceId: String(raw.id),
    title: raw.title,
    artists: [raw.artist.name],
    artworkUrl: raw.cover_xl ?? raw.cover_big,
    webUrl: raw.link ?? `https://www.deezer.com/album/${raw.id}`,
  };
}

function mapChartArtist(raw: DeezerChartArtist): NormalizedArtist {
  return {
    sourceService: "deezer",
    sourceId: String(raw.id),
    name: raw.name,
    imageUrl: raw.picture_xl ?? raw.picture_big,
    webUrl: raw.link ?? `https://www.deezer.com/artist/${raw.id}`,
  };
}

// ─── Chart fetchers (one per type) ──────────────────────────────────────────

async function fetchTracksForGenre(genreId: number, limit: number): Promise<NormalizedTrack[]> {
  const data = await deezerFetch(`/chart/${genreId}/tracks?limit=${limit}`);
  const items = (data as { data?: DeezerChartTrack[] }).data ?? [];
  return items.map(mapChartTrack);
}

async function fetchAlbumsForGenre(genreId: number, limit: number): Promise<NormalizedAlbum[]> {
  const data = await deezerFetch(`/chart/${genreId}/albums?limit=${limit}`);
  const items = (data as { data?: DeezerChartAlbum[] }).data ?? [];
  return items.map(mapChartAlbum);
}

async function fetchArtistsForGenre(genreId: number, limit: number): Promise<NormalizedArtist[]> {
  const data = await deezerFetch(`/chart/${genreId}/artists?limit=${limit}`);
  const items = (data as { data?: DeezerChartArtist[] }).data ?? [];
  return items.map(mapChartArtist);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Round-robin merge of N lists. For two lists [a1,a2,a3] and [b1,b2,b3]
 * produces [a1,b1,a2,b2,a3,b3]. Avoids the first genre dominating the
 * top of the union.
 */
function interleave<T>(lists: T[][]): T[] {
  if (lists.length === 0) return [];
  const out: T[] = [];
  const maxLen = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

// ─── Pool cache (TTL) ────────────────────────────────────────────────────────
//
// We always fetch the full MAX_POOL-sized chart list regardless of the user's
// requested count, and cache it per (genre-id set, type) for 5 minutes. Why:
//
//   - Fetching 100 items costs the same as fetching 10 — Deezer's chart
//     response is a single page.
//   - `vibe: "mixed"` samples from the pool non-deterministically. Without
//     caching, every repeat request would re-fetch; with caching, we reuse
//     the same 100-item pool and draw a fresh sample client-side (Option A
//     from the plan).
//   - `vibe: "hot"` just truncates the pool to the top-N — same cost.
//
// Key format: `${type}:${sortedGenreIds.join(",")}`. Stable across request
// orderings.

const POOL_TTL_MS = 5 * 60 * 1000;
const POOL_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface PoolCacheEntry<T> {
  pool: T[];
  expiresAt: number;
}

const trackPoolCache = new Map<string, PoolCacheEntry<NormalizedTrack>>();
const albumPoolCache = new Map<string, PoolCacheEntry<NormalizedAlbum>>();
const artistPoolCache = new Map<string, PoolCacheEntry<NormalizedArtist>>();

/**
 * Drop expired entries from a cache map. Project rule requires us to schedule
 * this — otherwise the map grows unbounded under traffic.
 */
function cleanupCache<T>(cache: Map<string, PoolCacheEntry<T>>): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

// Auto-schedule cleanup on module load. `unref` so the timer doesn't hold
// the process open in tests / graceful shutdown.
const cleanupTimer = setInterval(() => {
  cleanupCache(trackPoolCache);
  cleanupCache(albumPoolCache);
  cleanupCache(artistPoolCache);
}, POOL_CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

function cacheKey(genreIds: number[]): string {
  return [...genreIds].sort((a, b) => a - b).join(",");
}

async function getTrackPool(genreIds: number[]): Promise<NormalizedTrack[]> {
  const key = cacheKey(genreIds);
  const cached = trackPoolCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pool;

  const lists = await Promise.all(genreIds.map((id) => fetchTracksForGenre(id, MAX_POOL)));
  const pool = dedupeBy(interleave(lists), (t) => t.sourceId);
  trackPoolCache.set(key, { pool, expiresAt: Date.now() + POOL_TTL_MS });
  return pool;
}

async function getAlbumPool(genreIds: number[]): Promise<NormalizedAlbum[]> {
  const key = cacheKey(genreIds);
  const cached = albumPoolCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pool;

  const lists = await Promise.all(genreIds.map((id) => fetchAlbumsForGenre(id, MAX_POOL)));
  const pool = dedupeBy(interleave(lists), (a) => a.sourceId);
  albumPoolCache.set(key, { pool, expiresAt: Date.now() + POOL_TTL_MS });
  return pool;
}

async function getArtistPool(genreIds: number[]): Promise<NormalizedArtist[]> {
  const key = cacheKey(genreIds);
  const cached = artistPoolCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pool;

  const lists = await Promise.all(genreIds.map((id) => fetchArtistsForGenre(id, MAX_POOL)));
  const pool = dedupeBy(interleave(lists), (a) => a.sourceId);
  artistPoolCache.set(key, { pool, expiresAt: Date.now() + POOL_TTL_MS });
  return pool;
}

/** Reset all pool caches. Exposed for tests. */
export function _resetGenrePoolsForTests(): void {
  trackPoolCache.clear();
  albumPoolCache.clear();
  artistPoolCache.clear();
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Run a genre-based discovery query against Deezer's chart API.
 * Resolves genre names → IDs, loads cached or fresh chart pools, then
 * samples/truncates to the requested counts.
 *
 * @throws {UnknownGenreError} when a genre name cannot be resolved.
 * @throws {Error} when the Deezer API returns an HTTP or API-level error.
 */
export async function deezerSearchByGenre(input: GenreSearchInput): Promise<GenreSearchResult> {
  const resolved = await Promise.all(input.genres.map(resolveGenreName));
  const ids = resolved.map((r) => r.id);

  const [tracksPool, albumsPool, artistsPool] = await Promise.all([
    input.tracks > 0 ? getTrackPool(ids) : Promise.resolve([] as NormalizedTrack[]),
    input.albums > 0 ? getAlbumPool(ids) : Promise.resolve([] as NormalizedAlbum[]),
    input.artists > 0 ? getArtistPool(ids) : Promise.resolve([] as NormalizedArtist[]),
  ]);

  const finalize = <T>(pool: T[], target: number): T[] => {
    if (target === 0) return [];
    return input.vibe === "mixed" ? stratifiedSample(pool, target) : pool.slice(0, target);
  };

  return {
    tracks: finalize(tracksPool, input.tracks),
    albums: finalize(albumsPool, input.albums),
    artists: finalize(artistsPool, input.artists),
  };
}
