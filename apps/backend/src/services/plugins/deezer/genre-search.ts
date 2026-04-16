/**
 * @file Deezer-specific implementation of the genre-search feature.
 *
 * Kept separate from `adapter.ts` because the genre-search feature has
 * its own response shapes, mapper functions, and fan-out logic that
 * don't belong in the core resolve-oriented adapter. The `adapter.ts`
 * exposes a thin `searchByGenre` delegate that calls into this file.
 *
 * ## Single endpoint, three derived views
 *
 * Only one Deezer endpoint is used:
 *
 *   GET /chart/{genre_id}/tracks   → ranked list of tracks (max 100)
 *
 * The track payload embeds full `artist` and `album` sub-objects (with
 * picture/cover URLs), so we derive the album and artist result lists
 * from the same track pool instead of calling the corresponding
 * `/chart/{id}/albums` and `/chart/{id}/artists` endpoints.
 *
 * ### Why derive instead of hitting the dedicated endpoints
 *
 * Deezer's `/chart/{id}/artists` and `/genre/{id}/artists` are effectively
 * unreliable for non-mainstream genres: querying genre 129 (Jazz) returns
 * "Die drei ???", Bibi Blocksberg, Taylor Swift, Justin Bieber — none of
 * which are jazz artists. The genre-level tagging on Deezer's artist
 * database is poorly maintained. `/chart/{id}/albums` suffers from the
 * same problem and additionally has very few entries for niche genres
 * (Jazz: 2).
 *
 * The tracks chart, by contrast, *is* genre-accurate (Jazz: Stanley
 * Jordan, Grover Washington Jr., …). Every artist and album reachable
 * from a chart-track is, by construction, an artist/album with current
 * genre-relevant output — a stronger thematic guarantee than Deezer's
 * own artist-level tags.
 *
 * ## OR across multiple genres
 *
 * Each requested genre triggers its own `/chart/{id}/tracks` request.
 * The resulting per-genre track lists are:
 *
 *   1. Interleaved round-robin so genre 1 doesn't dominate the top.
 *   2. Deduplicated by track sourceId.
 *   3. Used as the shared pool for *all three* output lists (tracks,
 *      albums, artists). Artists and albums are extracted and deduped
 *      independently from the same pool.
 *
 * ## Sampling
 *
 * `vibe: "hot"`   → `pool.slice(0, N)` (deterministic top-N).
 * `vibe: "mixed"` → stratified sample over the pool (see `sampler.ts`).
 *
 * The pool itself is always fetched at MAX_POOL=100; fetching fewer
 * items costs the same round-trip and makes `mixed` give the same
 * quality of diversity regardless of the requested output count.
 *
 * ## Cache
 *
 * Only the track pool is cached (5 min TTL, keyed on the sorted
 * genre-id set). Album- and artist-pools are derived fresh on every
 * call — the derivation is O(100) and cheaper than a cache lookup.
 */
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { getArtistImages } from "../../artist-images.js";
import { resolveGenreName } from "../../genre-search/genre-map.js";
import { evenSpacedSample, stratifiedSample } from "../../genre-search/sampler.js";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../../types.js";

const API_BASE = "https://api.deezer.com";
/** Deezer's max `limit` per chart call — also our sampling pool size. */
const MAX_POOL = 100;

export interface GenreSearchInput {
  /** User-supplied genre names, already parsed from the query. OR-combined. */
  genres: string[];
  /** Sampling mode. `"hot"` = top-N, `"mixed"` = stratified random sample. */
  vibe: "hot" | "mixed";
  /** Desired count per type. `0` means "don't include this type in the result". */
  tracks: number;
  albums: number;
  artists: number;
}

export interface GenreSearchResult {
  tracks: NormalizedTrack[];
  albums: NormalizedAlbum[];
  artists: NormalizedArtist[];
}

// ─── Deezer chart response shapes (typed for the fields we read) ────────────

interface DeezerChartArtistRef {
  id: number;
  name: string;
  link?: string;
  picture_xl?: string;
  picture_big?: string;
}

interface DeezerChartAlbumRef {
  id: number;
  title: string;
  link?: string;
  cover_xl?: string;
  cover_big?: string;
}

interface DeezerChartTrack {
  id: number;
  title: string;
  duration: number;
  preview?: string;
  link?: string;
  explicit_lyrics?: boolean;
  artist: DeezerChartArtistRef;
  album?: DeezerChartAlbumRef;
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

/**
 * Extract the album reference embedded in a chart-track into a
 * NormalizedAlbum. Fields not present on the embedded reference
 * (upc, releaseDate, tracks, label) stay undefined — this is a
 * genre-discovery row, not a full album resolve.
 */
function extractAlbumFromTrack(track: DeezerChartTrack): NormalizedAlbum | null {
  const a = track.album;
  if (!a) return null;
  return {
    sourceService: "deezer",
    sourceId: String(a.id),
    title: a.title,
    artists: [track.artist.name],
    artworkUrl: a.cover_xl ?? a.cover_big,
    webUrl: a.link ?? `https://www.deezer.com/album/${a.id}`,
  };
}

/**
 * Extract the artist reference embedded in a chart-track into a
 * NormalizedArtist. Deezer's chart-track payload carries full
 * `picture_*` URLs on the nested artist, so we don't need a follow-up
 * `/artist/{id}` call.
 */
function extractArtistFromTrack(track: DeezerChartTrack): NormalizedArtist {
  const a = track.artist;
  return {
    sourceService: "deezer",
    sourceId: String(a.id),
    name: a.name,
    imageUrl: a.picture_xl ?? a.picture_big,
    webUrl: a.link ?? `https://www.deezer.com/artist/${a.id}`,
  };
}

// ─── Chart fetcher (tracks only — see file header) ──────────────────────────

async function fetchTracksForGenre(genreId: number, limit: number): Promise<DeezerChartTrack[]> {
  const data = await deezerFetch(`/chart/${genreId}/tracks?limit=${limit}`);
  return (data as { data?: DeezerChartTrack[] }).data ?? [];
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
// Only the raw track chart is cached. Album and artist pools are derived
// on-demand from the track pool — the derivation is O(100) and any caching
// there would only add invalidation complexity.
//
// Key format: sorted genre IDs joined with "," — stable across call order.

const POOL_TTL_MS = 5 * 60 * 1000;
const POOL_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface PoolCacheEntry<T> {
  pool: T[];
  expiresAt: number;
}

const trackPoolCache = new Map<string, PoolCacheEntry<DeezerChartTrack>>();

function cleanupCache<T>(cache: Map<string, PoolCacheEntry<T>>): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

// Auto-schedule cleanup on module load. `unref` so the timer doesn't hold
// the process open in tests or graceful shutdown.
const cleanupTimer = setInterval(() => {
  cleanupCache(trackPoolCache);
}, POOL_CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

function cacheKey(genreIds: number[]): string {
  return [...genreIds].sort((a, b) => a - b).join(",");
}

/**
 * Load the raw chart-track pool for one or more genre IDs. Returns the
 * cached pool if still fresh; otherwise fetches, interleaves, dedupes,
 * caches, and returns. Kept as raw `DeezerChartTrack[]` so callers can
 * project into tracks / albums / artists without re-requesting.
 */
async function getRawTrackPool(genreIds: number[]): Promise<DeezerChartTrack[]> {
  const key = cacheKey(genreIds);
  const cached = trackPoolCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pool;

  const lists = await Promise.all(genreIds.map((id) => fetchTracksForGenre(id, MAX_POOL)));
  const pool = dedupeBy(interleave(lists), (t) => String(t.id));
  trackPoolCache.set(key, { pool, expiresAt: Date.now() + POOL_TTL_MS });
  return pool;
}

/** Reset the pool cache. Exposed for tests. */
export function _resetGenrePoolsForTests(): void {
  trackPoolCache.clear();
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Run a genre-based discovery query against Deezer's chart API.
 *
 * Loads (or reuses the cached) raw chart-track pool for the requested
 * genres, derives album and artist pools from it, and samples/truncates
 * each requested type to the user-specified count.
 *
 * @throws {UnknownGenreError} when a genre name cannot be resolved.
 * @throws {Error} when the Deezer API returns an HTTP or API-level error.
 */
export async function deezerSearchByGenre(input: GenreSearchInput): Promise<GenreSearchResult> {
  const anythingRequested = input.tracks > 0 || input.albums > 0 || input.artists > 0;
  if (!anythingRequested) return { tracks: [], albums: [], artists: [] };

  const resolved = await Promise.all(input.genres.map(resolveGenreName));
  const ids = resolved.map((r) => r.id);

  const rawPool = await getRawTrackPool(ids);

  // Project the raw pool into the three typed pools. Each projection is
  // independently deduped (an artist with many chart-tracks collapses to
  // one row, same for an album with multiple singles on the chart).
  //
  // Tracks are deduped by primary artist so one artist doesn't fill the
  // column with their back-catalog — four Sinatra songs in a row isn't
  // discovery, it's repetition.
  const tracksPool: NormalizedTrack[] =
    input.tracks > 0 ? dedupeBy(rawPool.map(mapChartTrack), (t) => t.artists[0] || t.sourceId) : [];
  const albumsPool: NormalizedAlbum[] =
    input.albums > 0
      ? dedupeBy(
          rawPool.map(extractAlbumFromTrack).filter((a): a is NormalizedAlbum => a !== null),
          (a) => a.sourceId,
        )
      : [];
  const artistsPool: NormalizedArtist[] =
    input.artists > 0 ? dedupeBy(rawPool.map(extractArtistFromTrack), (a) => a.sourceId) : [];

  // Tracks honour the "hot" intent literally: top-N of the ranked pool.
  //
  // Albums and artists would look identical to the tracks column if we also
  // sliced the top-N there — the top ~10 chart tracks typically collapse to
  // only 3–5 unique artists. So for albums/artists we spread picks across
  // the pool instead.
  //
  // BUT: Deezer's chart quality degrades towards the end of the list. The
  // 100-item chart for niche/broad genres (Rap/Hip Hop, R&B, Pop) reliably
  // carries a handful of off-genre titles in the back third (reggaeton or
  // rock records that Deezer happened to tag as hip-hop, etc.). Spreading
  // across the entire pool at `vibe: hot` meant we were sampling from
  // those positions and surfacing genre-inconsistent rows.
  //
  // For `hot` we now restrict the spread range to the top portion of the
  // pool — enough to give diverse picks but not so deep that we hit the
  // noisy tail. `mixed` deliberately keeps the full pool, because that
  // mode is *about* reaching into the long tail.
  const HOT_SPREAD_FACTOR = 3;
  const HOT_SPREAD_MIN = 30;
  const spreadRange = Math.min(
    Math.max(HOT_SPREAD_MIN, HOT_SPREAD_FACTOR * Math.max(input.albums, input.artists)),
    100,
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

  const finalArtists = finalizeSpread(artistsPool, input.artists);

  // Fill missing artist images via shared cache (Spotify-backed, DB-persistent).
  // Deezer usually provides images inline, but some entries come back without.
  const missingImage = finalArtists.filter((a) => !a.imageUrl);
  if (missingImage.length > 0) {
    const imageMap = await getArtistImages(missingImage.map((a) => a.name));
    for (const artist of missingImage) {
      artist.imageUrl = imageMap.get(artist.name) ?? artist.imageUrl;
    }
  }

  return {
    tracks: finalizeTop(tracksPool, input.tracks),
    albums: finalizeSpread(albumsPool, input.albums),
    artists: finalArtists,
  };
}
