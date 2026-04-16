/**
 * @file Apple Music implementation of the genre-search feature.
 *
 * Alternative to the Deezer genre-search used when the Apple Music
 * adapter is available (credentials present) — the registry ordering
 * in `plugins/registry.ts` puts Apple Music ahead of Deezer, so the
 * orchestrator picks Apple first whenever it's usable and silently
 * falls back to Deezer otherwise.
 *
 * ## API endpoints
 *
 *   GET /catalog/{storefront}/genres
 *     Full genre list for the storefront. Cached for 24h. Used to
 *     resolve user-supplied genre names to Apple's numeric genre IDs.
 *
 *   GET /catalog/{storefront}/charts?types=songs,albums&genre={id}&limit=50&with=chart-items
 *     Top chart songs + albums filtered by genre. Apple's charts API
 *     does NOT support `types=artists`, so artists are derived from
 *     the songs chart (every song carries an `artistName` plus an
 *     artist id in its `relationships.artists`).
 *
 * ## Storefront
 *
 * Apple Music catalogs are regional; a storefront has to be chosen.
 * Default is "us" (largest catalog), overridable via
 * `APPLE_MUSIC_STOREFRONT`. The user can't influence this — genre
 * discovery happens against one storefront at a time.
 *
 * ## Why derive artists from songs
 *
 * Apple's charts endpoint accepts `types=songs,albums,playlists,music-videos`
 * but no `artists` type. Fetching per-genre artist lists via search
 * (`/search?term=jazz&types=artists`) would return string-matching
 * hits ("Jazz & Coffee", "Jazzy Shaundelier") rather than actually
 * genre-tagged artists — same problem we hit on Deezer. So: chart
 * songs → unique `artistName` + artist IDs, dedupe.
 *
 * Artist images are resolved by the shared artist-images helper
 * (`services/artist-images.ts`) after sampling. That helper does a
 * Spotify search per unique artist name and persists the result in the
 * `artist_images` Postgres table (permanent cache, no TTL).
 */

import { log } from "../../../lib/infra/logger.js";
import { getArtistImages } from "../../artist-images.js";
import { extractPrimaryArtist } from "../../artist-utils.js";
import { evenSpacedSample, stratifiedSample } from "../../genre-search/sampler.js";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../../types.js";
import { appleMusicFetch } from "./adapter.js";

const DEFAULT_STOREFRONT = "us";
const MAX_POOL_LIMIT = 50; // Apple's charts API caps `limit` at 50 per type.
const POOL_TTL_MS = 5 * 60 * 1000;
const POOL_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const GENRE_LIST_TTL_MS = 24 * 60 * 60 * 1000;

function storefront(): string {
  return (process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT).toLowerCase();
}

// ─── Input / output ─────────────────────────────────────────────────────────

export interface GenreSearchInput {
  genres: string[];
  vibe: "hot" | "mixed";
  tracks: number;
  albums: number;
  artists: number;
}

export interface GenreSearchResult {
  tracks: NormalizedTrack[];
  albums: NormalizedAlbum[];
  artists: NormalizedArtist[];
}

// ─── Apple response shapes (only fields we read) ────────────────────────────

interface AppleGenreAttributes {
  name: string;
  parentId?: string;
  parentName?: string;
}

interface AppleGenre {
  id: string;
  type: "genres";
  attributes: AppleGenreAttributes;
}

interface AppleGenresResponse {
  data?: AppleGenre[];
}

interface AppleArtwork {
  url?: string;
  width?: number;
  height?: number;
}

interface AppleSongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
  durationInMillis?: number;
  artwork?: AppleArtwork;
  url?: string;
  isrc?: string;
  releaseDate?: string;
  contentRating?: "explicit" | "clean";
  previews?: { url?: string }[];
}

interface AppleSongRelationships {
  artists?: {
    data?: { id: string; type: "artists" }[];
  };
  albums?: {
    data?: { id: string; type: "albums" }[];
  };
}

interface AppleSong {
  id: string;
  type: "songs";
  attributes: AppleSongAttributes;
  relationships?: AppleSongRelationships;
}

interface AppleAlbumAttributes {
  name: string;
  artistName: string;
  artwork?: AppleArtwork;
  url?: string;
  releaseDate?: string;
  upc?: string;
  contentRating?: "explicit" | "clean";
}

interface AppleAlbum {
  id: string;
  type: "albums";
  attributes: AppleAlbumAttributes;
}

interface AppleChartBucket<T> {
  chart: string;
  name: string;
  orderId?: string;
  data: T[];
}

interface AppleChartsResponse {
  results?: {
    songs?: AppleChartBucket<AppleSong>[];
    albums?: AppleChartBucket<AppleAlbum>[];
  };
}

// ─── Artwork helper ─────────────────────────────────────────────────────────

/**
 * Apple artwork URLs come with `{w}x{h}` placeholders. Expand them at a
 * retina-friendly size. Returns undefined when there's no URL at all.
 */
function formatArtwork(art: AppleArtwork | undefined, size = 1000): string | undefined {
  if (!art?.url) return undefined;
  return art.url.replace("{w}", String(size)).replace("{h}", String(size));
}

// ─── Mappers ────────────────────────────────────────────────────────────────

function mapSong(raw: AppleSong): NormalizedTrack {
  const a = raw.attributes;
  return {
    sourceService: "apple-music",
    sourceId: raw.id,
    title: a.name,
    artists: [a.artistName],
    albumName: a.albumName,
    durationMs: a.durationInMillis,
    isExplicit: a.contentRating === "explicit",
    artworkUrl: formatArtwork(a.artwork),
    previewUrl: a.previews?.[0]?.url,
    releaseDate: a.releaseDate,
    isrc: a.isrc,
    webUrl: a.url ?? `https://music.apple.com/${storefront()}/song/${raw.id}`,
  };
}

function mapAlbum(raw: AppleAlbum): NormalizedAlbum {
  const a = raw.attributes;
  return {
    sourceService: "apple-music",
    sourceId: raw.id,
    title: a.name,
    artists: [a.artistName],
    artworkUrl: formatArtwork(a.artwork),
    releaseDate: a.releaseDate,
    upc: a.upc,
    webUrl: a.url ?? `https://music.apple.com/${storefront()}/album/${raw.id}`,
  };
}

function extractArtistFromSong(song: AppleSong): NormalizedArtist | null {
  const artistId = song.relationships?.artists?.data?.[0]?.id;
  if (!artistId) return null;
  return {
    sourceService: "apple-music",
    sourceId: artistId,
    name: song.attributes.artistName,
    // imageUrl is filled in post-extraction by the shared artist-images
    // helper (Spotify-backed, DB-cached). See `appleSearchByGenre`.
    imageUrl: undefined,
    webUrl: `https://music.apple.com/${storefront()}/artist/${artistId}`,
  };
}

// ─── Genre list cache + resolver ────────────────────────────────────────────

let genreCache: { genres: AppleGenre[]; expiresAt: number } | null = null;
let genreCacheInflight: Promise<AppleGenre[]> | null = null;

async function loadGenres(): Promise<AppleGenre[]> {
  if (genreCache && genreCache.expiresAt > Date.now()) return genreCache.genres;
  if (genreCacheInflight) return genreCacheInflight;
  genreCacheInflight = (async () => {
    // 1. Top-level genres
    const res = await appleMusicFetch(`/catalog/${storefront()}/genres?limit=200`);
    if (!res.ok) throw new Error(`Apple /genres returned HTTP ${res.status}`);
    const body = (await res.json()) as AppleGenresResponse;
    const topLevel = body.data ?? [];

    // 2. Subgenres for each top-level genre (parallel)
    // Apple's charts endpoint accepts subgenre IDs, so "Trance" (under
    // "Electronic") resolves to its own chart — much better results than
    // falling back to the parent genre.
    const subgenreLists = await Promise.all(
      topLevel.map(async (g) => {
        try {
          const subRes = await appleMusicFetch(`/catalog/${storefront()}/genres/${g.id}/subgenres?limit=200`);
          if (!subRes.ok) return [];
          const subBody = (await subRes.json()) as AppleGenresResponse;
          return subBody.data ?? [];
        } catch {
          return [];
        }
      }),
    );

    // 3. Merge into a flat deduplicated list (top-level first, then subgenres)
    const seen = new Set<string>();
    const all: AppleGenre[] = [];
    for (const g of [...topLevel, ...subgenreLists.flat()]) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        all.push(g);
      }
    }

    log.debug("AppleGenreSearch", `Loaded ${topLevel.length} top-level + ${all.length - topLevel.length} sub-genres`);
    genreCache = { genres: all, expiresAt: Date.now() + GENRE_LIST_TTL_MS };
    return all;
  })().finally(() => {
    genreCacheInflight = null;
  });
  return genreCacheInflight;
}

export class UnknownAppleGenreError extends Error {
  public readonly input: string;
  public readonly supportedGenres: string[];
  constructor(input: string, supportedGenres: string[]) {
    super(`Unknown genre: '${input}'. Supported: ${supportedGenres.join(", ")}`);
    this.name = "UnknownAppleGenreError";
    this.input = input;
    this.supportedGenres = supportedGenres;
  }
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[-/]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function resolveAppleGenreName(input: string): Promise<{ id: string; name: string }> {
  const genres = await loadGenres();
  const needle = normalizeName(input);
  if (!needle)
    throw new UnknownAppleGenreError(
      input,
      genres.map((g) => g.attributes.name),
    );

  // Exact match on normalized name.
  for (const g of genres) {
    if (normalizeName(g.attributes.name) === needle) return { id: g.id, name: g.attributes.name };
  }
  // Substring: Apple's catalog name contains the needle.
  for (const g of genres) {
    if (normalizeName(g.attributes.name).includes(needle)) return { id: g.id, name: g.attributes.name };
  }
  throw new UnknownAppleGenreError(
    input,
    genres.map((g) => g.attributes.name),
  );
}

// ─── Chart pool cache ───────────────────────────────────────────────────────
//
// We cache the raw chart payload (songs[] + albums[]) per sorted genre-id set.
// The artist list is derived from the songs[] on every call — cheap enough
// that caching it separately adds no value.

interface ChartPool {
  songs: AppleSong[];
  albums: AppleAlbum[];
}

interface PoolCacheEntry {
  pool: ChartPool;
  expiresAt: number;
}

const poolCache = new Map<string, PoolCacheEntry>();

function cleanupPoolCache(): void {
  const now = Date.now();
  for (const [k, e] of poolCache) {
    if (e.expiresAt <= now) poolCache.delete(k);
  }
}

const poolCleanupTimer = setInterval(cleanupPoolCache, POOL_CLEANUP_INTERVAL_MS);
poolCleanupTimer.unref?.();

function poolKey(genreIds: string[]): string {
  return [...genreIds].sort().join(",");
}

export function _resetAppleGenrePoolsForTests(): void {
  poolCache.clear();
  genreCache = null;
  genreCacheInflight = null;
}

/**
 * Round-robin merge of N arrays. Avoids the first genre dominating the
 * top of the union when multiple genres are OR'd.
 */
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

async function fetchChartForGenre(genreId: string): Promise<ChartPool> {
  const params = new URLSearchParams({
    types: "songs,albums",
    genre: genreId,
    limit: String(MAX_POOL_LIMIT),
  });
  const res = await appleMusicFetch(`/catalog/${storefront()}/charts?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Apple /charts returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as AppleChartsResponse;
  const songs = body.results?.songs?.[0]?.data ?? [];
  const albums = body.results?.albums?.[0]?.data ?? [];

  // Apple's /charts endpoint does not honour `include=artists` on the bucket
  // response, so the songs come back without `relationships`. Artist IDs
  // (needed for the Artists column) live in the single-resource endpoint:
  // a follow-up `GET /songs?ids=<list>&include=artists` returns the same
  // songs enriched with their artist relationships. That's one extra HTTP
  // round-trip per uncached genre — tolerable, and the pool cache makes
  // repeat queries free.
  //
  // Artist images are resolved post-sampling by the shared artist-images
  // helper (Spotify-backed, DB-cached) in `appleSearchByGenre`.
  const enrichedSongs = songs.length > 0 ? await enrichSongsWithArtists(songs) : songs;
  return { songs: enrichedSongs, albums };
}

async function enrichSongsWithArtists(songs: AppleSong[]): Promise<AppleSong[]> {
  const ids = songs.map((s) => s.id).join(",");
  const res = await appleMusicFetch(`/catalog/${storefront()}/songs?ids=${encodeURIComponent(ids)}&include=artists`);
  if (!res.ok) {
    log.debug("AppleGenreSearch", `enrich /songs returned HTTP ${res.status}`);
    // Graceful degradation: leave the songs as-is, artists column will be
    // empty but tracks + albums still render correctly.
    return songs;
  }
  const body = (await res.json()) as { data?: AppleSong[] };
  const byId = new Map<string, AppleSong>();
  for (const s of body.data ?? []) byId.set(s.id, s);
  // Preserve the original ranking order — the enriched list from
  // `/songs?ids=...` is not guaranteed to come back in the order we asked.
  return songs.map((s) => byId.get(s.id) ?? s);
}

async function getChartPool(genreIds: string[]): Promise<ChartPool> {
  const key = poolKey(genreIds);
  const cached = poolCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pool;

  const perGenre = await Promise.all(genreIds.map(fetchChartForGenre));
  const mergedSongs = dedupeBy(interleave(perGenre.map((p) => p.songs)), (s) => s.id);
  const mergedAlbums = dedupeBy(interleave(perGenre.map((p) => p.albums)), (a) => a.id);
  const pool: ChartPool = { songs: mergedSongs, albums: mergedAlbums };
  poolCache.set(key, { pool, expiresAt: Date.now() + POOL_TTL_MS });
  return pool;
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Run a genre-search query against Apple Music's charts API.
 * Mirrors the Deezer implementation's shape and sampling semantics so
 * the orchestrator can swap adapters transparently.
 */
export async function appleSearchByGenre(input: GenreSearchInput): Promise<GenreSearchResult> {
  if (input.tracks === 0 && input.albums === 0 && input.artists === 0) {
    return { tracks: [], albums: [], artists: [] };
  }

  const resolved = await Promise.all(input.genres.map(resolveAppleGenreName));
  const ids = resolved.map((r) => r.id);

  const pool = await getChartPool(ids);

  // Dedupe tracks by their primary artist so the column shows ten *different*
  // names rather than the same artist's back-catalog (Frank Sinatra × 4 is
  // not discovery, it's repetition).
  const tracksPool: NormalizedTrack[] =
    input.tracks > 0 ? dedupeBy(pool.songs.map(mapSong), (t) => extractPrimaryArtist(t.artists[0] || t.sourceId)) : [];
  const albumsPool: NormalizedAlbum[] = input.albums > 0 ? pool.albums.map(mapAlbum) : [];
  const artistsPool: NormalizedArtist[] =
    input.artists > 0
      ? dedupeBy(
          pool.songs.map((s) => extractArtistFromSong(s)).filter((a): a is NormalizedArtist => a !== null),
          (a) => a.sourceId,
        )
      : [];

  // Same hot-spread clamp as the Deezer implementation: only spread over the
  // top slice of the pool to dodge the noisy tail Apple's charts sometimes
  // carry in broader genres. `mixed` intentionally sees the whole pool.
  const HOT_SPREAD_FACTOR = 3;
  const HOT_SPREAD_MIN = 30;
  const spreadRange = Math.min(
    Math.max(HOT_SPREAD_MIN, HOT_SPREAD_FACTOR * Math.max(input.albums, input.artists)),
    MAX_POOL_LIMIT,
  );

  const finalizeTop = <T>(p: T[], target: number): T[] => {
    if (target === 0) return [];
    return input.vibe === "mixed" ? stratifiedSample(p, target) : p.slice(0, target);
  };
  const finalizeSpread = <T>(p: T[], target: number): T[] => {
    if (target === 0) return [];
    if (input.vibe === "mixed") return stratifiedSample(p, target);
    return evenSpacedSample(p.slice(0, spreadRange), target);
  };

  const finalArtists = finalizeSpread(artistsPool, input.artists);

  // Resolve artist images via shared cache (Spotify-backed, DB-persistent).
  // Runs after sampling so we only look up the ~10 artists we actually return.
  if (finalArtists.length > 0) {
    const imageMap = await getArtistImages(finalArtists.map((a) => a.name));
    for (const artist of finalArtists) {
      artist.imageUrl = imageMap.get(artist.name) ?? artist.imageUrl;
    }
  }

  return {
    tracks: finalizeTop(tracksPool, input.tracks),
    albums: finalizeSpread(albumsPool, input.albums),
    artists: finalArtists,
  };
}
