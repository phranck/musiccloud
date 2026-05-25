/**
 * Track domain: resolve, persist and aggregate metadata for individual
 * tracks plus their service-link fan-out.
 *
 * Scope:
 *   - Resolution by canonical URL, ISRC, external-id catalogue, free-text.
 *   - Persistence with ISRC / URL dedup, transactional credit replacement
 *     and short-URL assignment.
 *   - External-id ingestion (migration `0019`) and per-service preview
 *     URL recording (migration `0021`).
 *   - Share-page projection for the legacy public track endpoint.
 *
 * Excludes:
 *   - Admin CRUD on tracks (see `postgres-admin-catalog.ts`).
 *   - Album / artist resolution and persistence (see `postgres-albums.ts`,
 *     `postgres-artists.ts`).
 *   - Cross-domain persistence helpers like `insertExternalIds` and
 *     `replaceTrackArtistCredits` (see `postgres-shared.ts`).
 */

import type { Pool } from "pg";
import { log } from "../../lib/infra/logger.js";
import { generateShortId, generateTrackId } from "../../lib/short-id.js";
import type { NormalizedTrack, TrackSource } from "../../services/types.js";
import type {
  ArtistCredit,
  CachedTrackResult,
  ExternalIdRecord,
  PersistTrackData,
  PreviewObservation,
  PreviewRow,
  SharePageDbResult,
} from "../repository.js";
import {
  dateToMs,
  insertExternalIds,
  replaceTrackArtistCredits,
  safeParseArray,
  safeParseArtistCredits,
  TRACK_ARTIST_FIELDS_SELECT,
} from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/**
 * Raw shape returned by every track-bearing SELECT in this module
 * (without a service-link join).
 */
export interface TrackRow {
  id: string;
  title: string;
  artists: string;
  artist_credits: string;
  album_name: string | null;
  isrc: string | null;
  artwork_url: string | null;
  duration_ms: number | null;
  release_date: string | null;
  is_explicit: number | null;
  preview_url: string | null;
  source_service: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Track row extended with a single `service_links` row's columns, used
 * by queries that fan out tracks-x-links and aggregate in code via
 * {@link buildCachedResult} / {@link buildSharePageResult}.
 */
export interface TrackWithLinkRow extends TrackRow {
  url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Resolves a track by any of its known service URLs.
 *
 * Joins `service_links` and `short_urls` for the canonical-URL match
 * stored on `tracks.source_url`. Returns null when no track matches.
 *
 * @param pool - Postgres connection pool.
 * @param url - Source URL recorded against the track.
 * @returns The cached track result with aggregated links, or null.
 */
export async function findTrackByUrl(pool: Pool, url: string): Promise<CachedTrackResult | null> {
  const result = await pool.query(
    `SELECT
      t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
      t.duration_ms, t.release_date, t.is_explicit,
      (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
      t.source_service, t.source_url,
      sl.url, sl.service, sl.confidence, sl.match_method,
      su.id as short_id, t.created_at, t.updated_at
    FROM tracks t
    LEFT JOIN service_links sl ON t.id = sl.track_id
    LEFT JOIN short_urls su ON t.id = su.track_id
    WHERE t.source_url = $1
    ORDER BY sl.created_at ASC`,
    [url],
  );

  if (result.rows.length === 0) return null;
  return buildCachedResult(result.rows as TrackWithLinkRow[]);
}

/**
 * Resolves a track by ISRC, hitting the canonical column first and
 * falling back to the external-id aggregation table.
 *
 * The fast path uses the single-column `idx_tracks_isrc` index because
 * most tracks have their primary ISRC stored there from persistence
 * time. The fallback path catches regional-variant ISRCs that a
 * different service reported during a prior cross-service resolve but
 * are not the canonical value on `tracks.isrc`.
 *
 * @param pool - Postgres connection pool.
 * @param isrc - ISRC to resolve.
 * @returns The cached track result, or null when no track matches either path.
 */
export async function findTrackByIsrc(pool: Pool, isrc: string): Promise<CachedTrackResult | null> {
  const result = await pool.query(
    `SELECT
      t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
      t.duration_ms, t.release_date, t.is_explicit,
      (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
      t.source_service, t.source_url,
      sl.url, sl.service, sl.confidence, sl.match_method,
      su.id as short_id, t.created_at, t.updated_at
    FROM tracks t
    LEFT JOIN service_links sl ON t.id = sl.track_id
    LEFT JOIN short_urls su ON t.id = su.track_id
    WHERE t.isrc = $1
    ORDER BY sl.created_at ASC`,
    [isrc],
  );

  if (result.rows.length > 0) {
    return buildCachedResult(result.rows as TrackWithLinkRow[]);
  }

  return findTrackByExternalId(pool, "isrc", isrc);
}

/**
 * Free-text resolver that matches each whitespace-separated word against
 * either the track title or any of its artist credits.
 *
 * Used as a last-resort search; query errors are swallowed (and logged)
 * to keep upstream callers from breaking on transient database errors.
 *
 * @param pool - Postgres connection pool.
 * @param query - Free text search query.
 * @param maxResults - Hard cap on returned tracks. Defaults to 10.
 * @returns The matching normalised tracks, ordered by most-recently-updated.
 */
export async function findTracksByTextSearch(
  pool: Pool,
  query: string,
  maxResults: number = 10,
): Promise<NormalizedTrack[]> {
  const results: NormalizedTrack[] = [];

  try {
    const words = query
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) {
      return [];
    }

    const whereClauses = words
      .map(
        (_, i) =>
          `(t.title ILIKE $${i + 1} OR EXISTS (SELECT 1 FROM track_artist_credits tac WHERE tac.track_id = t.id AND tac.credit_name ILIKE $${i + 1}))`,
      )
      .join(" OR ");
    const params: (string | number)[] = words.map((w) => `%${w}%`);
    params.push(maxResults);

    const searchResult = await pool.query(
      `SELECT
        t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit,
      (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
        t.source_service, t.source_url,
        t.created_at, t.updated_at
      FROM tracks t
      WHERE ${whereClauses}
      ORDER BY t.updated_at DESC
      LIMIT $${words.length + 1}`,
      params,
    );

    const rows = searchResult.rows as TrackRow[];

    for (const row of rows) {
      results.push(rowToTrack(row));
    }
  } catch (error) {
    log.error("PG", "Text search error:", error);
  }

  return results;
}

/**
 * Returns the short-id assigned to the given track URL, or null.
 *
 * @param pool - Postgres connection pool.
 * @param url - Source URL recorded against the track.
 */
export async function findShortIdByTrackUrl(pool: Pool, url: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT su.id FROM short_urls su
     JOIN tracks t ON su.track_id = t.id
     WHERE t.source_url = $1 LIMIT 1`,
    [url],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Cheap existence check: returns the track-id and short-id for a given
 * ISRC, used by persistence callers to dedup before insert.
 *
 * @param pool - Postgres connection pool.
 * @param isrc - ISRC to look up.
 * @returns `{ trackId, shortId }` when a track exists, otherwise null.
 */
export async function findExistingByIsrc(
  pool: Pool,
  isrc: string,
): Promise<{ trackId: string; shortId: string } | null> {
  const result = await pool.query(
    `SELECT t.id, su.id as short_id
     FROM tracks t
     LEFT JOIN short_urls su ON t.id = su.track_id
     WHERE t.isrc = $1 LIMIT 1`,
    [isrc],
  );

  if (result.rows.length === 0) return null;
  return {
    trackId: result.rows[0].id,
    shortId: result.rows[0].short_id,
  };
}

/**
 * Throw-only stub: the synchronous SQLite-era contract is not portable
 * to PostgreSQL because every query through `pg` is asynchronous.
 * Callers must use {@link findExistingByIsrc} instead.
 *
 * @throws Always.
 */
export function findExistingByIsrcSync(_isrc: string): { trackId: string; shortId: string } | null {
  throw new Error("findExistingByIsrcSync not available in PostgreSQL adapter. Use findExistingByIsrc instead.");
}

/**
 * Loads the full share-page projection for a track addressed by its
 * short-id, including aggregated service links and the canonical
 * preview URL.
 *
 * @param pool - Postgres connection pool.
 * @param shortId - Public short-id from `short_urls`.
 * @returns The share-page projection, or null when no track matches.
 */
export async function loadByShortId(pool: Pool, shortId: string): Promise<SharePageDbResult | null> {
  const result = await pool.query(
    `SELECT
      t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
      t.duration_ms, t.release_date, t.is_explicit,
      (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
      t.source_service, t.source_url,
      sl.url, sl.service, sl.confidence, sl.match_method,
      su.id as short_id, t.created_at, t.updated_at
    FROM tracks t
    JOIN short_urls su ON t.id = su.track_id
    LEFT JOIN service_links sl ON t.id = sl.track_id
    WHERE su.id = $1
    ORDER BY sl.created_at ASC`,
    [shortId],
  );

  if (result.rows.length === 0) return null;
  return buildSharePageResult(result.rows as TrackWithLinkRow[]);
}

/**
 * Loads the full share-page projection for a track addressed by its
 * primary id.
 *
 * @param pool - Postgres connection pool.
 * @param trackId - Internal track id.
 * @returns The share-page projection, or null when no track matches.
 */
export async function loadByTrackId(pool: Pool, trackId: string): Promise<SharePageDbResult | null> {
  const result = await pool.query(
    `SELECT
      t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
      t.duration_ms, t.release_date, t.is_explicit,
      (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
      t.source_service, t.source_url,
      sl.url, sl.service, sl.confidence, sl.match_method,
      su.id as short_id, t.created_at, t.updated_at
    FROM tracks t
    LEFT JOIN service_links sl ON t.id = sl.track_id
    LEFT JOIN short_urls su ON t.id = su.track_id
    WHERE t.id = $1
    ORDER BY sl.created_at ASC`,
    [trackId],
  );

  if (result.rows.length === 0) return null;
  return buildSharePageResult(result.rows as TrackWithLinkRow[]);
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Transactional upsert of a track, its artist credits and its service
 * links.
 *
 * Dedup logic: looks up an existing track first by ISRC (when set), then
 * by `source_url`. When either lookup hits, the existing track row is
 * updated in place (preserving its id and short-id); otherwise a fresh
 * track + short-id pair is inserted. Artist credits are replaced
 * wholesale via {@link replaceTrackArtistCredits}. Service links are
 * upserted on `(track_id, service)`.
 *
 * Runs the whole sequence on a single client inside a `BEGIN` /
 * `COMMIT` block; any error rolls the transaction back.
 *
 * @param pool - Postgres connection pool.
 * @param data - Source-track payload plus link list.
 * @returns The resolved `trackId`, `shortId` and the freshly written credits.
 * @throws Query errors propagate after rollback.
 */
export async function persistTrackWithLinks(
  pool: Pool,
  data: PersistTrackData,
): Promise<{
  trackId: string;
  shortId: string;
  artistCredits: ArtistCredit[];
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const now = new Date();

    let existingTrackId: string | null = null;
    let existingShortId: string | null = null;

    if (data.sourceTrack.isrc) {
      const found = await client.query(
        `SELECT t.id, su.id as short_id FROM tracks t
         LEFT JOIN short_urls su ON t.id = su.track_id
         WHERE t.isrc = $1 LIMIT 1`,
        [data.sourceTrack.isrc],
      );
      if (found.rows.length > 0) {
        existingTrackId = found.rows[0].id;
        existingShortId = found.rows[0].short_id;
      }
    }

    if (!existingTrackId && data.sourceTrack.sourceUrl) {
      const found = await client.query(
        `SELECT t.id, su.id as short_id FROM tracks t
         LEFT JOIN short_urls su ON t.id = su.track_id
         WHERE t.source_url = $1 LIMIT 1`,
        [data.sourceTrack.sourceUrl],
      );
      if (found.rows.length > 0) {
        existingTrackId = found.rows[0].id;
        existingShortId = found.rows[0].short_id;
      }
    }

    const trackId = existingTrackId ?? generateTrackId();
    const shortId = existingShortId ?? generateShortId();

    if (existingTrackId) {
      await client.query(
        `UPDATE tracks SET
          title = $2, album_name = $3, artwork_url = $4,
          duration_ms = $5, release_date = $6, is_explicit = $7,
          updated_at = $8
        WHERE id = $1`,
        [
          trackId,
          data.sourceTrack.title,
          data.sourceTrack.albumName ?? null,
          data.sourceTrack.artworkUrl ?? null,
          data.sourceTrack.durationMs ?? null,
          data.sourceTrack.releaseDate ?? null,
          data.sourceTrack.isExplicit ? 1 : 0,
          now,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO tracks (
          id, title, album_name, isrc, artwork_url, duration_ms,
          release_date, is_explicit, source_service, source_url,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          trackId,
          data.sourceTrack.title,
          data.sourceTrack.albumName ?? null,
          data.sourceTrack.isrc ?? null,
          data.sourceTrack.artworkUrl ?? null,
          data.sourceTrack.durationMs ?? null,
          data.sourceTrack.releaseDate ?? null,
          data.sourceTrack.isExplicit ? 1 : 0,
          data.sourceTrack.sourceService ?? null,
          data.sourceTrack.sourceUrl ?? null,
          now,
          now,
        ],
      );
    }

    const artistCredits = await replaceTrackArtistCredits(
      client,
      trackId,
      data.sourceTrack.artists,
      now,
      data.sourceTrack.artistCredits,
    );

    for (const link of data.links) {
      await client.query(
        `INSERT INTO service_links (
          id, track_id, service, external_id, url, confidence, match_method, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (track_id, service) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          url = EXCLUDED.url,
          confidence = EXCLUDED.confidence,
          match_method = EXCLUDED.match_method`,
        [
          `${trackId}-${link.service}`,
          trackId,
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
        `INSERT INTO short_urls (id, track_id, created_at) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [shortId, trackId, now],
      );
    }

    await client.query("COMMIT");
    return { trackId, shortId, artistCredits };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Adds (or updates) service links for an existing track, transactional.
 *
 * Each link is upserted on `(track_id, service)`. Existing rows are
 * patched, never duplicated. The whole sequence runs inside a single
 * `BEGIN` / `COMMIT` block.
 *
 * @param pool - Postgres connection pool.
 * @param trackId - Track that receives the links.
 * @param links - Service-link records to upsert.
 * @throws Query errors propagate after rollback.
 */
export async function addLinksToTrack(
  pool: Pool,
  trackId: string,
  links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();

    for (const link of links) {
      await client.query(
        `INSERT INTO service_links (
          id, track_id, service, external_id, url, confidence, match_method, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (track_id, service) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          url = EXCLUDED.url,
          confidence = EXCLUDED.confidence`,
        [
          `${trackId}-${link.service}`,
          trackId,
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

// ============================================================================
// EXTERNAL-ID INGESTION (migration 0019)
// ============================================================================

/**
 * Records external-id observations against a track. No-op on empty input.
 *
 * @param pool - Postgres connection pool.
 * @param trackId - Track that receives the observations.
 * @param records - External-id records to upsert.
 */
export async function addTrackExternalIds(pool: Pool, trackId: string, records: ExternalIdRecord[]): Promise<void> {
  if (records.length === 0) return;
  await insertExternalIds(pool, "track_external_ids", "track_id", trackId, records);
}

/**
 * Resolves a track via the external-id catalogue, returning the cached
 * result with aggregated links.
 *
 * @param pool - Postgres connection pool.
 * @param idType - External-id type (`"isrc"`, `"spotify_id"`, ...).
 * @param idValue - Value to look up.
 * @returns The cached track result, or null when no track matches.
 */
export async function findTrackByExternalId(
  pool: Pool,
  idType: string,
  idValue: string,
): Promise<CachedTrackResult | null> {
  const result = await pool.query(
    `SELECT
      t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
      t.duration_ms, t.release_date, t.is_explicit,
      (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
      t.source_service, t.source_url,
      sl.url, sl.service, sl.confidence, sl.match_method,
      su.id as short_id, t.created_at, t.updated_at
    FROM tracks t
    JOIN track_external_ids x ON x.track_id = t.id
    LEFT JOIN service_links sl ON t.id = sl.track_id
    LEFT JOIN short_urls su ON t.id = su.track_id
    WHERE x.id_type = $1 AND x.id_value = $2
    ORDER BY sl.created_at ASC`,
    [idType, idValue],
  );

  if (result.rows.length === 0) return null;
  return buildCachedResult(result.rows as TrackWithLinkRow[]);
}

// ============================================================================
// PREVIEW URLS (migration 0021)
// ============================================================================

/**
 * Returns all per-service preview-URL observations recorded for a track.
 *
 * @param pool - Postgres connection pool.
 * @param trackId - Track whose previews are listed.
 * @returns Preview rows, in arbitrary order.
 */
export async function findTrackPreviews(pool: Pool, trackId: string): Promise<PreviewRow[]> {
  const result = await pool.query(
    `SELECT service, url, expires_at, observed_at
     FROM track_previews
     WHERE track_id = $1`,
    [trackId],
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
 * Upserts a preview-URL observation for a track on `(track_id, service)`.
 *
 * Existing rows have their URL, expiry and observation timestamp
 * overwritten with the latest values.
 *
 * @param pool - Postgres connection pool.
 * @param trackId - Track receiving the observation.
 * @param observation - Preview details to record.
 */
export async function upsertTrackPreview(pool: Pool, trackId: string, observation: PreviewObservation): Promise<void> {
  const now = new Date();
  await pool.query(
    `INSERT INTO track_previews (id, track_id, service, url, expires_at, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (track_id, service) DO UPDATE SET
       url = EXCLUDED.url,
       expires_at = EXCLUDED.expires_at,
       observed_at = EXCLUDED.observed_at`,
    [
      `${trackId}-${observation.service}`,
      trackId,
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
 * Legacy track-share endpoint loader: returns the share-page projection
 * for a track addressed by its short-id, with a minimal `(url, service)`
 * link list (no confidence / match-method).
 *
 * Kept for backwards compatibility; new callers should prefer
 * {@link loadByShortId}.
 *
 * @param pool - Postgres connection pool.
 * @param shortId - Public short-id from `short_urls`.
 * @returns The share-page projection, or null when no track matches.
 */
export async function loadSharePageResult(pool: Pool, shortId: string): Promise<SharePageDbResult | null> {
  const result = await pool.query(
    `SELECT
      t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
      t.duration_ms, t.release_date, t.is_explicit,
      (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
      t.source_service, t.source_url,
      sl.url, sl.service,
      su.id as short_id
    FROM tracks t
    JOIN short_urls su ON t.id = su.track_id
    LEFT JOIN service_links sl ON t.id = sl.track_id
    WHERE su.id = $1`,
    [shortId],
  );

  if (result.rows.length === 0) return null;

  const firstRow = result.rows[0] as TrackWithLinkRow;
  const artists = safeParseArray(firstRow.artists);
  const artistCredits = safeParseArtistCredits(firstRow.artist_credits);
  const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

  return {
    trackId: firstRow.id,
    track: rowToSharePageTrack(firstRow),
    artists,
    artistCredits,
    links: (result.rows as TrackWithLinkRow[])
      .filter((r) => r.url && r.service)
      .map((r) => ({
        service: r.service as string,
        url: r.url as string,
      })),
    shortId,
    artistDisplay,
  };
}

// ============================================================================
// RESULT BUILDERS
// ============================================================================

/**
 * Aggregates the rows of a track-x-link join into a single cached track
 * result, deduplicating links by service (last write wins).
 *
 * Returns null when the input is empty.
 *
 * @param rows - Tracks-x-links rows from a track resolution query.
 * @returns The cached track result, or null.
 */
export function buildCachedResult(rows: TrackWithLinkRow[]): CachedTrackResult | null {
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const track = rowToTrack(firstRow);
  const trackId = firstRow.id;

  const links = [
    ...new Map(
      rows
        .filter((r) => r.url && r.service)
        .map((r) => [
          r.service,
          {
            service: r.service!,
            url: r.url!,
            confidence: r.confidence ?? 0,
            matchMethod: r.match_method ?? "cache",
          },
        ]),
    ).values(),
  ];

  return {
    trackId,
    track,
    links,
    updatedAt: dateToMs(firstRow.updated_at),
  };
}

/**
 * Aggregates track-x-link rows into the share-page projection.
 *
 * Returns null when the input is empty.
 *
 * @param rows - Tracks-x-links rows from a share-page query.
 * @returns The share-page projection, or null.
 */
export function buildSharePageResult(rows: TrackWithLinkRow[]): SharePageDbResult | null {
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const artists = safeParseArray(firstRow.artists);
  const artistCredits = safeParseArtistCredits(firstRow.artist_credits);
  const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

  return {
    trackId: firstRow.id,
    track: rowToSharePageTrack(firstRow),
    artists,
    artistCredits,
    links: rows
      .filter((r) => r.url && r.service)
      .map((r) => ({
        service: r.service!,
        url: r.url!,
      })),
    shortId: firstRow.short_id ?? "",
    artistDisplay,
  };
}

/**
 * Maps a raw `TrackRow` to the normalised public {@link NormalizedTrack}
 * shape used across the service layer.
 *
 * @param row - Raw track row from any track-bearing SELECT.
 */
export function rowToTrack(row: TrackRow): NormalizedTrack {
  return {
    sourceService: (row.source_service as TrackSource) ?? "cached",
    sourceId: row.id,
    title: row.title,
    artists: safeParseArray(row.artists),
    artistCredits: safeParseArtistCredits(row.artist_credits),
    albumName: row.album_name ?? undefined,
    isrc: row.isrc ?? undefined,
    artworkUrl: row.artwork_url ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    releaseDate: row.release_date ?? undefined,
    isExplicit: !!row.is_explicit,
    previewUrl: row.preview_url ?? undefined,
    webUrl: row.source_url ?? "",
  };
}

/**
 * Maps a raw `TrackRow` to the slimmer share-page track shape used by
 * {@link buildSharePageResult} and {@link loadSharePageResult}.
 *
 * @param row - Raw track row.
 */
export function rowToSharePageTrack(row: TrackRow): SharePageDbResult["track"] {
  return {
    title: row.title,
    albumName: row.album_name,
    artworkUrl: row.artwork_url,
    durationMs: row.duration_ms,
    isrc: row.isrc,
    releaseDate: row.release_date,
    isExplicit: !!row.is_explicit,
    previewUrl: row.preview_url,
  };
}
