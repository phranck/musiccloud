/**
 * Admin catalog listings: the paginated, searchable lists of tracks, albums,
 * artists (`artist_profiles`) and artist-entities behind the admin catalog
 * pages.
 *
 * `postgres-admin-catalog.ts` re-exports every function here, so importers
 * keep using that module.
 */

import { type ArtistProfileManualRefreshSummary, classifyArtistProfileCacheStatus } from "@musiccloud/shared";
import type { Pool } from "pg";
import type {
  AlbumListItem,
  ArtistEntityListItem,
  ArtistListItem,
  ListResult,
  TrackListItem,
} from "../admin-repository.js";
import type { AlbumListRow, TrackListRow } from "./postgres-admin-catalog.js";
import type { ArtistRow } from "./postgres-artists.js";
import {
  ALBUM_ARTIST_FIELDS_SELECT,
  ARTIST_NAME_LATERAL_JOIN,
  ARTIST_NAME_SELECT,
  artistNamePreferenceOrder,
  type CountRow,
  dateToMs,
  isArtistProfileProvider,
  safeParseArray,
  safeParseArtistCredits,
  TRACK_ARTIST_FIELDS_SELECT,
  UNNAMED_ARTIST_NAME,
} from "./postgres-shared.js";

// ============================================================================
// LISTING & PAGINATION
// ============================================================================

/**
 * The `ORDER BY` of a paged admin list: the sorted column, then the row's key.
 *
 * PostgreSQL returns rows with equal sort values in no defined order and may
 * plan each OFFSET differently, so a page only continues the previous one when
 * the order is unique. The key decides between rows the sorted column leaves
 * tied.
 *
 * @param sortExpression - The sorted column or select alias, already checked
 *   against the list's allowed columns.
 * @param direction - The direction, applied to both terms.
 * @param keyColumn - The list's primary key column.
 * @returns The complete `ORDER BY` clause.
 */
function pagedListOrder(sortExpression: string, direction: "ASC" | "DESC", keyColumn: string): string {
  return `ORDER BY ${sortExpression} ${direction}, ${keyColumn} ${direction}`;
}

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
  ${pagedListOrder(`t.${col}`, dir, "t.id")}
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
 * @remarks Mirrors {@link listTracks}. It counts only on page 1, counts
 *   links with a correlated `link_count` subquery, and orders by
 *   deterministic columns.
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
  ${pagedListOrder(`a.${col}`, dir, "a.id")}
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
  ${pagedListOrder(orderExpr, dir, "ar.artist_entity_id")}
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
        profileProviders: r.profile_cache_present ? (r.profile_providers ?? []).filter(isArtistProfileProvider) : [],
        latestManualRefresh,
      }),
    };
  });

  return { items, total, page, limit };
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
    COALESCE(entity_name.name, '${UNNAMED_ARTIST_NAME}') AS display_name,
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
    ORDER BY ${artistNamePreferenceOrder("n")}
    LIMIT 1
  ) entity_name ON TRUE
  LEFT JOIN artist_profiles ap ON ap.artist_entity_id = ae.id
  LEFT JOIN artist_short_urls asu ON asu.artist_entity_id = ae.id
  ${whereClause}
  ${pagedListOrder(orderExpr, dir, "ae.id")}
  LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

  const rows = await pool.query<{
    id: string;
    entity_type: ArtistEntityListItem["entityType"];
    verification_status: ArtistEntityListItem["verificationStatus"];
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
