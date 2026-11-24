/**
 * Admin catalog domain: CRUD and listing for tracks, albums, artists and
 * artist-entities, plus the cross-domain admin utilities (cache
 * invalidation, count / reset / short-id resolution).
 *
 * Scope:
 *   - Single-track read/update used by the admin track editor.
 *   - Paginated listings with optional text search for tracks, albums,
 *     artists (`artist_profiles`) and artist-entities.
 *   - Hard-delete with foreign-key cleanup for tracks, albums and artist
 *     profiles. Emits typed events on the {@link adminEventBroadcaster}
 *     so dashboard clients can react in real time.
 *   - Cache invalidation: per-artist (`invalidateArtistCache`) and full
 *     (`invalidateAllCaches`, `clearArtistCache`).
 *   - Aggregate counts and full data reset for the maintenance UI.
 *   - `resolveShortIds` batch lookup for any short-id that may refer to a
 *     track or an album.
 *   - Generic single-row utilities consumed only by admin flows:
 *     `getRandomShortId`, `updateTrackTimestamp`, `findMissingTables`.
 *
 * Re-exported from sibling modules, so importers keep using this one:
 *   - The paginated listings, in `postgres-admin-catalog-lists.ts`.
 *   - Deletion, cache invalidation, counts and reset, and the short-id
 *     utilities, in `postgres-admin-maintenance.ts`.
 *
 * Excludes:
 *   - Admin user CRUD (see `postgres-admin-users.ts`).
 *   - Content / nav / email admin (see `postgres-content-*.ts`).
 *   - Public read/write paths for tracks / albums / artists (see
 *     `postgres-tracks.ts`, `postgres-albums.ts`, `postgres-artists.ts`).
 */

import type { Pool } from "pg";
import type { ArtistCredit } from "../repository.js";
import {
  dateToMs,
  replaceTrackArtistCredits,
  type ServiceLinkRow,
  safeParseArray,
  safeParseArtistCredits,
  TRACK_ARTIST_FIELDS_SELECT,
  TRACK_PREVIEW_URL_SELECT,
} from "./postgres-shared.js";

export { listAlbums, listArtistEntities, listArtists, listTracks } from "./postgres-admin-catalog-lists.js";
export {
  clearArtistCache,
  countAllData,
  deleteAlbums,
  deleteArtists,
  deleteTracks,
  findMissingTables,
  getRandomShortId,
  invalidateAllCaches,
  invalidateArtistCache,
  resetAllData,
  resolveShortIds,
  updateTrackTimestamp,
} from "./postgres-admin-maintenance.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/**
 * Raw shape of a track listing row, used by the admin listings only. Public
 * resolution uses a wider, link-bearing shape, which `postgres-tracks.ts`
 * defines. `listTracks` in `postgres-admin-catalog-lists.ts` reads it.
 */
export interface TrackListRow {
  id: string;
  title: string;
  artists: string;
  artist_credits: string;
  album_name: string | null;
  isrc: string | null;
  artwork_url: string | null;
  source_service: string | null;
  created_at: Date;
  short_id: string | null;
  link_count: string;
}

/**
 * Raw shape of an album listing row. `listAlbums` in
 * `postgres-admin-catalog-lists.ts` reads it.
 */
export interface AlbumListRow {
  id: string;
  title: string;
  artists: string;
  artist_credits: string;
  release_date: string | null;
  total_tracks: number | null;
  artwork_url: string | null;
  upc: string | null;
  source_service: string | null;
  created_at: Date;
  short_id: string | null;
  link_count: string;
}

// ============================================================================
// SINGLE TRACK (admin editor)
// ============================================================================

/**
 * Loads a single track plus its `service_links` rows for the admin
 * editor.
 *
 * Picks the deezer preview URL when present (deezer URLs are stable
 * 30 s previews); falls back to the most recently observed preview from
 * any other service.
 *
 * @param pool - Postgres connection pool.
 * @param id - The track's UUID.
 * @returns A flattened track DTO with `serviceLinks` array, or `null` if
 *   no row matches.
 */
export async function getTrackById(pool: Pool, id: string) {
  const trackResult = await pool.query(
    `SELECT t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
      t.duration_ms, t.release_date, t.is_explicit,
      ${TRACK_PREVIEW_URL_SELECT},
      t.source_service, t.source_url, t.created_at,
      su.id as short_id
    FROM tracks t
    LEFT JOIN short_urls su ON t.id = su.track_id
    WHERE t.id = $1
    GROUP BY t.id, su.id`,
    [id],
  );
  if (trackResult.rows.length === 0) return null;
  const r = trackResult.rows[0];

  const linksResult = await pool.query(`SELECT service, url FROM service_links WHERE track_id = $1 ORDER BY service`, [
    id,
  ]);

  return {
    id: r.id,
    title: r.title,
    artists: safeParseArray(r.artists),
    artistCredits: safeParseArtistCredits(r.artist_credits),
    albumName: r.album_name ?? null,
    isrc: r.isrc ?? null,
    artworkUrl: r.artwork_url ?? null,
    durationMs: r.duration_ms ?? null,
    releaseDate: r.release_date ?? null,
    isExplicit: Boolean(r.is_explicit),
    previewUrl: r.preview_url ?? null,
    sourceService: r.source_service ?? null,
    sourceUrl: r.source_url ?? null,
    shortId: r.short_id ?? null,
    createdAt: dateToMs(r.created_at),
    serviceLinks: (linksResult.rows as ServiceLinkRow[]).map((l) => ({ service: l.service, url: l.url })),
  };
}

/**
 * Applies a partial track update plus optional artist-credit replacement
 * inside a single transaction.
 *
 * @remarks When `artists` or `artistCredits` is provided but no scalar
 *   column changed, `updated_at` is still bumped so the cache layer
 *   notices the credit change.
 *
 * @param pool - Postgres connection pool.
 * @param id - The track's id.
 * @param data - Subset of mutable scalar columns plus optional artist
 *   credits replacement.
 */
export async function updateTrack(
  pool: Pool,
  id: string,
  data: {
    title?: string;
    artists?: string[];
    artistCredits?: ArtistCredit[];
    albumName?: string | null;
    isrc?: string | null;
    artworkUrl?: string | null;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sets: string[] = [];
    const values: (string | number | null | Date)[] = [];
    let idx = 1;
    const now = new Date();

    if (data.title !== undefined) {
      sets.push(`title = $${idx++}`);
      values.push(data.title);
    }
    if (data.albumName !== undefined) {
      sets.push(`album_name = $${idx++}`);
      values.push(data.albumName);
    }
    if (data.isrc !== undefined) {
      sets.push(`isrc = $${idx++}`);
      values.push(data.isrc);
    }
    if (data.artworkUrl !== undefined) {
      sets.push(`artwork_url = $${idx++}`);
      values.push(data.artworkUrl);
    }

    if (sets.length > 0) {
      sets.push(`updated_at = $${idx++}`);
      values.push(now);
      values.push(id);
      await client.query(`UPDATE tracks SET ${sets.join(", ")} WHERE id = $${idx}`, values);
    }

    if (data.artists !== undefined || data.artistCredits !== undefined) {
      await replaceTrackArtistCredits(client, id, data.artists ?? [], now, data.artistCredits);
      if (sets.length === 0) {
        await client.query(`UPDATE tracks SET updated_at = $1 WHERE id = $2`, [now, id]);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
