/**
 * Admin catalog maintenance: bulk deletion of tracks, albums and artist
 * profiles, cache invalidation, aggregate counts and the full data reset,
 * and the short-id utilities (`resolveShortIds`, `getRandomShortId`,
 * `updateTrackTimestamp`, `findMissingTables`).
 *
 * `postgres-admin-catalog.ts` re-exports every function here, so importers
 * keep using that module.
 */

import { AdminEventType } from "@musiccloud/shared";
import type { Pool } from "pg";
import { adminEventBroadcaster } from "../../lib/event-broadcaster.js";
import { log } from "../../lib/infra/logger.js";
import { ALBUM_ARTIST_FIELDS_SELECT, safeParseArray, TRACK_ARTIST_FIELDS_SELECT } from "./postgres-shared.js";

// ============================================================================
// DELETION
// ============================================================================

/**
 * Bulk-deletes tracks and their dependent rows (`service_links`,
 * `short_urls`) inside one transaction. Emits a `tracks-deleted` event
 * on success.
 *
 * @param pool - Postgres connection pool.
 * @param ids - Track ids to delete. No-op if empty.
 */
export async function deleteTracks(pool: Pool, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

    await client.query(`DELETE FROM service_links WHERE track_id IN (${placeholders})`, ids);
    await client.query(`DELETE FROM short_urls WHERE track_id IN (${placeholders})`, ids);

    await client.query(`DELETE FROM tracks WHERE id IN (${placeholders}) RETURNING id`, ids);

    await client.query("COMMIT");

    adminEventBroadcaster.emit({
      type: AdminEventType.TracksDeleted,
      data: { count: ids.length, ids },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Bulk-deletes albums and their dependent rows (`album_service_links`,
 * `album_short_urls`) inside one transaction. Emits an
 * `albums-deleted` event on success.
 *
 * @param pool - Postgres connection pool.
 * @param ids - Album ids to delete. No-op if empty.
 */
export async function deleteAlbums(pool: Pool, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

    await client.query(`DELETE FROM album_service_links WHERE album_id IN (${placeholders})`, ids);
    await client.query(`DELETE FROM album_short_urls WHERE album_id IN (${placeholders})`, ids);

    await client.query(`DELETE FROM albums WHERE id IN (${placeholders}) RETURNING id`, ids);

    await client.query("COMMIT");

    adminEventBroadcaster.emit({
      type: AdminEventType.AlbumsDeleted,
      data: { count: ids.length, ids },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Bulk-deletes artist profiles plus their service-links, external-ids
 * and short-urls. `artist_entities` rows are intentionally preserved
 * because tracks / albums and identity data can still reference the
 * canonical entity. Emits an `artists-deleted` event on success.
 *
 * @param pool - Postgres connection pool.
 * @param ids - `artist_entity_id` values whose profile rows should be
 *   removed. No-op if empty.
 */
export async function deleteArtists(pool: Pool, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const entityPlaceholders = ids.map((_, i) => `$${i + 1}`).join(",");

    await client.query(`DELETE FROM artist_external_ids WHERE artist_entity_id IN (${entityPlaceholders})`, ids);
    await client.query(`DELETE FROM artist_service_links WHERE artist_entity_id IN (${entityPlaceholders})`, ids);
    await client.query(`DELETE FROM artist_short_urls WHERE artist_entity_id IN (${entityPlaceholders})`, ids);

    await client.query(
      `DELETE FROM artist_profiles WHERE artist_entity_id IN (${entityPlaceholders}) RETURNING artist_entity_id`,
      ids,
    );

    await client.query("COMMIT");

    adminEventBroadcaster.emit({
      type: AdminEventType.ArtistsDeleted,
      data: { count: ids.length, ids },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================
//
// Only artists still gate resolver freshness on `updated_at` (48h TTL via
// `tryArtistCache`). Track and album resolver cache hits are permanently fresh
// after the static/dynamic cache split (preview freshness lives in
// `track_previews` / `album_previews`), so there is no per-row track/album
// invalidation, because rewinding their `updated_at` would have no effect.

/**
 * Forces the next resolve for an artist to re-fetch from upstream by
 * rewinding `artist_profiles.updated_at` to the Unix epoch.
 *
 * @param pool - Postgres connection pool.
 * @param shortId - The public short URL id that identifies the artist.
 * @returns `{ ok: true }` on success.
 * @throws `Error` when no artist short URL with that id exists.
 */
export async function invalidateArtistCache(pool: Pool, shortId: string): Promise<{ ok: true }> {
  const result = await pool.query(
    `UPDATE artist_profiles SET updated_at = to_timestamp(0)
     WHERE artist_entity_id = (SELECT artist_entity_id FROM artist_short_urls WHERE id = $1)`,
    [shortId],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new Error(`Artist short URL not found: ${shortId}`);
  }
  return { ok: true };
}

/**
 * Rewinds `updated_at` on every track, album and artist row in one
 * transaction.
 *
 * Only artist resolves still use the timestamp as a TTL input. Track and album
 * rows are marked for admin/catalog purposes; their resolver freshness is not
 * affected.
 *
 * @param pool - Postgres connection pool.
 * @returns Per-domain row counts that were touched.
 */
export async function invalidateAllCaches(pool: Pool): Promise<{ tracks: number; albums: number; artists: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tracksResult = await client.query(`UPDATE tracks SET updated_at = to_timestamp(0)`);
    const albumsResult = await client.query(`UPDATE albums SET updated_at = to_timestamp(0)`);
    const artistsResult = await client.query(`UPDATE artist_profiles SET updated_at = to_timestamp(0)`);
    await client.query("COMMIT");
    return {
      tracks: tracksResult.rowCount ?? 0,
      albums: albumsResult.rowCount ?? 0,
      artists: artistsResult.rowCount ?? 0,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Truncates the `artist_cache` JSON cache table.
 *
 * @param pool - Postgres connection pool.
 * @returns The number of cache rows that were removed.
 */
export async function clearArtistCache(pool: Pool): Promise<{ deleted: number }> {
  const result = await pool.query(`DELETE FROM artist_cache RETURNING id`);
  return { deleted: result.rowCount ?? 0 };
}

// ============================================================================
// AGGREGATE COUNTS / RESET
// ============================================================================

/**
 * Returns aggregate row counts for the maintenance dashboard.
 *
 * @remarks `artists` and `artistProfiles` intentionally return the same
 *   `artist_profiles` count (legacy field kept for backward
 *   compatibility with the dashboard's older payload shape).
 *
 * @param pool - Postgres connection pool.
 */
export async function countAllData(pool: Pool): Promise<{
  tracks: number;
  albums: number;
  artists: number;
  artistProfiles: number;
  artistEntities: number;
}> {
  const tracksResult = await pool.query(`SELECT COUNT(*) as count FROM tracks`);
  const albumsResult = await pool.query(`SELECT COUNT(*) as count FROM albums`);
  const artistsResult = await pool.query(`SELECT COUNT(*) as count FROM artist_profiles`);
  const artistEntitiesResult = await pool.query(`SELECT COUNT(*) as count FROM artist_entities`);

  return {
    tracks: tracksResult.rows[0]?.count ?? 0,
    albums: albumsResult.rows[0]?.count ?? 0,
    artists: artistsResult.rows[0]?.count ?? 0,
    artistProfiles: artistsResult.rows[0]?.count ?? 0,
    artistEntities: artistEntitiesResult.rows[0]?.count ?? 0,
  };
}

/**
 * Wipes every catalog table in foreign-key-safe order (links / short
 * urls first, then artist profiles, then albums + tracks, then the
 * artist cache) inside one transaction.
 *
 * @param pool - Postgres connection pool.
 * @returns Pre-deletion counts so the operator UI can show what got
 *   removed.
 */
export async function resetAllData(pool: Pool): Promise<{ tracks: number; albums: number; artists: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tracksResult = await client.query(`SELECT COUNT(*) as count FROM tracks`);
    const albumsResult = await client.query(`SELECT COUNT(*) as count FROM albums`);
    const artistsResult = await client.query(`SELECT COUNT(*) as count FROM artist_profiles`);

    const trackCount = tracksResult.rows[0]?.count ?? 0;
    const albumCount = albumsResult.rows[0]?.count ?? 0;
    const artistCount = artistsResult.rows[0]?.count ?? 0;

    await client.query("DELETE FROM artist_short_urls");
    await client.query("DELETE FROM artist_external_ids");
    await client.query("DELETE FROM artist_service_links");
    await client.query("DELETE FROM artist_profiles");
    await client.query("DELETE FROM album_short_urls");
    await client.query("DELETE FROM album_service_links");
    await client.query("DELETE FROM short_urls");
    await client.query("DELETE FROM service_links");
    await client.query("DELETE FROM albums");
    await client.query("DELETE FROM tracks");
    await client.query("DELETE FROM artist_cache");

    await client.query("COMMIT");
    log.debug("DB", "All data reset successfully");

    return { tracks: trackCount, albums: albumCount, artists: artistCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// SHORT-ID UTILITIES
// ============================================================================

/**
 * Resolves a batch of short-ids to display titles and main-artist names.
 * Each id may refer to a track or an album; album lookup runs only for
 * ids that did not match a track.
 *
 * @param pool - Postgres connection pool.
 * @param shortIds - The short-ids to resolve. Empty input returns an
 *   empty map.
 * @returns A map from short-id to `{ title, artist }`. Ids that match
 *   nothing are omitted from the map.
 */
export async function resolveShortIds(
  pool: Pool,
  shortIds: string[],
): Promise<Map<string, { title: string; artist: string }>> {
  const result = new Map<string, { title: string; artist: string }>();
  if (shortIds.length === 0) return result;

  const placeholders = shortIds.map((_, i) => `$${i + 1}`).join(", ");

  const trackRows = await pool.query(
    `SELECT su.id AS short_id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}
     FROM short_urls su JOIN tracks t ON su.track_id = t.id
     WHERE su.id IN (${placeholders})`,
    shortIds,
  );
  for (const row of trackRows.rows) {
    const artists = safeParseArray(row.artists);
    result.set(row.short_id, { title: row.title, artist: artists[0] ?? "Unknown" });
  }

  const remaining = shortIds.filter((id) => !result.has(id));
  if (remaining.length > 0) {
    const albumPlaceholders = remaining.map((_, i) => `$${i + 1}`).join(", ");
    const albumRows = await pool.query(
      `SELECT asu.id AS short_id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}
       FROM album_short_urls asu JOIN albums a ON asu.album_id = a.id
       WHERE asu.id IN (${albumPlaceholders})`,
      remaining,
    );
    for (const row of albumRows.rows) {
      const artists = safeParseArray(row.artists);
      result.set(row.short_id, { title: row.title, artist: artists[0] ?? "Unknown" });
    }
  }

  return result;
}

/**
 * Returns a uniformly-picked random short-id across both
 * `short_urls` (tracks) and `album_short_urls` (albums). Used by the
 * admin "open a random share" action.
 *
 * @remarks Uses `OFFSET random() * COUNT()` so the planner avoids a
 *   full `ORDER BY RANDOM()` sort. Track and album short-url ids share
 *   the same namespace by design, so the UNION ALL never collides.
 *
 * @param pool - Postgres connection pool.
 * @returns A short-id, or `null` if no short URLs exist.
 */
export async function getRandomShortId(pool: Pool): Promise<string | null> {
  const result = await pool.query(
    `WITH all_urls AS (
       SELECT id FROM short_urls
       UNION ALL
       SELECT id FROM album_short_urls
     )
     SELECT id FROM all_urls
     OFFSET floor(random() * (SELECT COUNT(*) FROM all_urls))::int
     LIMIT 1`,
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].id;
}

/**
 * Stamps `tracks.updated_at = NOW()` without touching any other column.
 *
 * @param pool - Postgres connection pool.
 * @param trackId - The track's id.
 */
export async function updateTrackTimestamp(pool: Pool, trackId: string): Promise<void> {
  const now = new Date();
  await pool.query(`UPDATE tracks SET updated_at = $1 WHERE id = $2`, [now, trackId]);
}

/**
 * Diagnostic helper: given a list of expected `public.*` table names,
 * returns the subset that does not exist in the live schema. Used by
 * the maintenance / smoke-test endpoints.
 *
 * @param pool - Postgres connection pool.
 * @param expected - Table names to probe. Empty input returns an empty
 *   array without hitting the database.
 * @returns The expected names that are not present in
 *   `information_schema.tables`.
 */
export async function findMissingTables(pool: Pool, expected: string[]): Promise<string[]> {
  if (expected.length === 0) return [];
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [expected],
  );
  const present = new Set(result.rows.map((r) => r.table_name));
  return expected.filter((t) => !present.has(t));
}
