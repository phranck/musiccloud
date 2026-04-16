/**
 * @file Shared artist-image cache backed by Postgres + Spotify.
 *
 * Provides `getArtistImages(names)` which returns a `Map<name, imageUrl>`.
 * Lookup order:
 *
 *   1. DB cache (`artist_images` table) — permanent, no TTL.
 *   2. Spotify `/search?type=artist` — picks the smallest image ≥ 100 px.
 *   3. Write-through: successful Spotify results are persisted immediately.
 *
 * Used by:
 *   - Apple Music genre-search (post-sampling)
 *   - Deezer genre-search (post-sampling, for services without inline images)
 *   - artist-info.ts (opportunistic write-through when Spotify profile is fetched)
 *
 * The DB pool is tiny (max 2) and lazily created, same pattern as
 * `db/plugin-repository.ts`.
 */

import * as pgModule from "pg";
import { loadDatabaseConfig } from "../db/config.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { TokenManager } from "../lib/infra/token-manager.js";

const Pool = (pgModule as unknown as { default: typeof pgModule }).default?.Pool ?? pgModule.Pool;

let pool: InstanceType<typeof Pool> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!pool) {
    const config = loadDatabaseConfig();
    pool = new Pool({ connectionString: config.url, max: 2 });
  }
  return pool;
}

// ─── Name normalisation ─────────────────────────────────────────────────────
//
// The `name_key` column is the lookup key. Normalise to lowercase + collapsed
// whitespace so "Frank Sinatra" and "frank sinatra" share a cache row.

function toNameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

// ─── Spotify token (shared config, own instance) ────────────────────────────

const spotifyToken = new TokenManager({
  serviceName: "ArtistImages/Spotify",
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

interface SpotifyArtistHit {
  id: string;
  name: string;
  images: SpotifyImage[];
}

interface SpotifyArtistSearch {
  artists: { items: SpotifyArtistHit[] };
}

function pickImage(images: SpotifyImage[]): string | null {
  if (!images.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((img) => (img.width ?? 0) >= 100) ?? sorted[0])?.url ?? null;
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

interface ArtistImageRow {
  name_key: string;
  image_url: string;
}

async function lookupCached(nameKeys: string[]): Promise<Map<string, string>> {
  if (nameKeys.length === 0) return new Map();
  // Build parameterised IN clause: $1, $2, …
  const placeholders = nameKeys.map((_, i) => `$${i + 1}`).join(", ");
  const result = await getPool().query<ArtistImageRow>(
    `SELECT name_key, image_url FROM artist_images WHERE name_key IN (${placeholders})`,
    nameKeys,
  );
  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(row.name_key, row.image_url);
  }
  return map;
}

/**
 * Persist a single artist image. Uses `ON CONFLICT DO NOTHING` so the
 * first writer wins — subsequent calls for the same name_key are no-ops.
 */
export async function cacheArtistImage(displayName: string, imageUrl: string, source: string): Promise<void> {
  const key = toNameKey(displayName);
  if (!key) return;
  await getPool().query(
    `INSERT INTO artist_images (name_key, display_name, image_url, source, fetched_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (name_key) DO NOTHING`,
    [key, displayName, imageUrl, source],
  );
}

// ─── Spotify lookup ─────────────────────────────────────────────────────────

async function spotifyLookup(name: string): Promise<string | null> {
  if (!spotifyToken.isConfigured()) return null;
  try {
    const token = await spotifyToken.getAccessToken();
    const res = await fetchWithTimeout(
      `${SPOTIFY_BASE}/search?q=${encodeURIComponent(name)}&type=artist&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
      5000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as SpotifyArtistSearch;
    const artist = data.artists?.items?.[0];
    if (!artist) return null;
    return pickImage(artist.images);
  } catch (err) {
    log.debug("ArtistImages", `Spotify lookup failed for "${name}":`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve artist images for a list of names.
 *
 * Returns a `Map<artistName, imageUrl>` — only names with a resolved
 * image are present in the map. DB cache is checked first; misses are
 * filled via Spotify search and persisted.
 *
 * Spotify lookups run sequentially to stay well within rate limits
 * (genre-search typically has ≤ 10 unique artist names).
 */
export async function getArtistImages(names: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (names.length === 0) return result;

  // Dedupe + build key-to-name mapping
  const nameByKey = new Map<string, string>();
  for (const name of names) {
    const key = toNameKey(name);
    if (key && !nameByKey.has(key)) nameByKey.set(key, name);
  }
  const allKeys = [...nameByKey.keys()];

  // 1. DB cache hit
  const cached = await lookupCached(allKeys);
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

  // 2. Spotify lookup for misses (sequential to respect rate limits)
  for (const key of missingKeys) {
    const displayName = nameByKey.get(key)!;
    const url = await spotifyLookup(displayName);
    if (url) {
      result.set(displayName, url);
      // Write-through: persist for future calls
      try {
        await cacheArtistImage(displayName, url, "spotify");
      } catch (err) {
        log.debug(
          "ArtistImages",
          `DB write-through failed for "${displayName}":`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  return result;
}
