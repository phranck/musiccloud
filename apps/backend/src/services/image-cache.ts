/**
 * @file Permanent image cache for artist photos, track artwork, and album covers.
 *
 * Three DB tables on the shared runtime pool (`db/pool.ts`), one
 * normalisation scheme:
 *
 *   - `artist_images` — keyed by normalised artist name. Filled by Spotify
 *     search (via `getArtistImages`) or opportunistic write-through from
 *     artist-info.ts.
 *   - `track_images`  — keyed by "artist|title" composite. Filled by Last.fm
 *     `track.getInfo` during genre-search.
 *   - `album_images`  — keyed by "artist|title" composite. Filled directly
 *     from Last.fm `tag.getTopAlbums` responses (which include artwork).
 *
 * All caches are permanent (no TTL). Images are small URLs that rarely
 * change.
 */

import { getDatabasePool } from "../db/pool.js";
import { mapWithConcurrency } from "../lib/concurrency.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { TokenManager } from "../lib/infra/token-manager.js";
import { fetchDeezerArtistImage } from "./plugins/deezer/artist-image.js";

// ─── Normalisation ─────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Composite key for track/album: "artist|title" normalised. */
function compositeKey(artist: string, title: string): string {
  return `${norm(artist)}|${norm(title)}`;
}

// ─── Generic DB helpers ────────────────────────────────────────────────────

interface ImageRow {
  lookup_key?: string;
  name_key?: string;
  image_url: string;
}

async function lookupKeys(table: string, keyColumn: string, keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const result = await getDatabasePool().query<ImageRow>(
    `SELECT ${keyColumn}, image_url FROM ${table} WHERE ${keyColumn} IN (${placeholders})`,
    keys,
  );
  const map = new Map<string, string>();
  for (const row of result.rows) {
    const k = (row as unknown as Record<string, string>)[keyColumn];
    map.set(k, row.image_url);
  }
  return map;
}

// ─── Spotify (artist images) ───────────────────────────────────────────────

const spotifyToken = new TokenManager({
  serviceName: "ImageCache/Spotify",
  tokenUrl: "https://accounts.spotify.com/api/token",
  clientIdEnv: "SPOTIFY_CLIENT_ID",
  clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
});

const SPOTIFY_BASE = "https://api.spotify.com/v1";

interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

function pickSpotifyImage(images: SpotifyImage[]): string | null {
  if (!images.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((img) => (img.width ?? 0) >= 100) ?? sorted[0])?.url ?? null;
}

async function spotifyArtistLookup(name: string): Promise<string | null> {
  if (!spotifyToken.isConfigured()) return null;
  try {
    const token = await spotifyToken.getAccessToken();
    const res = await fetchWithTimeout(
      `${SPOTIFY_BASE}/search?q=${encodeURIComponent(name)}&type=artist&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
      5000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { artists: { items: { images: SpotifyImage[] }[] } };
    return pickSpotifyImage(data.artists?.items?.[0]?.images ?? []);
  } catch (err) {
    log.debug(
      "ImageCache",
      `Spotify artist lookup failed for "${name}":`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ─── Last.fm (track artwork) ───────────────────────────────────────────────

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0";

function lastfmKey(): string | undefined {
  return process.env.LASTFM_API_KEY;
}

interface LastfmImage {
  "#text": string;
  size: string;
}

function pickLastfmImage(images: LastfmImage[]): string | null {
  const xl = images.find((i) => i.size === "extralarge");
  const url = xl?.["#text"] || images[images.length - 1]?.["#text"];
  if (!url) return null;
  // Last.fm returns a generic placeholder hash for missing images
  if (url.includes("2a96cbd8b46e442fc41c2b86b821562f")) return null;
  return url;
}

async function lastfmTrackArtwork(artist: string, track: string): Promise<string | null> {
  const key = lastfmKey();
  if (!key) return null;
  try {
    const res = await fetchWithTimeout(
      `${LASTFM_BASE}/?method=track.getInfo&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&api_key=${encodeURIComponent(key)}&format=json`,
      {},
      5000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { track?: { album?: { image?: LastfmImage[] } } };
    return pickLastfmImage(data.track?.album?.image ?? []);
  } catch (err) {
    log.debug(
      "ImageCache",
      `Last.fm track.getInfo failed for "${artist} - ${track}":`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

// ─── Artist images ─────────────────────────────────────────────────────────

/**
 * How many uncached artist images are looked up at once. A genre search can
 * ask for 50 artists, and one after another each waits for Deezer and possibly
 * Spotify. Six at a time cut 20 lookups from about 1.7 s to about 0.5 s
 * without bursting all of them at the upstream.
 */
const ARTIST_IMAGE_LOOKUP_CONCURRENCY = 6;

/**
 * Persist a single artist image (for opportunistic write-through from
 * artist-info.ts). First writer wins.
 */
export async function cacheArtistImage(displayName: string, imageUrl: string, source: string): Promise<void> {
  const key = norm(displayName);
  if (!key) return;
  await getDatabasePool().query(
    `INSERT INTO artist_images (name_key, display_name, image_url, source, fetched_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (name_key) DO NOTHING`,
    [key, displayName, imageUrl, source],
  );
}

/**
 * Resolve artist images for a list of names. DB cache first; misses are
 * looked up on Deezer and then Spotify, {@link ARTIST_IMAGE_LOOKUP_CONCURRENCY}
 * at a time, and written through.
 *
 * @param names - Artist display names; duplicates by normalized name are looked up once.
 * @returns Image URL per display name that has one.
 */
export async function getArtistImages(names: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (names.length === 0) return result;

  const nameByKey = new Map<string, string>();
  for (const name of names) {
    const key = norm(name);
    if (key && !nameByKey.has(key)) nameByKey.set(key, name);
  }
  const allKeys = [...nameByKey.keys()];

  const cached = await lookupKeys("artist_images", "name_key", allKeys);
  const missingKeys: string[] = [];
  for (const key of allKeys) {
    const url = cached.get(key);
    if (url) {
      result.set(nameByKey.get(key)!, url);
    } else {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length === 0) return result;

  // Source priority: Deezer first (more permissive, no token), Spotify fallback.
  // Reverses the pre-Feb-2026 order where Spotify was primary; Spotify now
  // suffers from Dev-Mode quota caps and removed-endpoint risk.
  await mapWithConcurrency(missingKeys, ARTIST_IMAGE_LOOKUP_CONCURRENCY, async (key) => {
    const displayName = nameByKey.get(key)!;
    const resolved = await resolveArtistImage(displayName);
    if (!resolved) return;
    result.set(displayName, resolved.url);
    try {
      await cacheArtistImage(displayName, resolved.url, resolved.source);
    } catch (err) {
      log.debug(
        "ImageCache",
        `artist write-through failed for "${displayName}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  return result;
}

async function resolveArtistImage(displayName: string): Promise<{ url: string; source: "deezer" | "spotify" } | null> {
  const deezerUrl = await fetchDeezerArtistImage(displayName);
  if (deezerUrl) return { url: deezerUrl, source: "deezer" };

  const spotifyUrl = await spotifyArtistLookup(displayName);
  if (spotifyUrl) return { url: spotifyUrl, source: "spotify" };

  return null;
}

// ─── Track images ──────────────────────────────────────────────────────────

/**
 * Persist a single track image. First writer wins.
 */
export async function cacheTrackImage(artist: string, title: string, imageUrl: string, source: string): Promise<void> {
  const key = compositeKey(artist, title);
  if (!key || key === "|") return;
  await getDatabasePool().query(
    `INSERT INTO track_images (lookup_key, artist_name, track_title, image_url, source, fetched_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (lookup_key) DO NOTHING`,
    [key, artist, title, imageUrl, source],
  );
}

/**
 * Resolve track artwork for a list of {artist, title} pairs.
 * DB cache first, Last.fm track.getInfo fallback (parallel) for misses.
 *
 * Returns a `Map<"artist|title" normalised key, imageUrl>`.
 * Call `trackImageKey(artist, title)` to look up in the returned map.
 */
export async function getTrackImages(tracks: { artist: string; title: string }[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (tracks.length === 0) return result;

  // Dedupe
  const infoByKey = new Map<string, { artist: string; title: string }>();
  for (const t of tracks) {
    const key = compositeKey(t.artist, t.title);
    if (key && key !== "|" && !infoByKey.has(key)) infoByKey.set(key, t);
  }
  const allKeys = [...infoByKey.keys()];

  const cached = await lookupKeys("track_images", "lookup_key", allKeys);
  const missingKeys: string[] = [];
  for (const key of allKeys) {
    const url = cached.get(key);
    if (url) {
      result.set(key, url);
    } else {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length === 0) return result;

  // Parallel Last.fm lookups for misses
  const lookups = missingKeys.map(async (key) => {
    const info = infoByKey.get(key)!;
    const url = await lastfmTrackArtwork(info.artist, info.title);
    if (url) {
      result.set(key, url);
      try {
        await cacheTrackImage(info.artist, info.title, url, "lastfm");
      } catch (err) {
        log.debug(
          "ImageCache",
          `track write-through failed for "${key}":`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  });
  await Promise.all(lookups);

  return result;
}

/** Build the normalised lookup key for a track (same scheme used internally). */
export function trackImageKey(artist: string, title: string): string {
  return compositeKey(artist, title);
}

// ─── Album images ──────────────────────────────────────────────────────────

/**
 * Persist a single album image. First writer wins.
 */
export async function cacheAlbumImage(artist: string, title: string, imageUrl: string, source: string): Promise<void> {
  const key = compositeKey(artist, title);
  if (!key || key === "|") return;
  await getDatabasePool().query(
    `INSERT INTO album_images (lookup_key, artist_name, album_title, image_url, source, fetched_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (lookup_key) DO NOTHING`,
    [key, artist, title, imageUrl, source],
  );
}

/**
 * Resolve album artwork for a list of {artist, title} pairs.
 * DB cache only -- no external fallback. Albums from Last.fm come with
 * artwork already; this function is for cache reads on repeat queries.
 *
 * Returns a `Map<"artist|title" normalised key, imageUrl>`.
 */
export async function getAlbumImages(albums: { artist: string; title: string }[]): Promise<Map<string, string>> {
  if (albums.length === 0) return new Map();

  const infoByKey = new Map<string, { artist: string; title: string }>();
  for (const a of albums) {
    const key = compositeKey(a.artist, a.title);
    if (key && key !== "|" && !infoByKey.has(key)) infoByKey.set(key, a);
  }

  return lookupKeys("album_images", "lookup_key", [...infoByKey.keys()]);
}

/** Build the normalised lookup key for an album. */
export function albumImageKey(artist: string, title: string): string {
  return compositeKey(artist, title);
}
