/**
 * Persistence for generated genre artworks, on the shared runtime pool
 * (`db/pool.ts`). Storage is permanent. Regenerating is cheap but not free,
 * and the output is deterministic, so there is no reason to expire rows.
 */

import { getDatabasePool } from "../../db/pool.js";

export interface StoredArtwork {
  jpeg: Buffer;
  accentColor: string;
}

export async function getArtwork(genreKey: string): Promise<StoredArtwork | null> {
  const result = await getDatabasePool().query<{ jpeg: Buffer; accent_color: string }>(
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
  await getDatabasePool().query(
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
  const result = await getDatabasePool().query(`DELETE FROM genre_artworks`);
  return { deleted: result.rowCount ?? 0 };
}

/** What the browse grid needs to know about a genre's stored artwork. */
export interface StoredArtworkSummary {
  /** The accent the tile is colored with before its JPEG has loaded. */
  accentColor: string;
  /**
   * True when the artwork was generated from a real album cover, which proves
   * the genre has music with artwork without asking Last.fm again.
   */
  hasSourceCover: boolean;
}

/**
 * Batch-reads the stored artworks of a list of genres without pulling the
 * JPEG bytes.
 *
 * @param genreKeys - Canonical genre keys.
 * @returns One entry per genre that has a stored artwork.
 */
export async function getStoredArtworkSummaries(genreKeys: string[]): Promise<Map<string, StoredArtworkSummary>> {
  if (genreKeys.length === 0) return new Map();
  const result = await getDatabasePool().query<{ genre_key: string; accent_color: string; has_source_cover: boolean }>(
    `SELECT genre_key, accent_color, source_cover_url IS NOT NULL AS has_source_cover
     FROM genre_artworks WHERE genre_key = ANY($1)`,
    [genreKeys],
  );
  const summaries = new Map<string, StoredArtworkSummary>();
  for (const row of result.rows) {
    summaries.set(row.genre_key, { accentColor: row.accent_color, hasSourceCover: row.has_source_cover });
  }
  return summaries;
}
