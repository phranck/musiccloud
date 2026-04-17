/**
 * Persistence for generated genre artworks.
 *
 * Uses the same `pg` pool pattern and lazy initialisation as
 * `image-cache.ts` (same DB, same reasoning). Storage is permanent —
 * regenerating is cheap but non-zero, and the output is deterministic, so
 * there's no reason to expire rows.
 */

import * as pgModule from "pg";
import { loadDatabaseConfig } from "../../db/config.js";

const Pool = (pgModule as unknown as { default: typeof pgModule }).default?.Pool ?? pgModule.Pool;

let pool: InstanceType<typeof Pool> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!pool) {
    const config = loadDatabaseConfig();
    pool = new Pool({ connectionString: config.url, max: 2 });
  }
  return pool;
}

export interface StoredArtwork {
  jpeg: Buffer;
  accentColor: string;
}

export async function getArtwork(genreKey: string): Promise<StoredArtwork | null> {
  const result = await getPool().query<{ jpeg: Buffer; accent_color: string }>(
    "SELECT jpeg, accent_color FROM genre_artworks WHERE genre_key = $1",
    [genreKey],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { jpeg: row.jpeg, accentColor: row.accent_color };
}

export async function saveArtwork(
  genreKey: string,
  jpeg: Buffer,
  accentColor: string,
  sourceCoverUrl: string | null,
): Promise<void> {
  await getPool().query(
    `INSERT INTO genre_artworks (genre_key, jpeg, accent_color, source_cover_url, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (genre_key) DO NOTHING`,
    [genreKey, jpeg, accentColor, sourceCoverUrl],
  );
}

/**
 * Drop every stored artwork. Used by the admin "purge genre cache" action
 * so a subsequent request to `/genre-artwork/:key` re-generates with the
 * latest generator code / style.
 */
export async function clearAllArtworks(): Promise<{ deleted: number }> {
  const result = await getPool().query(`DELETE FROM genre_artworks`);
  return { deleted: result.rowCount ?? 0 };
}

/**
 * Batch-fetch accent colors for a list of genres. Used by the browse-grid
 * endpoint to inline already-known accents without pulling the JPEG bytes.
 */
export async function getAccentColors(genreKeys: string[]): Promise<Map<string, string>> {
  if (genreKeys.length === 0) return new Map();
  const result = await getPool().query<{ genre_key: string; accent_color: string }>(
    "SELECT genre_key, accent_color FROM genre_artworks WHERE genre_key = ANY($1)",
    [genreKeys],
  );
  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(row.genre_key, row.accent_color);
  }
  return map;
}
