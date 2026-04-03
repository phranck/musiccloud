import * as pgModule from "pg";
import { CACHE_TTL_MS } from "../../lib/config.js";
import { adminEventBroadcaster } from "../../lib/event-broadcaster.js";
import { log } from "../../lib/infra/logger.js";
import { generateShortId, generateTrackId } from "../../lib/short-id.js";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack, TrackSource } from "../../services/types.js";
import type {
  AdminRepository,
  AdminUser,
  AlbumListItem,
  ArtistListItem,
  ListResult,
  TrackListItem,
} from "../admin-repository.js";
import type {
  ArtistCacheData,
  ArtistCacheRow,
  CachedAlbumResult,
  CachedArtistResult,
  CachedTrackResult,
  PersistAlbumData,
  PersistArtistData,
  PersistTrackData,
  SharePageAlbumResult,
  SharePageArtistResult,
  SharePageDbResult,
  TrackRepository,
} from "../repository.js";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TrackRow {
  id: string;
  title: string;
  artists: string;
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

interface TrackWithLinkRow extends TrackRow {
  url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

interface AlbumRow {
  id: string;
  title: string;
  artists: string;
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

interface AlbumWithLinkRow extends AlbumRow {
  link_url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  locale: string;
  invite_token_hash: string | null;
  invite_expires_at: Date | null;
  session_timeout_minutes: number | null;
  created_at: Date;
  last_login_at: Date | null;
}

interface CountRow {
  count: number;
}

interface ServiceLinkRow {
  service: string;
  url: string;
}

interface TrackListRow {
  id: string;
  title: string;
  artists: string;
  album_name: string | null;
  isrc: string | null;
  artwork_url: string | null;
  source_service: string | null;
  created_at: Date;
  short_id: string | null;
  link_count: string;
  is_featured: boolean;
}

interface AlbumListRow {
  id: string;
  title: string;
  artists: string;
  release_date: string | null;
  total_tracks: number | null;
  artwork_url: string | null;
  upc: string | null;
  source_service: string | null;
  created_at: Date;
  short_id: string | null;
  link_count: string;
  is_featured: boolean;
}

interface ArtistRow {
  id: string;
  name: string;
  image_url: string | null;
  genres: string | null;
  source_service: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ArtistWithLinkRow extends ArtistRow {
  link_url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

interface ArtistCacheRow_DB {
  artist_name: string;
  top_tracks: string | null;
  profile: string | null;
  events: string | null;
  tracks_updated_at: Date | null;
  profile_updated_at: Date | null;
  events_updated_at: Date | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safeParseArray(json: string, fallback: string[] = []): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Convert Date to milliseconds for compatibility with sqlite.ts interface
function dateToMs(date: Date | null | undefined): number {
  return date ? date.getTime() : 0;
}

// Convert milliseconds to Date
function msToDate(ms: number): Date {
  return new Date(ms * 1000);
}

// ============================================================================
// POSTGRES ADAPTER
// ============================================================================

export class PostgresAdapter implements TrackRepository, AdminRepository {
  private pool: pgModule.Pool;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(connectionUrl: string) {
    this.pool = new pgModule.Pool({
      connectionString: connectionUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on("error", (err) => {
      log.error("PG", "Unexpected error on idle client:", err);
    });
  }

  /**
   * Initialize database schema (run migrations on startup)
   * For Drizzle, migrations are applied separately via CLI.
   * This just verifies the schema exists.
   */
  async ensureSchema(): Promise<void> {
    try {
      const result = await this.pool.query(`SELECT to_regclass('public.tracks') IS NOT NULL as exists`);
      if (!result.rows[0]?.exists) {
        throw new Error(
          "Database schema not initialized. Run: npx drizzle-kit migrate --config drizzle.config.postgres.ts",
        );
      }
      log.debug("PG", "Schema verification passed");
    } catch (error) {
      log.error("PG", "Schema check failed:", error);
      throw error;
    }
  }

  /**
   * Schedule cache cleanup every 6 hours
   */
  scheduleCleanup(): void {
    this.cleanupInterval = setInterval(
      async () => {
        try {
          const deleted = await this.cleanupStaleCache();
          if (deleted > 0) {
            log.debug("PG", `Cache cleanup removed ${deleted} stale entries`);
          }
        } catch (error) {
          log.error("PG", "Cache cleanup error:", error);
        }
      },
      6 * 60 * 60 * 1000,
    );
  }

  /**
   * Close database connection pool
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.pool.end();
  }

  // ============================================================================
  // TRACK QUERIES (TrackRepository)
  // ============================================================================

  async findTrackByUrl(url: string): Promise<CachedTrackResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit, t.preview_url,
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
    return this.buildCachedResult(result.rows as TrackWithLinkRow[]);
  }

  async findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit, t.preview_url,
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

    if (result.rows.length === 0) return null;
    return this.buildCachedResult(result.rows as TrackWithLinkRow[]);
  }

  async findTracksByTextSearch(query: string, maxResults: number = 10): Promise<NormalizedTrack[]> {
    const results: NormalizedTrack[] = [];

    try {
      // Split query into words and search for any word match
      const words = query
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);

      if (words.length === 0) {
        return [];
      }

      // Build WHERE clause: each word must match either title or artists
      const whereClauses = words.map((_, i) => `(t.title ILIKE $${i + 1} OR t.artists ILIKE $${i + 1})`).join(" OR ");
      const params: (string | number)[] = words.map((w) => `%${w}%`);
      params.push(maxResults);

      const searchResult = await this.pool.query(
        `SELECT
          t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url,
          t.duration_ms, t.release_date, t.is_explicit, t.preview_url,
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
        results.push(this.rowToTrack(row));
      }
    } catch (error) {
      log.error("PG", "Text search error:", error);
    }

    return results;
  }

  async findShortIdByTrackUrl(url: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT su.id FROM short_urls su
       JOIN tracks t ON su.track_id = t.id
       WHERE t.source_url = $1 LIMIT 1`,
      [url],
    );
    return result.rows[0]?.id ?? null;
  }

  async findExistingByIsrc(isrc: string): Promise<{ trackId: string; shortId: string } | null> {
    const result = await this.pool.query(
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

  findExistingByIsrcSync(_isrc: string): { trackId: string; shortId: string } | null {
    // Note: Synchronous method - must be called within a transaction context
    // This is a wrapper that throws since pg is async-only
    throw new Error("findExistingByIsrcSync not available in PostgreSQL adapter. Use findExistingByIsrc instead.");
  }

  async loadByShortId(shortId: string): Promise<SharePageDbResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit, t.preview_url,
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
    return this.buildSharePageResult(result.rows as TrackWithLinkRow[]);
  }

  async loadByTrackId(trackId: string): Promise<SharePageDbResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit, t.preview_url,
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
    return this.buildSharePageResult(result.rows as TrackWithLinkRow[]);
  }

  async persistTrackWithLinks(data: PersistTrackData): Promise<{
    trackId: string;
    shortId: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const now = new Date();

      // Look up existing track by ISRC or source_url to prevent duplicates
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
        // Update existing track metadata
        await client.query(
          `UPDATE tracks SET
            title = $2, artists = $3, album_name = $4, artwork_url = $5,
            duration_ms = $6, release_date = $7, is_explicit = $8,
            preview_url = $9, updated_at = $10
          WHERE id = $1`,
          [
            trackId,
            data.sourceTrack.title,
            JSON.stringify(data.sourceTrack.artists),
            data.sourceTrack.albumName ?? null,
            data.sourceTrack.artworkUrl ?? null,
            data.sourceTrack.durationMs ?? null,
            data.sourceTrack.releaseDate ?? null,
            data.sourceTrack.isExplicit ? 1 : 0,
            data.sourceTrack.previewUrl ?? null,
            now,
          ],
        );
      } else {
        // Insert new track
        await client.query(
          `INSERT INTO tracks (
            id, title, artists, album_name, isrc, artwork_url, duration_ms,
            release_date, is_explicit, preview_url, source_service, source_url,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            trackId,
            data.sourceTrack.title,
            JSON.stringify(data.sourceTrack.artists),
            data.sourceTrack.albumName ?? null,
            data.sourceTrack.isrc ?? null,
            data.sourceTrack.artworkUrl ?? null,
            data.sourceTrack.durationMs ?? null,
            data.sourceTrack.releaseDate ?? null,
            data.sourceTrack.isExplicit ? 1 : 0,
            data.sourceTrack.previewUrl ?? null,
            data.sourceTrack.sourceService ?? null,
            data.sourceTrack.sourceUrl ?? null,
            now,
            now,
          ],
        );
      }

      // Upsert service links
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

      // Insert short URL (only if new)
      if (!existingShortId) {
        await client.query(
          `INSERT INTO short_urls (id, track_id, created_at) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [shortId, trackId, now],
        );
      }

      await client.query("COMMIT");
      return { trackId, shortId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addLinksToTrack(
    trackId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    const client = await this.pool.connect();
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

  async addTrackUrlAlias(url: string, trackId: string): Promise<void> {
    const now = new Date();

    await this.pool.query(
      `INSERT INTO url_aliases (id, url, track_id, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [`${trackId}-${url.slice(-20)}`, url, trackId, now],
    );
  }

  // ============================================================================
  // ARTIST CACHE QUERIES (TrackRepository)
  // ============================================================================

  async findArtistCache(artistName: string): Promise<ArtistCacheRow | null> {
    const result = await this.pool.query(
      `SELECT artist_name, profile, top_tracks, events,
              profile_updated_at, tracks_updated_at, events_updated_at
       FROM artist_cache WHERE artist_name = $1`,
      [artistName],
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0] as ArtistCacheRow_DB;

    return {
      artistName: row.artist_name,
      profile: safeParseJson(row.profile, null),
      topTracks: safeParseJson(row.top_tracks, []),
      events: safeParseJson(row.events, []),
      profileUpdatedAt: row.profile_updated_at ? dateToMs(row.profile_updated_at) : 0,
      tracksUpdatedAt: row.tracks_updated_at ? dateToMs(row.tracks_updated_at) : 0,
      eventsUpdatedAt: row.events_updated_at ? dateToMs(row.events_updated_at) : 0,
    };
  }

  async saveArtistCache(data: ArtistCacheData): Promise<void> {
    const now = new Date();
    const id = `artist-${data.artistName}`;

    await this.pool.query(
      `INSERT INTO artist_cache (
        id, artist_name, profile, top_tracks, events,
        profile_updated_at, tracks_updated_at, events_updated_at,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        profile = EXCLUDED.profile,
        top_tracks = EXCLUDED.top_tracks,
        events = EXCLUDED.events,
        profile_updated_at = EXCLUDED.profile_updated_at,
        tracks_updated_at = EXCLUDED.tracks_updated_at,
        events_updated_at = EXCLUDED.events_updated_at,
        updated_at = EXCLUDED.updated_at`,
      [
        id,
        data.artistName,
        data.profile ? JSON.stringify(data.profile) : null,
        data.topTracks ? JSON.stringify(data.topTracks) : null,
        data.events ? JSON.stringify(data.events) : null,
        data.profileUpdatedAt ? msToDate(data.profileUpdatedAt) : null,
        data.tracksUpdatedAt ? msToDate(data.tracksUpdatedAt) : null,
        data.eventsUpdatedAt ? msToDate(data.eventsUpdatedAt) : null,
        now,
        now,
      ],
    );
  }

  async cleanupStaleCache(): Promise<number> {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);

    const result = await this.pool.query(
      `DELETE FROM artist_cache
       WHERE updated_at < $1
       RETURNING id`,
      [cutoff],
    );

    return result.rowCount ?? 0;
  }

  async getRandomShortId(): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT su.id FROM short_urls su
       INNER JOIN featured_tracks ft ON su.track_id = ft.track_id
       ORDER BY RANDOM() LIMIT 1`,
    );

    if (result.rows.length === 0) return null;
    return result.rows[0].id;
  }

  async updateTrackTimestamp(trackId: string): Promise<void> {
    const now = new Date();
    await this.pool.query(`UPDATE tracks SET updated_at = $1 WHERE id = $2`, [now, trackId]);
  }

  // ============================================================================
  // ALBUM QUERIES (TrackRepository)
  // ============================================================================

  async findAlbumByUrl(url: string): Promise<CachedAlbumResult | null> {
    const result = await this.pool.query(
      `SELECT
        a.id, a.title, a.artists, a.release_date, a.total_tracks,
        a.artwork_url, a.label, a.upc, a.source_service, a.source_url, a.preview_url,
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
    return this.buildCachedAlbumResult(result.rows as AlbumWithLinkRow[]);
  }

  async findAlbumByUpc(upc: string): Promise<CachedAlbumResult | null> {
    const result = await this.pool.query(
      `SELECT
        a.id, a.title, a.artists, a.release_date, a.total_tracks,
        a.artwork_url, a.label, a.upc, a.source_service, a.source_url, a.preview_url,
        asl.url as link_url, asl.service, asl.confidence, asl.match_method,
        asu.id as short_id, a.created_at, a.updated_at
      FROM albums a
      LEFT JOIN album_service_links asl ON a.id = asl.album_id
      LEFT JOIN album_short_urls asu ON a.id = asu.album_id
      WHERE a.upc = $1
      ORDER BY asl.created_at ASC`,
      [upc],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedAlbumResult(result.rows as AlbumWithLinkRow[]);
  }

  async findExistingAlbumByUpc(upc: string): Promise<{ albumId: string; shortId: string } | null> {
    const result = await this.pool.query(
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

  findExistingAlbumByUpcSync(_upc: string): { albumId: string; shortId: string } | null {
    throw new Error("findExistingAlbumByUpcSync not available in PostgreSQL adapter");
  }

  async persistAlbumWithLinks(data: PersistAlbumData): Promise<{
    albumId: string;
    shortId: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const now = new Date();

      // Look up existing album by UPC or source_url to prevent duplicates
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
        // Update existing album metadata
        await client.query(
          `UPDATE albums SET
            title = $2, artists = $3, release_date = $4, total_tracks = $5,
            artwork_url = $6, label = $7, preview_url = $8, updated_at = $9
          WHERE id = $1`,
          [
            albumId,
            data.sourceAlbum.title,
            JSON.stringify(data.sourceAlbum.artists),
            data.sourceAlbum.releaseDate ?? null,
            data.sourceAlbum.totalTracks ?? null,
            data.sourceAlbum.artworkUrl ?? null,
            data.sourceAlbum.label ?? null,
            data.sourceAlbum.previewUrl ?? null,
            now,
          ],
        );
      } else {
        // Insert new album
        await client.query(
          `INSERT INTO albums (
            id, title, artists, release_date, total_tracks, artwork_url,
            label, upc, source_service, source_url, preview_url,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            albumId,
            data.sourceAlbum.title,
            JSON.stringify(data.sourceAlbum.artists),
            data.sourceAlbum.releaseDate ?? null,
            data.sourceAlbum.totalTracks ?? null,
            data.sourceAlbum.artworkUrl ?? null,
            data.sourceAlbum.label ?? null,
            data.sourceAlbum.upc ?? null,
            data.sourceAlbum.sourceService ?? null,
            data.sourceAlbum.sourceUrl ?? null,
            data.sourceAlbum.previewUrl ?? null,
            now,
            now,
          ],
        );
      }

      // Upsert service links
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

      // Insert short URL (only if new)
      if (!existingShortId) {
        await client.query(
          `INSERT INTO album_short_urls (id, album_id, created_at) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [shortId, albumId, now],
        );
      }

      await client.query("COMMIT");
      return { albumId, shortId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addLinksToAlbum(
    albumId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    const client = await this.pool.connect();
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

  async loadAlbumByShortId(shortId: string): Promise<SharePageAlbumResult | null> {
    const result = await this.pool.query(
      `SELECT
        a.id, a.title, a.artists, a.release_date, a.total_tracks,
        a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
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
    const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

    return {
      album: this.rowToAlbum(firstRow),
      artists,
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
  // ARTIST RESOLUTION QUERIES (TrackRepository)
  // ============================================================================

  async findArtistByUrl(url: string): Promise<CachedArtistResult | null> {
    const result = await this.pool.query(
      `SELECT
        ar.id, ar.name, ar.image_url, ar.genres, ar.source_service, ar.source_url,
        asl.url as link_url, asl.service, asl.confidence, asl.match_method,
        asu.id as short_id, ar.created_at, ar.updated_at
      FROM artists ar
      LEFT JOIN artist_service_links asl ON ar.id = asl.artist_id
      LEFT JOIN artist_short_urls asu ON ar.id = asu.artist_id
      WHERE ar.source_url = $1
      ORDER BY asl.created_at ASC`,
      [url],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedArtistResult(result.rows as ArtistWithLinkRow[]);
  }

  async findArtistByName(name: string): Promise<CachedArtistResult | null> {
    const result = await this.pool.query(
      `SELECT
        ar.id, ar.name, ar.image_url, ar.genres, ar.source_service, ar.source_url,
        asl.url as link_url, asl.service, asl.confidence, asl.match_method,
        asu.id as short_id, ar.created_at, ar.updated_at
      FROM artists ar
      LEFT JOIN artist_service_links asl ON ar.id = asl.artist_id
      LEFT JOIN artist_short_urls asu ON ar.id = asu.artist_id
      WHERE LOWER(ar.name) = LOWER($1)
      ORDER BY asl.created_at ASC`,
      [name],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedArtistResult(result.rows as ArtistWithLinkRow[]);
  }

  async loadArtistByShortId(shortId: string): Promise<SharePageArtistResult | null> {
    const result = await this.pool.query(
      `SELECT
        ar.id, ar.name, ar.image_url, ar.genres, ar.source_service, ar.source_url,
        asl.url as link_url, asl.service,
        asu.id as short_id
      FROM artists ar
      JOIN artist_short_urls asu ON ar.id = asu.artist_id
      LEFT JOIN artist_service_links asl ON ar.id = asl.artist_id
      WHERE asu.id = $1`,
      [shortId],
    );

    if (result.rows.length === 0) return null;

    const firstRow = result.rows[0] as ArtistWithLinkRow;

    return {
      artist: {
        name: firstRow.name,
        imageUrl: firstRow.image_url,
        genres: safeParseArray(firstRow.genres ?? "[]"),
      },
      links: (result.rows as ArtistWithLinkRow[])
        .filter((r) => r.link_url && r.service)
        .map((r) => ({
          service: r.service as string,
          url: r.link_url as string,
        })),
      shortId,
    };
  }

  async persistArtistWithLinks(data: PersistArtistData): Promise<{
    artistId: string;
    shortId: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const now = new Date();

      // Look up existing artist by source_url or name to prevent duplicates
      let existingArtistId: string | null = null;
      let existingShortId: string | null = null;

      if (data.sourceArtist.sourceUrl) {
        const found = await client.query(
          `SELECT ar.id, asu.id as short_id FROM artists ar
           LEFT JOIN artist_short_urls asu ON ar.id = asu.artist_id
           WHERE ar.source_url = $1 LIMIT 1`,
          [data.sourceArtist.sourceUrl],
        );
        if (found.rows.length > 0) {
          existingArtistId = found.rows[0].id;
          existingShortId = found.rows[0].short_id;
        }
      }

      if (!existingArtistId) {
        const found = await client.query(
          `SELECT ar.id, asu.id as short_id FROM artists ar
           LEFT JOIN artist_short_urls asu ON ar.id = asu.artist_id
           WHERE LOWER(ar.name) = LOWER($1) LIMIT 1`,
          [data.sourceArtist.name],
        );
        if (found.rows.length > 0) {
          existingArtistId = found.rows[0].id;
          existingShortId = found.rows[0].short_id;
        }
      }

      const artistId = existingArtistId ?? generateTrackId();
      const shortId = existingShortId ?? generateShortId();

      if (existingArtistId) {
        // Update existing artist metadata
        await client.query(
          `UPDATE artists SET
            name = $2, image_url = $3, genres = $4, updated_at = $5
          WHERE id = $1`,
          [
            artistId,
            data.sourceArtist.name,
            data.sourceArtist.imageUrl ?? null,
            data.sourceArtist.genres ? JSON.stringify(data.sourceArtist.genres) : null,
            now,
          ],
        );
      } else {
        // Insert new artist
        await client.query(
          `INSERT INTO artists (
            id, name, image_url, genres, source_service, source_url,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            artistId,
            data.sourceArtist.name,
            data.sourceArtist.imageUrl ?? null,
            data.sourceArtist.genres ? JSON.stringify(data.sourceArtist.genres) : null,
            data.sourceArtist.sourceService ?? null,
            data.sourceArtist.sourceUrl ?? null,
            now,
            now,
          ],
        );
      }

      // Upsert service links
      for (const link of data.links) {
        await client.query(
          `INSERT INTO artist_service_links (
            id, artist_id, service, external_id, url, confidence, match_method, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (artist_id, service) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            url = EXCLUDED.url,
            confidence = EXCLUDED.confidence`,
          [
            `${artistId}-${link.service}`,
            artistId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          ],
        );
      }

      // Insert short URL (only if new)
      if (!existingShortId) {
        await client.query(
          `INSERT INTO artist_short_urls (id, artist_id, created_at) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [shortId, artistId, now],
        );
      }

      await client.query("COMMIT");
      return { artistId, shortId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addLinksToArtist(
    artistId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = new Date();

      for (const link of links) {
        await client.query(
          `INSERT INTO artist_service_links (
            id, artist_id, service, external_id, url, confidence, match_method, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (artist_id, service) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            url = EXCLUDED.url,
            confidence = EXCLUDED.confidence`,
          [
            `${artistId}-${link.service}`,
            artistId,
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
  // ADMIN QUERIES (AdminRepository)
  // ============================================================================

  private rowToAdminUser(row: AdminUserRow): AdminUser {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      email: row.email,
      role: row.role,
      firstName: row.first_name,
      lastName: row.last_name,
      avatarUrl: row.avatar_url,
      locale: row.locale,
      sessionTimeoutMinutes: row.session_timeout_minutes,
      createdAt: dateToMs(row.created_at),
      lastLoginAt: row.last_login_at ? dateToMs(row.last_login_at) : null,
    };
  }

  async findAdminById(id: string): Promise<AdminUser | null> {
    const result = await this.pool.query(
      `SELECT id, username, password_hash, email, role, first_name, last_name,
              avatar_url, locale, invite_token_hash, invite_expires_at,
              session_timeout_minutes, created_at, last_login_at
       FROM admin_users WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) return null;
    return this.rowToAdminUser(result.rows[0] as AdminUserRow);
  }

  async findAdminByUsername(username: string): Promise<AdminUser | null> {
    const result = await this.pool.query(
      `SELECT id, username, password_hash, email, role, first_name, last_name,
              avatar_url, locale, invite_token_hash, invite_expires_at,
              session_timeout_minutes, created_at, last_login_at
       FROM admin_users WHERE username = $1`,
      [username],
    );

    if (result.rows.length === 0) return null;
    return this.rowToAdminUser(result.rows[0] as AdminUserRow);
  }

  async createAdminUser(data: {
    id: string;
    username: string;
    passwordHash: string;
    email?: string;
    role?: string;
    locale?: string;
    inviteTokenHash?: string;
    inviteExpiresAt?: Date;
  }): Promise<void> {
    const now = new Date();

    await this.pool.query(
      `INSERT INTO admin_users (id, username, password_hash, email, role, locale,
                                invite_token_hash, invite_expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        data.id,
        data.username,
        data.passwordHash,
        data.email ?? null,
        data.role ?? "admin",
        data.locale ?? "de",
        data.inviteTokenHash ?? null,
        data.inviteExpiresAt ?? null,
        now,
      ],
    );
  }

  async updateLastLogin(userId: string): Promise<void> {
    const now = new Date();
    await this.pool.query(`UPDATE admin_users SET last_login_at = $1 WHERE id = $2`, [now, userId]);
  }

  async countAdmins(): Promise<number> {
    const result = await this.pool.query(`SELECT COUNT(*) as count FROM admin_users`);
    return result.rows[0]?.count ?? 0;
  }

  async listAdminUsers(): Promise<AdminUser[]> {
    const result = await this.pool.query(
      `SELECT id, username, password_hash, email, role, first_name, last_name,
              avatar_url, locale, invite_token_hash, invite_expires_at,
              session_timeout_minutes, created_at, last_login_at
       FROM admin_users
       ORDER BY created_at ASC`,
    );
    return result.rows.map((row) => this.rowToAdminUser(row as AdminUserRow));
  }

  async updateAdminUser(
    id: string,
    data: Partial<{
      username: string;
      email: string;
      passwordHash: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
      locale: string;
      role: string;
      sessionTimeoutMinutes: number | null;
    }>,
  ): Promise<AdminUser | null> {
    const columnMap: Record<string, string> = {
      username: "username",
      email: "email",
      passwordHash: "password_hash",
      firstName: "first_name",
      lastName: "last_name",
      avatarUrl: "avatar_url",
      locale: "locale",
      role: "role",
      sessionTimeoutMinutes: "session_timeout_minutes",
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      const column = columnMap[key];
      if (column) {
        setClauses.push(`${column} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return null;

    values.push(id);
    const result = await this.pool.query(
      `UPDATE admin_users SET ${setClauses.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, username, password_hash, email, role, first_name, last_name,
                 avatar_url, locale, invite_token_hash, invite_expires_at,
                 session_timeout_minutes, created_at, last_login_at`,
      values,
    );

    if (result.rows.length === 0) return null;
    return this.rowToAdminUser(result.rows[0] as AdminUserRow);
  }

  async deleteAdminUser(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
  }

  // ============================================================================
  // SINGLE TRACK (AdminRepository)
  // ============================================================================

  async getTrackById(id: string) {
    const trackResult = await this.pool.query(
      `SELECT t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit, t.preview_url,
        t.source_service, t.source_url, t.created_at,
        su.id as short_id,
        CASE WHEN ft.id IS NOT NULL THEN true ELSE false END as is_featured
      FROM tracks t
      LEFT JOIN short_urls su ON t.id = su.track_id
      LEFT JOIN featured_tracks ft ON t.id = ft.track_id
      WHERE t.id = $1
      GROUP BY t.id, su.id, ft.id`,
      [id],
    );
    if (trackResult.rows.length === 0) return null;
    const r = trackResult.rows[0];

    const linksResult = await this.pool.query(
      `SELECT service, url FROM service_links WHERE track_id = $1 ORDER BY service`,
      [id],
    );

    return {
      id: r.id,
      title: r.title,
      artists: safeParseArray(r.artists),
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
      isFeatured: r.is_featured,
      createdAt: dateToMs(r.created_at),
      serviceLinks: (linksResult.rows as ServiceLinkRow[]).map((l) => ({ service: l.service, url: l.url })),
    };
  }

  async updateTrack(
    id: string,
    data: {
      title?: string;
      artists?: string[];
      albumName?: string | null;
      isrc?: string | null;
      artworkUrl?: string | null;
    },
  ) {
    const sets: string[] = [];
    const values: (string | number | null | Date)[] = [];
    let idx = 1;

    if (data.title !== undefined) {
      sets.push(`title = $${idx++}`);
      values.push(data.title);
    }
    if (data.artists !== undefined) {
      sets.push(`artists = $${idx++}`);
      values.push(JSON.stringify(data.artists));
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

    if (sets.length === 0) return;

    sets.push(`updated_at = $${idx++}`);
    values.push(new Date());
    values.push(id);

    await this.pool.query(`UPDATE tracks SET ${sets.join(", ")} WHERE id = $${idx}`, values);
  }

  // ============================================================================
  // LISTING & PAGINATION (AdminRepository)
  // ============================================================================

  async listTracks(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<TrackListItem>> {
    const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
    const offset = (page - 1) * limit;
    const ALLOWED = ["created_at", "updated_at", "title"];
    const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    let whereClause = "";
    let countResult: pgModule.QueryResult<CountRow>;
    let queryParams: (string | number)[] = [];

    if (q) {
      whereClause = `WHERE t.title ILIKE $1 OR t.artists ILIKE $1`;
      queryParams = [`%${q}%`];
      countResult = await this.pool.query(`SELECT COUNT(*) as count FROM tracks t ${whereClause}`, queryParams);
    } else {
      countResult = await this.pool.query(`SELECT COUNT(*) as count FROM tracks t`);
    }

    const total = countResult.rows[0]?.count ?? 0;

    // Add limit and offset to params
    queryParams.push(limit, offset);

    const query = `SELECT
      t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url,
      t.source_service, t.created_at,
      su.id as short_id, COUNT(sl.id) as link_count,
      CASE WHEN ft.id IS NOT NULL THEN true ELSE false END as is_featured
    FROM tracks t
    LEFT JOIN service_links sl ON t.id = sl.track_id
    LEFT JOIN short_urls su ON t.id = su.track_id
    LEFT JOIN featured_tracks ft ON t.id = ft.track_id
    ${whereClause}
    GROUP BY t.id, su.id, ft.id
    ORDER BY t.${col} ${dir}
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

    const rows = await this.pool.query(query, queryParams);

    const items = (rows.rows as TrackListRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      artists: safeParseArray(r.artists),
      albumName: r.album_name ?? null,
      isrc: r.isrc ?? null,
      artworkUrl: r.artwork_url ?? null,
      sourceService: r.source_service ?? null,
      linkCount: parseInt(r.link_count, 10),
      createdAt: dateToMs(r.created_at),
      shortId: r.short_id ?? null,
      isFeatured: r.is_featured,
    }));

    return { items, total, page, limit };
  }

  async listAlbums(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<AlbumListItem>> {
    const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
    const offset = (page - 1) * limit;
    const ALLOWED = ["created_at", "updated_at", "title"];
    const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    let whereClause = "";
    let countResult: pgModule.QueryResult<CountRow>;
    let queryParams: (string | number)[] = [];

    if (q) {
      whereClause = `WHERE a.title ILIKE $1 OR a.artists ILIKE $1`;
      queryParams = [`%${q}%`];
      countResult = await this.pool.query(`SELECT COUNT(*) as count FROM albums a ${whereClause}`, queryParams);
    } else {
      countResult = await this.pool.query(`SELECT COUNT(*) as count FROM albums a`);
    }

    const total = countResult.rows[0]?.count ?? 0;

    // Add limit and offset to params
    queryParams.push(limit, offset);

    const query = `SELECT
      a.id, a.title, a.artists, a.release_date, a.total_tracks,
      a.artwork_url, a.upc, a.source_service, a.created_at,
      asu.id as short_id, COUNT(asl.id) as link_count,
      CASE WHEN fa.id IS NOT NULL THEN true ELSE false END as is_featured
    FROM albums a
    LEFT JOIN album_service_links asl ON a.id = asl.album_id
    LEFT JOIN album_short_urls asu ON a.id = asu.album_id
    LEFT JOIN featured_albums fa ON a.id = fa.album_id
    ${whereClause}
    GROUP BY a.id, asu.id, fa.id
    ORDER BY a.${col} ${dir}
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

    const rows = await this.pool.query(query, queryParams);

    const items = (rows.rows as AlbumListRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      artists: safeParseArray(r.artists),
      releaseDate: r.release_date ?? null,
      totalTracks: r.total_tracks ?? null,
      artworkUrl: r.artwork_url ?? null,
      upc: r.upc ?? null,
      sourceService: r.source_service ?? null,
      linkCount: parseInt(r.link_count, 10),
      createdAt: dateToMs(r.created_at),
      shortId: r.short_id ?? null,
      isFeatured: r.is_featured,
    }));

    return { items, total, page, limit };
  }

  // ============================================================================
  // DELETION & MANAGEMENT (AdminRepository)
  // ============================================================================

  async deleteTracks(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

      // Delete associated records first (due to foreign keys)
      await client.query(`DELETE FROM service_links WHERE track_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM short_urls WHERE track_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM featured_tracks WHERE track_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM url_aliases WHERE track_id IN (${placeholders})`, ids);

      // Delete tracks
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

  async deleteAlbums(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

      // Delete associated records first
      await client.query(`DELETE FROM album_service_links WHERE album_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM album_short_urls WHERE album_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM featured_albums WHERE album_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM url_aliases WHERE album_id IN (${placeholders})`, ids);

      // Delete albums
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

  async setTrackFeatured(shortId: string, featured: boolean): Promise<void> {
    // Find the track_id from the short_url
    const result = await this.pool.query(`SELECT track_id FROM short_urls WHERE id = $1`, [shortId]);

    if (result.rows.length === 0) {
      throw new Error(`Short URL not found: ${shortId}`);
    }

    const trackId = result.rows[0].track_id;

    if (featured) {
      const id = `featured-${trackId}`;
      const now = new Date();
      await this.pool.query(
        `INSERT INTO featured_tracks (id, track_id, created_at) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [id, trackId, now],
      );
    } else {
      await this.pool.query(`DELETE FROM featured_tracks WHERE track_id = $1`, [trackId]);
    }
  }

  async setAlbumFeatured(shortId: string, featured: boolean): Promise<void> {
    // Find the album_id from the short_url
    const result = await this.pool.query(`SELECT album_id FROM album_short_urls WHERE id = $1`, [shortId]);

    if (result.rows.length === 0) {
      throw new Error(`Album short URL not found: ${shortId}`);
    }

    const albumId = result.rows[0].album_id;

    if (featured) {
      const id = `featured-${albumId}`;
      const now = new Date();
      await this.pool.query(
        `INSERT INTO featured_albums (id, album_id, created_at) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [id, albumId, now],
      );
    } else {
      await this.pool.query(`DELETE FROM featured_albums WHERE album_id = $1`, [albumId]);
    }
  }

  async listArtists(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<ArtistListItem>> {
    const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
    const offset = (page - 1) * limit;
    const ALLOWED = ["created_at", "updated_at", "name"];
    const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    let whereClause = "";
    let countResult: pgModule.QueryResult<CountRow>;
    let queryParams: (string | number)[] = [];

    if (q) {
      whereClause = `WHERE a.name ILIKE $1`;
      queryParams = [`%${q}%`];
      countResult = await this.pool.query(`SELECT COUNT(*) as count FROM artists a ${whereClause}`, queryParams);
    } else {
      countResult = await this.pool.query(`SELECT COUNT(*) as count FROM artists a`);
    }

    const total = countResult.rows[0]?.count ?? 0;

    // Add limit and offset to params
    queryParams.push(limit, offset);

    const query = `SELECT
      a.id, a.name, a.image_url, a.genres, a.source_service, a.created_at,
      asu.id as short_id, COUNT(asl.id) as link_count
    FROM artists a
    LEFT JOIN artist_service_links asl ON a.id = asl.artist_id
    LEFT JOIN artist_short_urls asu ON a.id = asu.artist_id
    ${whereClause}
    GROUP BY a.id, asu.id
    ORDER BY a.${col} ${dir}
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

    const rows = await this.pool.query(query, queryParams);

    interface ArtistListRow extends ArtistRow {
      short_id: string | null;
      link_count: string;
    }

    const items = (rows.rows as ArtistListRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      imageUrl: r.image_url ?? null,
      genres: safeParseArray(r.genres ?? "[]"),
      sourceService: r.source_service ?? null,
      linkCount: parseInt(r.link_count, 10),
      createdAt: dateToMs(r.created_at),
      shortId: r.short_id ?? null,
    }));

    return { items, total, page, limit };
  }

  async deleteArtists(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

      // Delete associated records first
      await client.query(`DELETE FROM artist_service_links WHERE artist_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM artist_short_urls WHERE artist_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM url_aliases WHERE artist_id IN (${placeholders})`, ids);

      // Delete artists
      await client.query(`DELETE FROM artists WHERE id IN (${placeholders}) RETURNING id`, ids);

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

  async clearArtistCache(): Promise<{ deleted: number }> {
    const result = await this.pool.query(`DELETE FROM artist_cache RETURNING id`);
    return { deleted: result.rowCount ?? 0 };
  }

  async countAllData(): Promise<{ tracks: number; albums: number; artists: number }> {
    const tracksResult = await this.pool.query(`SELECT COUNT(*) as count FROM tracks`);
    const albumsResult = await this.pool.query(`SELECT COUNT(*) as count FROM albums`);
    const artistsResult = await this.pool.query(`SELECT COUNT(*) as count FROM artists`);

    return {
      tracks: tracksResult.rows[0]?.count ?? 0,
      albums: albumsResult.rows[0]?.count ?? 0,
      artists: artistsResult.rows[0]?.count ?? 0,
    };
  }

  async resetAllData(): Promise<{ tracks: number; albums: number; artists: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get counts before deletion
      const tracksResult = await client.query(`SELECT COUNT(*) as count FROM tracks`);
      const albumsResult = await client.query(`SELECT COUNT(*) as count FROM albums`);
      const artistsResult = await client.query(`SELECT COUNT(*) as count FROM artists`);

      const trackCount = tracksResult.rows[0]?.count ?? 0;
      const albumCount = albumsResult.rows[0]?.count ?? 0;
      const artistCount = artistsResult.rows[0]?.count ?? 0;

      // Delete in reverse order of foreign key dependencies
      await client.query("DELETE FROM featured_albums");
      await client.query("DELETE FROM featured_tracks");
      await client.query("DELETE FROM url_aliases");
      await client.query("DELETE FROM artist_short_urls");
      await client.query("DELETE FROM artist_service_links");
      await client.query("DELETE FROM album_short_urls");
      await client.query("DELETE FROM album_service_links");
      await client.query("DELETE FROM short_urls");
      await client.query("DELETE FROM service_links");
      await client.query("DELETE FROM artists");
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

  async resolveShortIds(shortIds: string[]): Promise<Map<string, { title: string; artist: string }>> {
    const result = new Map<string, { title: string; artist: string }>();
    if (shortIds.length === 0) return result;

    const placeholders = shortIds.map((_, i) => `$${i + 1}`).join(", ");

    const trackRows = await this.pool.query(
      `SELECT su.id AS short_id, t.title, t.artists
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
      const albumRows = await this.pool.query(
        `SELECT asu.id AS short_id, a.title, a.artists
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

  // ============================================================================
  // SHARE PAGE LOADING (TrackRepository)
  // ============================================================================

  async loadSharePageResult(shortId: string): Promise<SharePageDbResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit, t.preview_url,
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
    const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

    return {
      trackId: firstRow.id,
      track: this.rowToSharePageTrack(firstRow),
      artists,
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

  async updatePreviewUrl(trackId: string, url: string): Promise<void> {
    await this.pool.query(`UPDATE tracks SET preview_url = $1 WHERE id = $2`, [url, trackId]);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private buildCachedResult(rows: TrackWithLinkRow[]): CachedTrackResult | null {
    if (rows.length === 0) return null;

    const firstRow = rows[0];
    const track = this.rowToTrack(firstRow);
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

  private buildCachedAlbumResult(rows: AlbumWithLinkRow[]): CachedAlbumResult | null {
    if (rows.length === 0) return null;

    const firstRow = rows[0];
    const album = this.rowToNormalizedAlbum(firstRow);
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

  private buildSharePageResult(rows: TrackWithLinkRow[]): SharePageDbResult | null {
    if (rows.length === 0) return null;

    const firstRow = rows[0];
    const artists = safeParseArray(firstRow.artists);
    const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

    return {
      trackId: firstRow.id,
      track: this.rowToSharePageTrack(firstRow),
      artists,
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

  private rowToTrack(row: TrackRow): NormalizedTrack {
    return {
      sourceService: (row.source_service as TrackSource) ?? "cached",
      sourceId: row.id,
      title: row.title,
      artists: safeParseArray(row.artists),
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

  /** Convert a track row to the SharePageDbResult.track shape */
  private rowToSharePageTrack(row: TrackRow): SharePageDbResult["track"] {
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

  private rowToAlbum(row: AlbumRow): SharePageAlbumResult["album"] {
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

  private rowToNormalizedAlbum(row: AlbumRow): NormalizedAlbum {
    return {
      sourceService: (row.source_service as TrackSource) ?? "cached",
      sourceId: row.id,
      title: row.title,
      artists: safeParseArray(row.artists),
      releaseDate: row.release_date ?? undefined,
      totalTracks: row.total_tracks ?? undefined,
      artworkUrl: row.artwork_url ?? undefined,
      label: row.label ?? undefined,
      upc: row.upc ?? undefined,
      webUrl: row.source_url ?? "",
    };
  }

  private buildCachedArtistResult(rows: ArtistWithLinkRow[]): CachedArtistResult | null {
    if (rows.length === 0) return null;

    const firstRow = rows[0];
    const artist: NormalizedArtist = {
      sourceService: (firstRow.source_service as TrackSource) ?? "cached",
      sourceId: firstRow.id,
      name: firstRow.name,
      imageUrl: firstRow.image_url ?? undefined,
      genres: safeParseArray(firstRow.genres ?? "[]"),
      webUrl: firstRow.source_url ?? "",
    };

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
      artistId: firstRow.id,
      artist,
      links,
      updatedAt: dateToMs(firstRow.updated_at),
    };
  }
}
