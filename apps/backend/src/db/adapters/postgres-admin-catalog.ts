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
 * Excludes:
 *   - Admin user CRUD (see `postgres-admin-users.ts`).
 *   - Content / nav / email admin (see `postgres-content-*.ts`).
 *   - Public read/write paths for tracks / albums / artists (see
 *     `postgres-tracks.ts`, `postgres-albums.ts`, `postgres-artists.ts`).
 */

import {
  type ArtistProfileManualRefreshSummary,
  type ArtistProfileProvider,
  classifyArtistProfileCacheStatus,
} from "@musiccloud/shared";
import type { Pool } from "pg";
import { adminEventBroadcaster } from "../../lib/event-broadcaster.js";
import { log } from "../../lib/infra/logger.js";
import type {
  AlbumListItem,
  ArtistEntityListItem,
  ArtistListItem,
  ListResult,
  TrackListItem,
} from "../admin-repository.js";
import type { ArtistCredit } from "../repository.js";
import type { ArtistRow } from "./postgres-artists.js";
import {
  ALBUM_ARTIST_FIELDS_SELECT,
  ARTIST_NAME_LATERAL_JOIN,
  ARTIST_NAME_SELECT,
  type CountRow,
  dateToMs,
  replaceTrackArtistCredits,
  type ServiceLinkRow,
  safeParseArray,
  safeParseArtistCredits,
  TRACK_ARTIST_FIELDS_SELECT,
} from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/**
 * Raw shape of a track listing row (admin listings only; public
 * resolution uses a wider, link-bearing shape — see
 * `postgres-tracks.ts`).
 */
interface TrackListRow {
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
 * Raw shape of an album listing row.
 */
interface AlbumListRow {
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
      (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
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

// ============================================================================
// LISTING & PAGINATION
// ============================================================================

/**
 * Paginated listing of tracks for the admin TracksPage.
 *
 * @remarks Total row count is only computed on page 1; subsequent pages
 *   return `-1` so the infinite-scroll client knows to reuse its cached
 *   total. `link_count` uses a correlated subquery instead of a
 *   `LEFT JOIN service_links + GROUP BY` so it stays bounded by the page
 *   size and uses the `(track_id, service)` composite index.
 *
 * @param pool - Postgres connection pool.
 * @param params - Pagination cursor (`page`, `limit`), optional text query
 *   `q`, sortable column `sortBy` (allowed: `created_at`, `updated_at`,
 *   `title`) and direction `sortDir`.
 * @returns Page of {@link TrackListItem}.
 */
export async function listTracks(
  pool: Pool,
  params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  },
): Promise<ListResult<TrackListItem>> {
  const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
  const offset = (page - 1) * limit;
  const ALLOWED = ["created_at", "updated_at", "title"];
  const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
  const dir = sortDir === "asc" ? "ASC" : "DESC";

  let whereClause = "";
  const dataParams: (string | number)[] = [];
  if (q) {
    whereClause = `WHERE t.title ILIKE $1 OR EXISTS (SELECT 1 FROM track_artist_credits tac WHERE tac.track_id = t.id AND tac.credit_name ILIKE $1)`;
    dataParams.push(`%${q}%`);
  }

  let total: number | string = -1;
  if (page === 1) {
    const countResult = await pool.query<CountRow>(
      `SELECT COUNT(*) as count FROM tracks t ${whereClause}`,
      q ? dataParams : [],
    );
    total = countResult.rows[0]?.count ?? 0;
  }

  dataParams.push(limit, offset);
  const query = `SELECT
    t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
    t.source_service, t.created_at,
    su.id as short_id,
    (SELECT COUNT(*) FROM service_links sl WHERE sl.track_id = t.id) as link_count
  FROM tracks t
  LEFT JOIN short_urls su ON t.id = su.track_id
  ${whereClause}
  ORDER BY t.${col} ${dir}
  LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

  const rows = await pool.query(query, dataParams);

  const items = (rows.rows as TrackListRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    artists: safeParseArray(r.artists),
    artistCredits: safeParseArtistCredits(r.artist_credits),
    albumName: r.album_name ?? null,
    isrc: r.isrc ?? null,
    artworkUrl: r.artwork_url ?? null,
    sourceService: r.source_service ?? null,
    linkCount: parseInt(r.link_count, 10),
    createdAt: dateToMs(r.created_at),
    shortId: r.short_id ?? null,
  }));

  return { items, total, page, limit };
}

/**
 * Paginated listing of albums for the admin AlbumsPage.
 *
 * @remarks Mirrors {@link listTracks} — page-1 COUNT, correlated
 *   `link_count` subquery, deterministic order columns.
 *
 * @param pool - Postgres connection pool.
 * @param params - Pagination + search params; same shape as
 *   {@link listTracks}'s `params`.
 */
export async function listAlbums(
  pool: Pool,
  params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  },
): Promise<ListResult<AlbumListItem>> {
  const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
  const offset = (page - 1) * limit;
  const ALLOWED = ["created_at", "updated_at", "title"];
  const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
  const dir = sortDir === "asc" ? "ASC" : "DESC";

  let whereClause = "";
  const dataParams: (string | number)[] = [];
  if (q) {
    whereClause = `WHERE a.title ILIKE $1 OR EXISTS (SELECT 1 FROM album_artist_credits aac WHERE aac.album_id = a.id AND aac.credit_name ILIKE $1)`;
    dataParams.push(`%${q}%`);
  }

  let total: number | string = -1;
  if (page === 1) {
    const countResult = await pool.query<CountRow>(
      `SELECT COUNT(*) as count FROM albums a ${whereClause}`,
      q ? dataParams : [],
    );
    total = countResult.rows[0]?.count ?? 0;
  }

  dataParams.push(limit, offset);
  const query = `SELECT
    a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
    a.artwork_url, a.upc, a.source_service, a.created_at,
    asu.id as short_id,
    (SELECT COUNT(*) FROM album_service_links asl WHERE asl.album_id = a.id) as link_count
  FROM albums a
  LEFT JOIN album_short_urls asu ON a.id = asu.album_id
  ${whereClause}
  ORDER BY a.${col} ${dir}
  LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

  const rows = await pool.query(query, dataParams);

  const items = (rows.rows as AlbumListRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    artists: safeParseArray(r.artists),
    artistCredits: safeParseArtistCredits(r.artist_credits),
    releaseDate: r.release_date ?? null,
    totalTracks: r.total_tracks ?? null,
    artworkUrl: r.artwork_url ?? null,
    upc: r.upc ?? null,
    sourceService: r.source_service ?? null,
    linkCount: parseInt(r.link_count, 10),
    createdAt: dateToMs(r.created_at),
    shortId: r.short_id ?? null,
  }));

  return { items, total, page, limit };
}

/**
 * Paginated listing of artists (rows from `artist_profiles`) for the
 * admin ArtistsPage.
 *
 * @remarks Same page-1-COUNT + correlated link_count pattern as
 *   {@link listTracks}. `sortBy = "name"` orders by the canonical name
 *   exposed via {@link ARTIST_NAME_LATERAL_JOIN}.
 *
 * @param pool - Postgres connection pool.
 * @param params - Pagination + search params (allowed sort columns:
 *   `created_at`, `updated_at`, `name`).
 */
export async function listArtists(
  pool: Pool,
  params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  },
): Promise<ListResult<ArtistListItem>> {
  const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
  const offset = (page - 1) * limit;
  const ALLOWED = ["created_at", "updated_at", "name"];
  const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
  const orderExpr = col === "name" ? "name" : `ar.${col}`;
  const dir = sortDir === "asc" ? "ASC" : "DESC";

  let whereClause = "";
  const dataParams: (string | number)[] = [];
  if (q) {
    whereClause = `WHERE EXISTS (
      SELECT 1
      FROM artist_entity_names n
      WHERE n.artist_entity_id = ar.artist_entity_id AND n.name ILIKE $1
    )`;
    dataParams.push(`%${q}%`);
  }

  let total: number | string = -1;
  if (page === 1) {
    const countResult = await pool.query<CountRow>(
      `SELECT COUNT(*) as count FROM artist_profiles ar ${whereClause}`,
      q ? dataParams : [],
    );
    total = countResult.rows[0]?.count ?? 0;
  }

  dataParams.push(limit, offset);
  const query = `SELECT
    ar.artist_entity_id AS id, ar.artist_entity_id, ${ARTIST_NAME_SELECT}, ar.image_url, ar.genres, ar.source_service, ar.created_at,
    asu.id as short_id,
    (SELECT COUNT(*) FROM artist_service_links asl WHERE asl.artist_entity_id = ar.artist_entity_id) as link_count,
    ac.profile IS NOT NULL AS profile_cache_present,
    ac.profile_updated_at,
    ac.profile_providers,
    latest_refresh.trigger AS refresh_trigger,
    latest_refresh.occurred_at AS refresh_occurred_at,
    latest_refresh.completed_at AS refresh_completed_at,
    latest_refresh.outcome AS refresh_outcome,
    latest_refresh.error_code AS refresh_error_code,
    latest_refresh.error_id AS refresh_error_id
  FROM artist_profiles ar
  ${ARTIST_NAME_LATERAL_JOIN}
  LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
  LEFT JOIN artist_cache ac ON ac.id = 'artistEntity:' || ar.artist_entity_id
  LEFT JOIN LATERAL (
    SELECT trigger, occurred_at, completed_at, outcome, error_code, error_id
    FROM artist_profile_refresh_events
    WHERE artist_entity_id = ar.artist_entity_id
    ORDER BY occurred_at DESC, id DESC
    LIMIT 1
  ) latest_refresh ON TRUE
  ${whereClause}
  ORDER BY ${orderExpr} ${dir}
  LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

  const rows = await pool.query(query, dataParams);

  interface ArtistListRow extends ArtistRow {
    short_id: string | null;
    link_count: string;
    profile_cache_present: boolean;
    profile_updated_at: Date | null;
    profile_providers: string[] | null;
    refresh_trigger: "manual" | null;
    refresh_occurred_at: Date | null;
    refresh_completed_at: Date | null;
    refresh_outcome: "refreshing" | "succeeded" | "failed" | null;
    refresh_error_code: string | null;
    refresh_error_id: string | null;
  }

  const items = (rows.rows as ArtistListRow[]).map((r) => {
    const latestManualRefresh: ArtistProfileManualRefreshSummary | null =
      r.refresh_trigger === "manual" && r.refresh_occurred_at && r.refresh_outcome
        ? {
            trigger: "manual",
            occurredAt: new Date(r.refresh_occurred_at).toISOString(),
            completedAt: r.refresh_completed_at ? new Date(r.refresh_completed_at).toISOString() : null,
            outcome: r.refresh_outcome,
            errorCode: r.refresh_error_code,
            errorId: r.refresh_error_id,
          }
        : null;
    return {
      id: r.id,
      artistEntityId: r.artist_entity_id,
      name: r.name,
      imageUrl: r.image_url ?? null,
      genres: safeParseArray(r.genres ?? "[]"),
      sourceService: r.source_service ?? null,
      linkCount: parseInt(r.link_count, 10),
      createdAt: dateToMs(r.created_at),
      shortId: r.short_id ?? null,
      profileCache: classifyArtistProfileCacheStatus({
        profileUpdatedAt:
          r.profile_cache_present && r.profile_updated_at ? new Date(r.profile_updated_at).toISOString() : null,
        profileProviders: r.profile_cache_present
          ? (r.profile_providers ?? []).filter(isArtistProfileProvider)
          : [],
        latestManualRefresh,
      }),
    };
  });

  return { items, total, page, limit };
}

function isArtistProfileProvider(value: string): value is ArtistProfileProvider {
  return value === "spotify" || value === "deezer" || value === "lastfm";
}

/**
 * Paginated listing of artist-entities (the identity layer below
 * `artist_profiles`) used by the admin ArtistEntitiesPage.
 *
 * @remarks Picks one canonical display name via a `LATERAL` lookup that
 *   prefers `name_type = 'canonical'` with `locale IS NULL`. Counts
 *   track and album credit relationships per entity for the operator
 *   view.
 *
 * @param pool - Postgres connection pool.
 * @param params - Pagination + search params (allowed sort columns:
 *   `created_at`, `name`, `entity_type`, `verification_status`).
 */
export async function listArtistEntities(
  pool: Pool,
  params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  },
): Promise<ListResult<ArtistEntityListItem>> {
  const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
  const offset = (page - 1) * limit;
  const ALLOWED = ["created_at", "name", "entity_type", "verification_status"];
  const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
  const orderExpr = col === "name" ? "display_name" : `ae.${col}`;
  const dir = sortDir === "asc" ? "ASC" : "DESC";

  let whereClause = "";
  const dataParams: (string | number)[] = [];
  if (q) {
    whereClause = `WHERE EXISTS (
      SELECT 1
      FROM artist_entity_names n
      WHERE n.artist_entity_id = ae.id AND n.name ILIKE $1
    )`;
    dataParams.push(`%${q}%`);
  }

  let total: number | string = -1;
  if (page === 1) {
    const countResult = await pool.query<CountRow>(
      `SELECT COUNT(*) as count FROM artist_entities ae ${whereClause}`,
      q ? dataParams : [],
    );
    total = countResult.rows[0]?.count ?? 0;
  }

  dataParams.push(limit, offset);
  const query = `SELECT
    ae.id,
    ae.entity_type,
    ae.verification_status,
    COALESCE(entity_name.name, '[unnamed artist]') AS display_name,
    ae.created_at,
    ap.artist_entity_id IS NOT NULL AS has_profile,
    asu.id AS short_id,
    (SELECT COUNT(*) FROM track_artist_credits tac WHERE tac.artist_entity_id = ae.id)::int AS track_credit_count,
    (SELECT COUNT(*) FROM album_artist_credits aac WHERE aac.artist_entity_id = ae.id)::int AS album_credit_count
  FROM artist_entities ae
  LEFT JOIN LATERAL (
    SELECT n.name
    FROM artist_entity_names n
    WHERE n.artist_entity_id = ae.id
    ORDER BY
      CASE
        WHEN n.name_type = 'canonical' AND n.locale IS NULL THEN 0
        WHEN n.name_type = 'canonical' THEN 1
        WHEN n.name_type = 'credit' THEN 2
        WHEN n.locale IS NULL THEN 3
        ELSE 4
      END,
      n.created_at ASC
    LIMIT 1
  ) entity_name ON TRUE
  LEFT JOIN artist_profiles ap ON ap.artist_entity_id = ae.id
  LEFT JOIN artist_short_urls asu ON asu.artist_entity_id = ae.id
  ${whereClause}
  ORDER BY ${orderExpr} ${dir}
  LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

  const rows = await pool.query<{
    id: string;
    entity_type: string;
    verification_status: string;
    display_name: string;
    created_at: Date;
    has_profile: boolean;
    short_id: string | null;
    track_credit_count: number;
    album_credit_count: number;
  }>(query, dataParams);

  return {
    items: rows.rows.map((r) => ({
      id: r.id,
      name: r.display_name,
      entityType: r.entity_type,
      verificationStatus: r.verification_status,
      trackCreditCount: r.track_credit_count,
      albumCreditCount: r.album_credit_count,
      hasProfile: r.has_profile,
      shortId: r.short_id,
      createdAt: dateToMs(r.created_at),
    })),
    total,
    page,
    limit,
  };
}

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
      type: "tracks-deleted",
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
      type: "albums-deleted",
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
      type: "artists-deleted",
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
// invalidation — rewinding their `updated_at` would have no effect.

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
