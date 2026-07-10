/**
 * Album domain: resolve, persist and aggregate metadata for albums plus
 * their service-link fan-out.
 *
 * Scope:
 *   - Resolution by canonical URL, UPC, external-id catalogue.
 *   - Persistence with UPC / URL dedup, transactional credit replacement
 *     and short-URL assignment.
 *   - External-id ingestion (migration `0019`) and per-service preview
 *     URL recording (migration `0021`).
 *   - Share-page projection for the public album endpoint.
 *
 * Excludes:
 *   - Admin CRUD on albums (see `postgres-admin-catalog.ts`).
 *   - Track / artist resolution and persistence (see `postgres-tracks.ts`,
 *     `postgres-artists.ts`).
 *   - Cross-domain persistence helpers like `insertExternalIds` and
 *     `replaceAlbumArtistCredits` (see `postgres-shared.ts`).
 */

import type { VinylLayout } from "@musiccloud/shared";
import type { Pool } from "pg";
import { generateShortId, generateTrackId } from "../../lib/short-id.js";
import type { NormalizedAlbum, TrackSource } from "../../services/types.js";
import type {
  ArtistCredit,
  CachedAlbumResult,
  ExternalIdRecord,
  PersistAlbumData,
  PreviewObservation,
  PreviewRow,
  SharePageAlbumResult,
} from "../repository.js";
import {
  ALBUM_ARTIST_FIELDS_SELECT,
  dateToMs,
  insertExternalIds,
  replaceAlbumArtistCredits,
  safeParseArray,
  safeParseArtistCredits,
} from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/**
 * Raw shape returned by every album-bearing SELECT in this module
 * (without a service-link join).
 */
export interface AlbumRow {
  id: string;
  title: string;
  artists: string;
  artist_credits: string;
  release_date: string | null;
  total_tracks: number | null;
  artwork_url: string | null;
  label: string | null;
  upc: string | null;
  source_service: string | null;
  source_url: string | null;
  preview_url: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Album row extended with a single `album_service_links` row's columns,
 * used by queries that fan out albums-x-links and aggregate in code via
 * {@link buildCachedAlbumResult}.
 */
export interface AlbumWithLinkRow extends AlbumRow {
  link_url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Resolves an album by its canonical source URL.
 *
 * Joins `album_service_links` and `album_short_urls` for the album whose
 * `albums.source_url` matches. Returns null when no album matches.
 *
 * @param pool - Postgres connection pool.
 * @param url - Source URL recorded against the album.
 * @returns The cached album result with aggregated links, or null.
 */
export async function findAlbumByUrl(pool: Pool, url: string): Promise<CachedAlbumResult | null> {
  const result = await pool.query(
    `SELECT
      a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
      a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
      (SELECT ap.url FROM album_previews ap WHERE ap.album_id = a.id ORDER BY (ap.service = 'deezer') DESC, ap.observed_at DESC LIMIT 1) AS preview_url,
      asl.url as link_url, asl.service, asl.confidence, asl.match_method,
      asu.id as short_id, a.created_at, a.updated_at
    FROM albums a
    LEFT JOIN album_service_links asl ON a.id = asl.album_id
    LEFT JOIN album_short_urls asu ON a.id = asu.album_id
    WHERE a.source_url = $1
    ORDER BY asl.created_at ASC`,
    [url],
  );

  if (result.rows.length === 0) return null;
  return buildCachedAlbumResult(result.rows as AlbumWithLinkRow[]);
}

/**
 * Resolves an album by UPC, hitting the canonical column first and
 * falling back to the external-id aggregation table.
 *
 * The fast path uses the `albums.upc` column populated at persistence
 * time. The fallback catches alternate UPCs (regional re-issues)
 * recorded under `album_external_ids` by other services.
 *
 * @param pool - Postgres connection pool.
 * @param upc - UPC to resolve.
 * @returns The cached album result, or null when no album matches either path.
 */
export async function findAlbumByUpc(pool: Pool, upc: string): Promise<CachedAlbumResult | null> {
  const result = await pool.query(
    `SELECT
      a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
      a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
      (SELECT ap.url FROM album_previews ap WHERE ap.album_id = a.id ORDER BY (ap.service = 'deezer') DESC, ap.observed_at DESC LIMIT 1) AS preview_url,
      asl.url as link_url, asl.service, asl.confidence, asl.match_method,
      asu.id as short_id, a.created_at, a.updated_at
    FROM albums a
    LEFT JOIN album_service_links asl ON a.id = asl.album_id
    LEFT JOIN album_short_urls asu ON a.id = asu.album_id
    WHERE a.upc = $1
    ORDER BY asl.created_at ASC`,
    [upc],
  );

  if (result.rows.length > 0) {
    return buildCachedAlbumResult(result.rows as AlbumWithLinkRow[]);
  }

  return findAlbumByExternalId(pool, "upc", upc);
}

/**
 * Cheap existence check: returns the album-id and short-id for a given
 * UPC, used by persistence callers to dedup before insert.
 *
 * @param pool - Postgres connection pool.
 * @param upc - UPC to look up.
 * @returns `{ albumId, shortId }` when an album exists, otherwise null.
 */
export async function findExistingAlbumByUpc(
  pool: Pool,
  upc: string,
): Promise<{ albumId: string; shortId: string } | null> {
  const result = await pool.query(
    `SELECT a.id, asu.id as short_id
     FROM albums a
     LEFT JOIN album_short_urls asu ON a.id = asu.album_id
     WHERE a.upc = $1 LIMIT 1`,
    [upc],
  );

  if (result.rows.length === 0) return null;
  return {
    albumId: result.rows[0].id,
    shortId: result.rows[0].short_id,
  };
}

/**
 * Throw-only stub: the synchronous SQLite-era contract is not portable
 * to PostgreSQL because every query through `pg` is asynchronous.
 * Callers must use {@link findExistingAlbumByUpc} instead.
 *
 * @throws Always.
 */
export function findExistingAlbumByUpcSync(_upc: string): { albumId: string; shortId: string } | null {
  throw new Error("findExistingAlbumByUpcSync not available in PostgreSQL adapter");
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Transactional upsert of an album, its artist credits and its service
 * links.
 *
 * Dedup logic: looks up an existing album first by UPC (when set), then
 * by `source_url`. When either lookup hits, the existing album row is
 * updated in place (preserving its id and short-id); otherwise a fresh
 * album + short-id pair is inserted. Artist credits are replaced
 * wholesale via {@link replaceAlbumArtistCredits}. Service links are
 * upserted on `(album_id, service)`.
 *
 * Runs the whole sequence on a single client inside a `BEGIN` /
 * `COMMIT` block; any error rolls the transaction back.
 *
 * @param pool - Postgres connection pool.
 * @param data - Source-album payload plus link list.
 * @returns The resolved `albumId`, `shortId` and the freshly written credits.
 * @throws Query errors propagate after rollback.
 */
export async function persistAlbumWithLinks(
  pool: Pool,
  data: PersistAlbumData,
): Promise<{
  albumId: string;
  shortId: string;
  artistCredits: ArtistCredit[];
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const now = new Date();

    let existingAlbumId: string | null = null;
    let existingShortId: string | null = null;

    if (data.sourceAlbum.upc) {
      const found = await client.query(
        `SELECT a.id, su.id as short_id FROM albums a
         LEFT JOIN album_short_urls su ON a.id = su.album_id
         WHERE a.upc = $1 LIMIT 1`,
        [data.sourceAlbum.upc],
      );
      if (found.rows.length > 0) {
        existingAlbumId = found.rows[0].id;
        existingShortId = found.rows[0].short_id;
      }
    }

    if (!existingAlbumId && data.sourceAlbum.sourceUrl) {
      const found = await client.query(
        `SELECT a.id, su.id as short_id FROM albums a
         LEFT JOIN album_short_urls su ON a.id = su.album_id
         WHERE a.source_url = $1 LIMIT 1`,
        [data.sourceAlbum.sourceUrl],
      );
      if (found.rows.length > 0) {
        existingAlbumId = found.rows[0].id;
        existingShortId = found.rows[0].short_id;
      }
    }

    const albumId = existingAlbumId ?? generateTrackId();
    const shortId = existingShortId ?? generateShortId();

    if (existingAlbumId) {
      await client.query(
        `UPDATE albums SET
          title = $2, release_date = $3, total_tracks = $4,
          artwork_url = $5, label = $6, updated_at = $7
        WHERE id = $1`,
        [
          albumId,
          data.sourceAlbum.title,
          data.sourceAlbum.releaseDate ?? null,
          data.sourceAlbum.totalTracks ?? null,
          data.sourceAlbum.artworkUrl ?? null,
          data.sourceAlbum.label ?? null,
          now,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO albums (
          id, title, release_date, total_tracks, artwork_url,
          label, upc, source_service, source_url,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          albumId,
          data.sourceAlbum.title,
          data.sourceAlbum.releaseDate ?? null,
          data.sourceAlbum.totalTracks ?? null,
          data.sourceAlbum.artworkUrl ?? null,
          data.sourceAlbum.label ?? null,
          data.sourceAlbum.upc ?? null,
          data.sourceAlbum.sourceService ?? null,
          data.sourceAlbum.sourceUrl ?? null,
          now,
          now,
        ],
      );
    }

    const artistCredits = await replaceAlbumArtistCredits(
      client,
      albumId,
      data.sourceAlbum.artists,
      now,
      data.sourceAlbum.artistCredits,
    );

    for (const link of data.links) {
      await client.query(
        `INSERT INTO album_service_links (
          id, album_id, service, external_id, url, confidence, match_method, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (album_id, service) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          url = EXCLUDED.url,
          confidence = EXCLUDED.confidence`,
        [
          `${albumId}-${link.service}`,
          albumId,
          link.service,
          link.externalId ?? null,
          link.url,
          link.confidence,
          link.matchMethod,
          now,
        ],
      );
    }

    if (!existingShortId) {
      await client.query(
        `INSERT INTO album_short_urls (id, album_id, created_at) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [shortId, albumId, now],
      );
    }

    await client.query("COMMIT");
    return { albumId, shortId, artistCredits };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Adds (or updates) service links for an existing album, transactional.
 *
 * Each link is upserted on `(album_id, service)`. Existing rows are
 * patched, never duplicated. The whole sequence runs inside a single
 * `BEGIN` / `COMMIT` block.
 *
 * @param pool - Postgres connection pool.
 * @param albumId - Album that receives the links.
 * @param links - Service-link records to upsert.
 * @throws Query errors propagate after rollback.
 */
export async function addLinksToAlbum(
  pool: Pool,
  albumId: string,
  links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();

    for (const link of links) {
      await client.query(
        `INSERT INTO album_service_links (
          id, album_id, service, external_id, url, confidence, match_method, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (album_id, service) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          url = EXCLUDED.url,
          confidence = EXCLUDED.confidence`,
        [
          `${albumId}-${link.service}`,
          albumId,
          link.service,
          link.externalId ?? null,
          link.url,
          link.confidence,
          link.matchMethod,
          now,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Inserts or replaces the cached Discogs vinyl layout for an album.
 *
 * A `null` layout records a negative cache entry, meaning the album was
 * checked but has no suitable vinyl pressing.
 *
 * @param pool - Postgres connection pool.
 * @param albumId - Album whose layout cache is written.
 * @param layout - Normalized Discogs layout, or `null` for a negative cache.
 */
export async function upsertAlbumVinylLayout(pool: Pool, albumId: string, layout: VinylLayout | null): Promise<void> {
  await pool.query(
    `INSERT INTO album_vinyl_layouts (id, album_id, discogs_release_id, layout_data, fetched_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (album_id) DO UPDATE SET
       discogs_release_id = EXCLUDED.discogs_release_id,
       layout_data = EXCLUDED.layout_data,
       fetched_at = EXCLUDED.fetched_at`,
    [generateTrackId(), albumId, layout?.discogsReleaseId ?? null, layout, new Date()],
  );
}

/**
 * Reads an album's cached Discogs vinyl layout.
 *
 * @param pool - Postgres connection pool.
 * @param albumId - Album whose layout cache is read.
 * @returns The positive layout, `null` for a negative cache, or `undefined`
 * when the album has never been checked.
 */
export async function readAlbumVinylLayout(pool: Pool, albumId: string): Promise<VinylLayout | null | undefined> {
  const result = await pool.query(`SELECT layout_data FROM album_vinyl_layouts WHERE album_id = $1`, [albumId]);
  if (result.rows.length === 0) return undefined;
  return result.rows[0].layout_data as VinylLayout | null;
}

// ============================================================================
// EXTERNAL-ID INGESTION (migration 0019)
// ============================================================================

/**
 * Records external-id observations against an album. No-op on empty input.
 *
 * @param pool - Postgres connection pool.
 * @param albumId - Album that receives the observations.
 * @param records - External-id records to upsert.
 */
export async function addAlbumExternalIds(pool: Pool, albumId: string, records: ExternalIdRecord[]): Promise<void> {
  if (records.length === 0) return;
  await insertExternalIds(pool, "album_external_ids", "album_id", albumId, records);
}

/**
 * Resolves an album via the external-id catalogue, returning the cached
 * result with aggregated links.
 *
 * @param pool - Postgres connection pool.
 * @param idType - External-id type (`"upc"`, `"spotify_id"`, ...).
 * @param idValue - Value to look up.
 * @returns The cached album result, or null when no album matches.
 */
export async function findAlbumByExternalId(
  pool: Pool,
  idType: string,
  idValue: string,
): Promise<CachedAlbumResult | null> {
  const result = await pool.query(
    `SELECT
      a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
      a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
      (SELECT ap.url FROM album_previews ap WHERE ap.album_id = a.id ORDER BY (ap.service = 'deezer') DESC, ap.observed_at DESC LIMIT 1) AS preview_url,
      asl.url as link_url, asl.service, asl.confidence, asl.match_method,
      asu.id as short_id, a.created_at, a.updated_at
    FROM albums a
    JOIN album_external_ids x ON x.album_id = a.id
    LEFT JOIN album_service_links asl ON a.id = asl.album_id
    LEFT JOIN album_short_urls asu ON a.id = asu.album_id
    WHERE x.id_type = $1 AND x.id_value = $2
    ORDER BY asl.created_at ASC`,
    [idType, idValue],
  );

  if (result.rows.length === 0) return null;
  return buildCachedAlbumResult(result.rows as AlbumWithLinkRow[]);
}

// ============================================================================
// PREVIEW URLS (migration 0021)
// ============================================================================

/**
 * Returns all per-service preview-URL observations recorded for an album.
 *
 * @param pool - Postgres connection pool.
 * @param albumId - Album whose previews are listed.
 * @returns Preview rows, in arbitrary order.
 */
export async function findAlbumPreviews(pool: Pool, albumId: string): Promise<PreviewRow[]> {
  const result = await pool.query(
    `SELECT service, url, expires_at, observed_at
     FROM album_previews
     WHERE album_id = $1`,
    [albumId],
  );
  return (result.rows as Array<{ service: string; url: string; expires_at: Date | null; observed_at: Date }>).map(
    (r) => ({
      service: r.service,
      url: r.url,
      expiresAt: r.expires_at,
      observedAt: r.observed_at,
    }),
  );
}

/**
 * Upserts a preview-URL observation for an album on `(album_id, service)`.
 *
 * Existing rows have their URL, expiry and observation timestamp
 * overwritten with the latest values.
 *
 * @param pool - Postgres connection pool.
 * @param albumId - Album receiving the observation.
 * @param observation - Preview details to record.
 */
export async function upsertAlbumPreview(pool: Pool, albumId: string, observation: PreviewObservation): Promise<void> {
  const now = new Date();
  await pool.query(
    `INSERT INTO album_previews (id, album_id, service, url, expires_at, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (album_id, service) DO UPDATE SET
       url = EXCLUDED.url,
       expires_at = EXCLUDED.expires_at,
       observed_at = EXCLUDED.observed_at`,
    [
      `${albumId}-${observation.service}`,
      albumId,
      observation.service,
      observation.url,
      observation.expiresAt ?? null,
      now,
    ],
  );
}

// ============================================================================
// SHARE-PAGE LOADING
// ============================================================================

/**
 * Loads the full share-page projection for an album addressed by its
 * short-id, with a minimal `(url, service)` link list.
 *
 * @param pool - Postgres connection pool.
 * @param shortId - Public short-id from `album_short_urls`.
 * @returns The share-page projection, or null when no album matches.
 */
export async function loadAlbumByShortId(pool: Pool, shortId: string): Promise<SharePageAlbumResult | null> {
  const result = await pool.query(
    `SELECT
      a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
      a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
      (SELECT ap.url FROM album_previews ap WHERE ap.album_id = a.id ORDER BY (ap.service = 'deezer') DESC, ap.observed_at DESC LIMIT 1) AS preview_url,
      asl.url as link_url, asl.service,
      asu.id as short_id
    FROM albums a
    JOIN album_short_urls asu ON a.id = asu.album_id
    LEFT JOIN album_service_links asl ON a.id = asl.album_id
    WHERE asu.id = $1`,
    [shortId],
  );

  if (result.rows.length === 0) return null;

  const firstRow = result.rows[0] as AlbumWithLinkRow;
  const artists = safeParseArray(firstRow.artists);
  const artistCredits = safeParseArtistCredits(firstRow.artist_credits);
  const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

  return {
    album: rowToAlbum(firstRow),
    artists,
    artistCredits,
    links: (result.rows as AlbumWithLinkRow[])
      .filter((r) => r.link_url && r.service)
      .map((r) => ({
        service: r.service as string,
        url: r.link_url as string,
      })),
    shortId,
    artistDisplay,
  };
}

// ============================================================================
// RESULT BUILDERS
// ============================================================================

/**
 * Aggregates the rows of an album-x-link join into a single cached album
 * result, deduplicating links by service (last write wins).
 *
 * Returns null when the input is empty.
 *
 * @param rows - Albums-x-links rows from an album resolution query.
 * @returns The cached album result, or null.
 */
export function buildCachedAlbumResult(rows: AlbumWithLinkRow[]): CachedAlbumResult | null {
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const album = rowToNormalizedAlbum(firstRow);
  const albumId = firstRow.id;

  const links = [
    ...new Map(
      rows
        .filter((r) => r.link_url && r.service)
        .map((r) => [
          r.service,
          {
            service: r.service!,
            url: r.link_url!,
            confidence: r.confidence ?? 0,
            matchMethod: r.match_method ?? "cache",
          },
        ]),
    ).values(),
  ];

  return {
    albumId,
    album,
    links,
    updatedAt: dateToMs(firstRow.updated_at),
  };
}

/**
 * Maps a raw `AlbumRow` to the slimmer share-page album shape used by
 * {@link loadAlbumByShortId}.
 *
 * @param row - Raw album row.
 */
export function rowToAlbum(row: AlbumRow): SharePageAlbumResult["album"] {
  return {
    title: row.title,
    artworkUrl: row.artwork_url,
    releaseDate: row.release_date,
    totalTracks: row.total_tracks,
    label: row.label,
    upc: row.upc,
    previewUrl: row.preview_url ?? null,
  };
}

/**
 * Maps a raw `AlbumRow` to the normalised public {@link NormalizedAlbum}
 * shape used across the service layer.
 *
 * @param row - Raw album row from any album-bearing SELECT.
 */
export function rowToNormalizedAlbum(row: AlbumRow): NormalizedAlbum {
  return {
    sourceService: (row.source_service as TrackSource) ?? "cached",
    sourceId: row.id,
    title: row.title,
    artists: safeParseArray(row.artists),
    artistCredits: safeParseArtistCredits(row.artist_credits),
    releaseDate: row.release_date ?? undefined,
    totalTracks: row.total_tracks ?? undefined,
    artworkUrl: row.artwork_url ?? undefined,
    label: row.label ?? undefined,
    upc: row.upc ?? undefined,
    webUrl: row.source_url ?? "",
    topTrackPreviewUrl: row.preview_url ?? undefined,
  };
}
