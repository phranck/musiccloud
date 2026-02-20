import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { CACHE_TTL_MS } from "../../lib/config.js";
import { adminEventBroadcaster } from "../../lib/event-broadcaster.js";
import { log } from "../../lib/infra/logger.js";
import { generateShortId, generateTrackId } from "../../lib/short-id.js";
import type { NormalizedTrack } from "../../services/types.js";
import type { AdminRepository, AdminUser } from "../admin-repository.js";
import type {
  ArtistCacheData,
  ArtistCacheRow,
  CachedAlbumResult,
  CachedTrackResult,
  PersistAlbumData,
  PersistTrackData,
  SharePageAlbumResult,
  SharePageDbResult,
  TrackRepository,
} from "../repository.js";
import * as schema from "../schemas/sqlite.js";

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
}

interface TrackWithLinkRow extends TrackRow {
  created_at: number;
  updated_at: number;
  url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
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
}

interface AlbumWithLinkRow extends AlbumRow {
  created_at: number;
  updated_at: number;
  link_url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
}

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

interface ArtistCacheRow_DB {
  artist_name: string;
  top_tracks_json: string | null;
  artist_profile_json: string | null;
  events_json: string | null;
  tracks_updated_at: number;
  profile_updated_at: number;
  events_updated_at: number;
}

function escapeFts5(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: number;
  last_login_at: number | null;
}

export class SqliteAdapter implements TrackRepository, AdminRepository {
  private sqlite: Database.Database;
  private db: ReturnType<typeof drizzle>;

  constructor(dbPath: string) {
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.db = drizzle(this.sqlite, { schema });
    this.ensureSchema();
  }

  private ensureSchema(): void {
    const tableExists = this.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'`)
      .get();

    if (!tableExists) {
      this.sqlite.exec(`
        CREATE TABLE tracks (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          artists TEXT NOT NULL,
          album_name TEXT,
          isrc TEXT,
          artwork_url TEXT,
          duration_ms INTEGER,
          release_date TEXT,
          is_explicit INTEGER,
          preview_url TEXT,
          source_service TEXT,
          source_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_tracks_isrc ON tracks (isrc);

        CREATE TABLE service_links (
          id TEXT PRIMARY KEY NOT NULL,
          track_id TEXT NOT NULL REFERENCES tracks(id),
          service TEXT NOT NULL,
          external_id TEXT,
          url TEXT NOT NULL,
          confidence REAL NOT NULL,
          match_method TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX idx_service_links_track_service ON service_links (track_id, service);
        CREATE INDEX idx_service_links_service_external ON service_links (service, external_id);

        CREATE TABLE short_urls (
          id TEXT PRIMARY KEY NOT NULL,
          track_id TEXT NOT NULL REFERENCES tracks(id),
          created_at INTEGER NOT NULL
        );

        CREATE TABLE albums (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          artists TEXT NOT NULL,
          release_date TEXT,
          total_tracks INTEGER,
          artwork_url TEXT,
          label TEXT,
          upc TEXT,
          source_service TEXT,
          source_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_albums_upc ON albums (upc);

        CREATE TABLE album_service_links (
          id TEXT PRIMARY KEY NOT NULL,
          album_id TEXT NOT NULL REFERENCES albums(id),
          service TEXT NOT NULL,
          external_id TEXT,
          url TEXT NOT NULL,
          confidence REAL NOT NULL,
          match_method TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX idx_album_service_links_album_service ON album_service_links (album_id, service);
        CREATE INDEX idx_album_service_links_service_external ON album_service_links (service, external_id);

        CREATE TABLE album_short_urls (
          id TEXT PRIMARY KEY NOT NULL,
          album_id TEXT NOT NULL REFERENCES albums(id),
          created_at INTEGER NOT NULL
        );

        -- FTS5 virtual table for text search (standalone, manually synced)
        CREATE VIRTUAL TABLE tracks_fts USING fts5(
          track_id UNINDEXED,
          title,
          artists
        );

        -- Triggers to keep FTS5 in sync with tracks table
        CREATE TRIGGER tracks_fts_insert AFTER INSERT ON tracks BEGIN
          INSERT INTO tracks_fts(track_id, title, artists)
          VALUES (NEW.id, NEW.title, NEW.artists);
        END;

        CREATE TRIGGER tracks_fts_update AFTER UPDATE ON tracks BEGIN
          DELETE FROM tracks_fts WHERE track_id = OLD.id;
          INSERT INTO tracks_fts(track_id, title, artists)
          VALUES (NEW.id, NEW.title, NEW.artists);
        END;

        CREATE TRIGGER tracks_fts_delete AFTER DELETE ON tracks BEGIN
          DELETE FROM tracks_fts WHERE track_id = OLD.id;
        END;
      `);
    }

    // Ensure album tables exist even if DB was created before album support
    const albumsExist = this.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='albums'`)
      .get();

    if (!albumsExist) {
      this.sqlite.exec(`
        CREATE TABLE albums (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          artists TEXT NOT NULL,
          release_date TEXT,
          total_tracks INTEGER,
          artwork_url TEXT,
          label TEXT,
          upc TEXT,
          source_service TEXT,
          source_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_albums_upc ON albums (upc);

        CREATE TABLE album_service_links (
          id TEXT PRIMARY KEY NOT NULL,
          album_id TEXT NOT NULL REFERENCES albums(id),
          service TEXT NOT NULL,
          external_id TEXT,
          url TEXT NOT NULL,
          confidence REAL NOT NULL,
          match_method TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX idx_album_service_links_album_service ON album_service_links (album_id, service);
        CREATE INDEX idx_album_service_links_service_external ON album_service_links (service, external_id);

        CREATE TABLE album_short_urls (
          id TEXT PRIMARY KEY NOT NULL,
          album_id TEXT NOT NULL REFERENCES albums(id),
          created_at INTEGER NOT NULL
        );
      `);
    }

    // Ensure FTS5 table exists even if tracks table was created before this fix
    const ftsExists = this.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tracks_fts'`)
      .get();

    if (!ftsExists) {
      this.sqlite.exec(`
        CREATE VIRTUAL TABLE tracks_fts USING fts5(
          track_id UNINDEXED,
          title,
          artists
        );

        CREATE TRIGGER IF NOT EXISTS tracks_fts_insert AFTER INSERT ON tracks BEGIN
          INSERT INTO tracks_fts(track_id, title, artists)
          VALUES (NEW.id, NEW.title, NEW.artists);
        END;

        CREATE TRIGGER IF NOT EXISTS tracks_fts_update AFTER UPDATE ON tracks BEGIN
          DELETE FROM tracks_fts WHERE track_id = OLD.id;
          INSERT INTO tracks_fts(track_id, title, artists)
          VALUES (NEW.id, NEW.title, NEW.artists);
        END;

        CREATE TRIGGER IF NOT EXISTS tracks_fts_delete AFTER DELETE ON tracks BEGIN
          DELETE FROM tracks_fts WHERE track_id = OLD.id;
        END;

        -- Backfill existing tracks into FTS
        INSERT INTO tracks_fts(track_id, title, artists)
        SELECT id, title, artists FROM tracks;
      `);
    }

    // Ensure admin_users table exists
    const adminUsersExist = this.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='admin_users'`)
      .get();

    if (!adminUsersExist) {
      this.sqlite.exec(`
        CREATE TABLE admin_users (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_login_at INTEGER
        );
      `);
    }

    // Ensure performance indexes exist (idempotent, safe on existing DBs)
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tracks_source_url ON tracks(source_url);
      CREATE INDEX IF NOT EXISTS idx_albums_created_at ON albums(created_at DESC);
    `);

    // Ensure track_url_aliases table exists (added for short-link support)
    const urlAliasesExist = this.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='track_url_aliases'`)
      .get();
    if (!urlAliasesExist) {
      this.sqlite.exec(`
        CREATE TABLE track_url_aliases (
          url TEXT PRIMARY KEY NOT NULL,
          track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL
        );
      `);
    }

    // Ensure albums_fts exists (for fast album search)
    const albumsFtsExists = this.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='albums_fts'`)
      .get();

    if (!albumsFtsExists) {
      this.sqlite.exec(`
        CREATE VIRTUAL TABLE albums_fts USING fts5(
          album_id UNINDEXED,
          title,
          artists
        );

        CREATE TRIGGER IF NOT EXISTS albums_fts_insert AFTER INSERT ON albums BEGIN
          INSERT INTO albums_fts(album_id, title, artists)
          VALUES (NEW.id, NEW.title, NEW.artists);
        END;

        CREATE TRIGGER IF NOT EXISTS albums_fts_update AFTER UPDATE ON albums BEGIN
          DELETE FROM albums_fts WHERE album_id = OLD.id;
          INSERT INTO albums_fts(album_id, title, artists)
          VALUES (NEW.id, NEW.title, NEW.artists);
        END;

        CREATE TRIGGER IF NOT EXISTS albums_fts_delete AFTER DELETE ON albums BEGIN
          DELETE FROM albums_fts WHERE album_id = OLD.id;
        END;

        -- Backfill existing albums into FTS
        INSERT INTO albums_fts(album_id, title, artists)
        SELECT id, title, artists FROM albums;
      `);
    }

    // Lazy migration: is_featured column on short_urls / album_short_urls
    const shortUrlsCols = this.sqlite
      .prepare(`PRAGMA table_info(short_urls)`)
      .all() as Array<{ name: string }>;
    if (!shortUrlsCols.some((c) => c.name === "is_featured")) {
      this.sqlite.exec(`ALTER TABLE short_urls ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0`);
    }
    const albumShortUrlsCols = this.sqlite
      .prepare(`PRAGMA table_info(album_short_urls)`)
      .all() as Array<{ name: string }>;
    if (!albumShortUrlsCols.some((c) => c.name === "is_featured")) {
      this.sqlite.exec(`ALTER TABLE album_short_urls ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0`);
    }

    // Lazy migration: artist_cache table
    const artistCacheExists = this.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='artist_cache'`)
      .get();

    if (!artistCacheExists) {
      this.sqlite.exec(`
        CREATE TABLE artist_cache (
          artist_name         TEXT PRIMARY KEY,
          deezer_id           INTEGER,
          spotify_artist_id   TEXT,
          top_tracks_json     TEXT,
          artist_profile_json TEXT,
          events_json         TEXT,
          tracks_updated_at   INTEGER NOT NULL DEFAULT 0,
          profile_updated_at  INTEGER NOT NULL DEFAULT 0,
          events_updated_at   INTEGER NOT NULL DEFAULT 0
        );
      `);
    }
  }

  async findTrackByUrl(url: string): Promise<CachedTrackResult | null> {
    const stmt = this.sqlite.prepare(`
      SELECT DISTINCT t.id, t.title, t.artists, t.album_name, t.isrc,
             t.artwork_url, t.duration_ms, t.release_date,
             t.is_explicit, t.preview_url, t.source_service, t.source_url,
             t.created_at, t.updated_at,
             sl.url, sl.service, sl.confidence, sl.match_method
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      WHERE t.id = (
        SELECT track_id FROM service_links WHERE url = ?
        UNION
        SELECT track_id FROM track_url_aliases WHERE url = ?
        LIMIT 1
      )
    `);

    const rows = stmt.all(url, url) as TrackWithLinkRow[];
    if (rows.length === 0) return null;

    return this.buildCachedResult(rows, url);
  }

  async findShortIdByTrackUrl(url: string): Promise<string | null> {
    const row = this.sqlite
      .prepare(`
        SELECT su.id
        FROM short_urls su
        WHERE su.track_id = (
          SELECT track_id FROM service_links WHERE url = ?
          UNION
          SELECT track_id FROM track_url_aliases WHERE url = ?
          LIMIT 1
        )
        LIMIT 1
      `)
      .get(url, url) as { id: string } | undefined;
    return row?.id ?? null;
  }

  async findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null> {
    const stmt = this.sqlite.prepare(`
      SELECT DISTINCT t.id, t.title, t.artists, t.album_name, t.isrc,
             t.artwork_url, t.duration_ms, t.release_date,
             t.is_explicit, t.preview_url, t.source_service, t.source_url,
             t.created_at, t.updated_at,
             sl.url, sl.service, sl.confidence, sl.match_method
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      WHERE t.isrc = ?
    `);

    const rows = stmt.all(isrc) as TrackWithLinkRow[];
    if (rows.length === 0) return null;

    return this.buildCachedResult(rows, "");
  }

  async findTracksByTextSearch(query: string, maxResults: number = 10): Promise<NormalizedTrack[]> {
    try {
      const ftsQuery = `${escapeFts5(query)}*`;

      const stmt = this.sqlite.prepare(`
        SELECT t.id, t.title, t.artists, t.album_name, t.isrc,
               t.artwork_url, t.duration_ms, t.release_date,
               t.is_explicit, t.preview_url, t.source_service, t.source_url
        FROM tracks_fts fts
        JOIN tracks t ON t.id = fts.track_id
        WHERE tracks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      const rows = stmt.all(ftsQuery, maxResults) as TrackRow[];
      log.debug("DB", "FTS5 returned", rows.length, "rows");

      return rows.map((r) => this.rowToTrack(r, ""));
    } catch (error) {
      log.error("DB", "findTracksByTextSearch error:", error);
      return [];
    }
  }

  async findExistingByIsrc(isrc: string): Promise<{ trackId: string; shortId: string } | null> {
    const stmt = this.sqlite.prepare(`
      SELECT t.id AS track_id, su.id AS short_id
      FROM tracks t
      JOIN short_urls su ON t.id = su.track_id
      WHERE t.isrc = ?
      LIMIT 1
    `);

    const row = stmt.get(isrc) as { track_id: string; short_id: string } | undefined;
    if (!row) return null;

    return { trackId: row.track_id, shortId: row.short_id };
  }

  async loadByShortId(shortId: string): Promise<SharePageDbResult | null> {
    const rows = this.db
      .select({
        trackId: schema.tracks.id,
        title: schema.tracks.title,
        artists: schema.tracks.artists,
        albumName: schema.tracks.albumName,
        artworkUrl: schema.tracks.artworkUrl,
        durationMs: schema.tracks.durationMs,
        isrc: schema.tracks.isrc,
        releaseDate: schema.tracks.releaseDate,
        isExplicit: schema.tracks.isExplicit,
        linkService: schema.serviceLinks.service,
        linkUrl: schema.serviceLinks.url,
      })
      .from(schema.shortUrls)
      .innerJoin(schema.tracks, eq(schema.tracks.id, schema.shortUrls.trackId))
      .innerJoin(schema.serviceLinks, eq(schema.serviceLinks.trackId, schema.shortUrls.trackId))
      .where(eq(schema.shortUrls.id, shortId))
      .all();

    if (rows.length === 0) return null;

    return this.buildSharePageResult(rows, shortId);
  }

  async loadByTrackId(trackId: string): Promise<SharePageDbResult | null> {
    const rows = this.db
      .select({
        trackId: schema.tracks.id,
        title: schema.tracks.title,
        artists: schema.tracks.artists,
        albumName: schema.tracks.albumName,
        artworkUrl: schema.tracks.artworkUrl,
        durationMs: schema.tracks.durationMs,
        isrc: schema.tracks.isrc,
        releaseDate: schema.tracks.releaseDate,
        isExplicit: schema.tracks.isExplicit,
        linkService: schema.serviceLinks.service,
        linkUrl: schema.serviceLinks.url,
        shortUrlId: schema.shortUrls.id,
      })
      .from(schema.tracks)
      .innerJoin(schema.serviceLinks, eq(schema.serviceLinks.trackId, schema.tracks.id))
      .leftJoin(schema.shortUrls, eq(schema.shortUrls.trackId, schema.tracks.id))
      .where(eq(schema.tracks.id, trackId))
      .all();

    if (rows.length === 0) return null;

    const shortId = rows[0].shortUrlId ?? trackId;
    return this.buildSharePageResult(rows, shortId);
  }

  async persistTrackWithLinks(data: PersistTrackData): Promise<{ trackId: string; shortId: string }> {
    const now = Date.now();

    const result = this.sqlite.transaction((): { trackId: string; shortId: string; isNew: boolean } => {
      // 1. Lookup by ISRC (most reliable dedup key)
      let existing = data.sourceTrack.isrc ? this.findExistingByIsrcSync(data.sourceTrack.isrc) : null;

      // 2. Fallback: lookup by source URL (for tracks without ISRC).
      //    Prevents duplicates after cache TTL expiry or repeated resolves of the same URL.
      if (!existing && data.sourceTrack.sourceUrl) {
        const row = this.sqlite
          .prepare(
            `SELECT t.id AS track_id, su.id AS short_id
             FROM tracks t
             JOIN short_urls su ON t.id = su.track_id
             WHERE t.source_url = ?
             LIMIT 1`,
          )
          .get(data.sourceTrack.sourceUrl) as { track_id: string; short_id: string } | undefined;
        if (row) existing = { trackId: row.track_id, shortId: row.short_id };
      }

      if (existing) {
        // Update timestamp + fill null metadata fields with new data
        this.sqlite
          .prepare(`
          UPDATE tracks SET
            updated_at = ?,
            is_explicit = COALESCE(is_explicit, ?),
            preview_url = COALESCE(preview_url, ?),
            source_service = COALESCE(source_service, ?),
            source_url = COALESCE(source_url, ?)
          WHERE id = ?
        `)
          .run(
            now,
            data.sourceTrack.isExplicit != null ? (data.sourceTrack.isExplicit ? 1 : 0) : null,
            data.sourceTrack.previewUrl ?? null,
            data.sourceTrack.sourceService ?? null,
            data.sourceTrack.sourceUrl ?? null,
            existing.trackId,
          );

        for (const link of data.links) {
          this.db
            .insert(schema.serviceLinks)
            .values({
              id: generateTrackId(),
              trackId: existing.trackId,
              service: link.service,
              externalId: link.externalId ?? null,
              url: link.url,
              confidence: link.confidence,
              matchMethod: link.matchMethod,
              createdAt: now,
            })
            .onConflictDoNothing()
            .run();
        }
        return { trackId: existing.trackId, shortId: existing.shortId, isNew: false };
      }

      const newTrackId = generateTrackId();
      const newShortId = generateShortId();

      this.db
        .insert(schema.tracks)
        .values({
          id: newTrackId,
          title: data.sourceTrack.title,
          artists: JSON.stringify(data.sourceTrack.artists),
          albumName: data.sourceTrack.albumName ?? null,
          isrc: data.sourceTrack.isrc ?? null,
          artworkUrl: data.sourceTrack.artworkUrl ?? null,
          durationMs: data.sourceTrack.durationMs ? Math.floor(data.sourceTrack.durationMs) : null,
          releaseDate: data.sourceTrack.releaseDate ?? null,
          isExplicit: data.sourceTrack.isExplicit != null ? (data.sourceTrack.isExplicit ? 1 : 0) : null,
          previewUrl: data.sourceTrack.previewUrl ?? null,
          sourceService: data.sourceTrack.sourceService ?? null,
          sourceUrl: data.sourceTrack.sourceUrl ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      for (const link of data.links) {
        this.db
          .insert(schema.serviceLinks)
          .values({
            id: generateTrackId(),
            trackId: newTrackId,
            service: link.service,
            externalId: link.externalId ?? null,
            url: link.url,
            confidence: link.confidence,
            matchMethod: link.matchMethod,
            createdAt: now,
          })
          .onConflictDoNothing()
          .run();
      }

      this.db
        .insert(schema.shortUrls)
        .values({
          id: newShortId,
          trackId: newTrackId,
          createdAt: now,
        })
        .run();

      return { trackId: newTrackId, shortId: newShortId, isNew: true };
    })();

    // Emit SSE event after the transaction so connected dashboard clients
    // see new tracks appear in real time. Only fires for genuinely new inserts.
    if (result.isNew && adminEventBroadcaster.listenerCount > 0) {
      adminEventBroadcaster.emit({
        type: "track-added",
        data: {
          id: result.trackId,
          title: data.sourceTrack.title,
          artists: data.sourceTrack.artists,
          albumName: data.sourceTrack.albumName ?? null,
          isrc: data.sourceTrack.isrc ?? null,
          artworkUrl: data.sourceTrack.artworkUrl ?? null,
          sourceService: data.sourceTrack.sourceService ?? null,
          linkCount: data.links.length,
          createdAt: now,
          shortId: result.shortId,
          isFeatured: false,
        },
      });
    }

    return { trackId: result.trackId, shortId: result.shortId };
  }

  async addLinksToTrack(
    trackId: string,
    links: Array<{
      service: string;
      url: string;
      confidence: number;
      matchMethod: string;
      externalId?: string;
    }>,
  ): Promise<void> {
    if (links.length === 0) return;

    const now = Date.now();
    this.sqlite.transaction(() => {
      for (const link of links) {
        this.db
          .insert(schema.serviceLinks)
          .values({
            id: generateTrackId(),
            trackId,
            service: link.service,
            externalId: link.externalId ?? null,
            url: link.url,
            confidence: link.confidence,
            matchMethod: link.matchMethod,
            createdAt: now,
          })
          .onConflictDoNothing()
          .run();
      }

      // Update track timestamp so cache TTL reflects the gap-fill
      this.sqlite.prepare("UPDATE tracks SET updated_at = ? WHERE id = ?").run(now, trackId);
    })();
  }

  async cleanupStaleCache(ttlMs: number = CACHE_TTL_MS): Promise<number> {
    const cutoff = Date.now() - ttlMs;
    const result = this.sqlite
      .prepare(`
      DELETE FROM service_links
      WHERE track_id IN (
        SELECT t.id FROM tracks t
        LEFT JOIN short_urls su ON su.track_id = t.id
        WHERE t.updated_at < ? AND su.id IS NULL
      )
    `)
      .run(cutoff);

    this.sqlite
      .prepare(`
      DELETE FROM tracks
      WHERE updated_at < ?
      AND id NOT IN (SELECT track_id FROM short_urls)
    `)
      .run(cutoff);

    return result.changes;
  }


  async addTrackUrlAlias(url: string, trackId: string): Promise<void> {
    this.sqlite
      .prepare(
        `INSERT INTO track_url_aliases (url, track_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(url) DO NOTHING`,
      )
      .run(url, trackId, Date.now());
  }

  async findArtistCache(artistName: string): Promise<ArtistCacheRow | null> {
    const row = this.sqlite
      .prepare(`SELECT * FROM artist_cache WHERE artist_name = ?`)
      .get(artistName) as ArtistCacheRow_DB | undefined;

    if (!row) return null;

    return {
      artistName: row.artist_name,
      topTracks: safeParseJson(row.top_tracks_json, []),
      profile: safeParseJson(row.artist_profile_json, null),
      events: safeParseJson(row.events_json, []),
      tracksUpdatedAt: row.tracks_updated_at,
      profileUpdatedAt: row.profile_updated_at,
      eventsUpdatedAt: row.events_updated_at,
    };
  }

  async saveArtistCache(data: ArtistCacheData): Promise<void> {
    const now = Date.now();
    const existing = this.sqlite
      .prepare(`SELECT * FROM artist_cache WHERE artist_name = ?`)
      .get(data.artistName) as ArtistCacheRow_DB | undefined;

    if (!existing) {
      this.sqlite
        .prepare(
          `INSERT INTO artist_cache
             (artist_name, top_tracks_json, artist_profile_json, events_json,
              tracks_updated_at, profile_updated_at, events_updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.artistName,
          data.topTracks !== undefined ? JSON.stringify(data.topTracks) : null,
          data.profile !== undefined ? JSON.stringify(data.profile) : null,
          data.events !== undefined ? JSON.stringify(data.events) : null,
          data.topTracks !== undefined ? now : 0,
          data.profile !== undefined ? now : 0,
          data.events !== undefined ? now : 0,
        );
      return;
    }

    // Patch only the sections that are provided
    if (data.topTracks !== undefined) {
      this.sqlite
        .prepare(`UPDATE artist_cache SET top_tracks_json = ?, tracks_updated_at = ? WHERE artist_name = ?`)
        .run(JSON.stringify(data.topTracks), now, data.artistName);
    }
    if (data.profile !== undefined) {
      this.sqlite
        .prepare(`UPDATE artist_cache SET artist_profile_json = ?, profile_updated_at = ? WHERE artist_name = ?`)
        .run(JSON.stringify(data.profile), now, data.artistName);
    }
    if (data.events !== undefined) {
      this.sqlite
        .prepare(`UPDATE artist_cache SET events_json = ?, events_updated_at = ? WHERE artist_name = ?`)
        .run(JSON.stringify(data.events), now, data.artistName);
    }
  }

  async getRandomShortId(): Promise<string | null> {
    const featured = this.sqlite
      .prepare(
        `SELECT id FROM (
           SELECT id FROM short_urls WHERE is_featured = 1
           UNION ALL
           SELECT id FROM album_short_urls WHERE is_featured = 1
         ) ORDER BY RANDOM() LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    if (featured) return featured.id;

    // Fallback: any short URL when no entries are marked as featured
    const any = this.sqlite
      .prepare(
        `SELECT id FROM (
           SELECT id FROM short_urls
           UNION ALL
           SELECT id FROM album_short_urls
         ) ORDER BY RANDOM() LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    return any?.id ?? null;
  }

  async updateTrackTimestamp(trackId: string): Promise<void> {
    this.sqlite.prepare(`UPDATE tracks SET updated_at = ? WHERE id = ?`).run(Date.now(), trackId);
  }

  async close(): Promise<void> {
    this.sqlite.close();
  }

  // ─── AdminRepository ────────────────────────────────────────────────────────

  async countAdmins(): Promise<number> {
    const row = this.sqlite
      .prepare(`SELECT count(*) as cnt FROM admin_users`)
      .get() as { cnt: number };
    return row.cnt;
  }

  async findAdminByUsername(username: string): Promise<AdminUser | null> {
    const row = this.sqlite
      .prepare(`SELECT id, username, password_hash, created_at, last_login_at FROM admin_users WHERE username = ?`)
      .get(username) as AdminUserRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  }

  async createAdminUser(data: { id: string; username: string; passwordHash: string }): Promise<void> {
    this.sqlite
      .prepare(`INSERT INTO admin_users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`)
      .run(data.id, data.username, data.passwordHash, Date.now());
  }

  async updateLastLogin(id: string): Promise<void> {
    this.sqlite
      .prepare(`UPDATE admin_users SET last_login_at = ? WHERE id = ?`)
      .run(Date.now(), id);
  }

  // --- Album methods ---

  async findAlbumByUrl(url: string): Promise<CachedAlbumResult | null> {
    const stmt = this.sqlite.prepare(`
      SELECT DISTINCT a.id, a.title, a.artists, a.release_date, a.total_tracks,
             a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
             a.created_at, a.updated_at,
             asl.url AS link_url, asl.service, asl.confidence, asl.match_method
      FROM albums a
      LEFT JOIN album_service_links asl ON a.id = asl.album_id
      WHERE a.id = (SELECT album_id FROM album_service_links WHERE url = ? LIMIT 1)
    `);

    const rows = stmt.all(url) as AlbumWithLinkRow[];
    if (rows.length === 0) return null;

    return this.buildCachedAlbumResult(rows, url);
  }

  async findAlbumByUpc(upc: string): Promise<CachedAlbumResult | null> {
    const stmt = this.sqlite.prepare(`
      SELECT DISTINCT a.id, a.title, a.artists, a.release_date, a.total_tracks,
             a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
             a.created_at, a.updated_at,
             asl.url AS link_url, asl.service, asl.confidence, asl.match_method
      FROM albums a
      LEFT JOIN album_service_links asl ON a.id = asl.album_id
      WHERE a.upc = ?
    `);

    const rows = stmt.all(upc) as AlbumWithLinkRow[];
    if (rows.length === 0) return null;

    return this.buildCachedAlbumResult(rows, "");
  }

  async findExistingAlbumByUpc(upc: string): Promise<{ albumId: string; shortId: string } | null> {
    const stmt = this.sqlite.prepare(`
      SELECT a.id AS album_id, asu.id AS short_id
      FROM albums a
      JOIN album_short_urls asu ON a.id = asu.album_id
      WHERE a.upc = ?
      LIMIT 1
    `);

    const row = stmt.get(upc) as { album_id: string; short_id: string } | undefined;
    if (!row) return null;

    return { albumId: row.album_id, shortId: row.short_id };
  }

  async loadAlbumByShortId(shortId: string): Promise<SharePageAlbumResult | null> {
    const stmt = this.sqlite.prepare(`
      SELECT a.title, a.artists, a.artwork_url, a.release_date, a.total_tracks, a.label, a.upc,
             asl.service, asl.url AS link_url
      FROM album_short_urls asu
      JOIN albums a ON a.id = asu.album_id
      JOIN album_service_links asl ON asl.album_id = a.id
      WHERE asu.id = ?
    `);

    const rows = stmt.all(shortId) as Array<{
      title: string;
      artists: string;
      artwork_url: string | null;
      release_date: string | null;
      total_tracks: number | null;
      label: string | null;
      upc: string | null;
      service: string;
      link_url: string;
    }>;

    if (rows.length === 0) return null;

    const first = rows[0];
    const artists = safeParseArray(first.artists, ["Unknown Artist"]);

    return {
      album: {
        title: first.title,
        artworkUrl: first.artwork_url,
        releaseDate: first.release_date,
        totalTracks: first.total_tracks,
        label: first.label,
        upc: first.upc,
      },
      artists,
      artistDisplay: artists.join(", "),
      shortId,
      links: rows.map((r) => ({ service: r.service, url: r.link_url })),
    };
  }

  async persistAlbumWithLinks(data: PersistAlbumData): Promise<{ albumId: string; shortId: string }> {
    const now = Date.now();

    const result = this.sqlite.transaction((): { albumId: string; shortId: string; isNew: boolean } => {
      const existing = data.sourceAlbum.upc ? this.findExistingAlbumByUpcSync(data.sourceAlbum.upc) : null;

      if (existing) {
        this.sqlite.prepare(`UPDATE albums SET updated_at = ? WHERE id = ?`).run(now, existing.albumId);

        for (const link of data.links) {
          this.sqlite
            .prepare(`
              INSERT INTO album_service_links (id, album_id, service, external_id, url, confidence, match_method, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(album_id, service) DO NOTHING
            `)
            .run(
              generateTrackId(),
              existing.albumId,
              link.service,
              link.externalId ?? null,
              link.url,
              link.confidence,
              link.matchMethod,
              now,
            );
        }

        return { albumId: existing.albumId, shortId: existing.shortId, isNew: false };
      }

      const newAlbumId = generateTrackId();
      const newShortId = generateShortId();

      this.sqlite
        .prepare(`
          INSERT INTO albums (id, title, artists, release_date, total_tracks, artwork_url, label, upc, source_service, source_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          newAlbumId,
          data.sourceAlbum.title,
          JSON.stringify(data.sourceAlbum.artists),
          data.sourceAlbum.releaseDate ?? null,
          data.sourceAlbum.totalTracks ?? null,
          data.sourceAlbum.artworkUrl ?? null,
          data.sourceAlbum.label ?? null,
          data.sourceAlbum.upc ?? null,
          data.sourceAlbum.sourceService ?? null,
          data.sourceAlbum.sourceUrl ?? null,
          now,
          now,
        );

      for (const link of data.links) {
        this.sqlite
          .prepare(`
            INSERT INTO album_service_links (id, album_id, service, external_id, url, confidence, match_method, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(album_id, service) DO NOTHING
          `)
          .run(
            generateTrackId(),
            newAlbumId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          );
      }

      this.sqlite.prepare(`INSERT INTO album_short_urls (id, album_id, created_at) VALUES (?, ?, ?)`).run(
        newShortId,
        newAlbumId,
        now,
      );

      return { albumId: newAlbumId, shortId: newShortId, isNew: true };
    })();

    if (result.isNew && adminEventBroadcaster.listenerCount > 0) {
      adminEventBroadcaster.emit({
        type: "album-added",
        data: {
          id: result.albumId,
          title: data.sourceAlbum.title,
          artists: data.sourceAlbum.artists,
          releaseDate: data.sourceAlbum.releaseDate ?? null,
          totalTracks: data.sourceAlbum.totalTracks ?? null,
          artworkUrl: data.sourceAlbum.artworkUrl ?? null,
          upc: data.sourceAlbum.upc ?? null,
          sourceService: data.sourceAlbum.sourceService ?? null,
          linkCount: data.links.length,
          createdAt: now,
          shortId: result.shortId,
          isFeatured: false,
        },
      });
    }

    return { albumId: result.albumId, shortId: result.shortId };
  }

  async addLinksToAlbum(
    albumId: string,
    links: Array<{
      service: string;
      url: string;
      confidence: number;
      matchMethod: string;
      externalId?: string;
    }>,
  ): Promise<void> {
    if (links.length === 0) return;

    const now = Date.now();
    this.sqlite.transaction(() => {
      for (const link of links) {
        this.sqlite
          .prepare(`
            INSERT INTO album_service_links (id, album_id, service, external_id, url, confidence, match_method, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(album_id, service) DO NOTHING
          `)
          .run(
            generateTrackId(),
            albumId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          );
      }

      this.sqlite.prepare("UPDATE albums SET updated_at = ? WHERE id = ?").run(now, albumId);
    })();
  }

  // --- Private helpers ---

  private findExistingAlbumByUpcSync(upc: string): { albumId: string; shortId: string } | null {
    const stmt = this.sqlite.prepare(`
      SELECT a.id AS album_id, asu.id AS short_id
      FROM albums a
      JOIN album_short_urls asu ON a.id = asu.album_id
      WHERE a.upc = ?
      LIMIT 1
    `);

    const row = stmt.get(upc) as { album_id: string; short_id: string } | undefined;
    if (!row) return null;

    return { albumId: row.album_id, shortId: row.short_id };
  }

  private rowToAlbum(r: AlbumRow, webUrl: string): import("../../services/types.js").NormalizedAlbum {
    return {
      sourceService: "cached",
      sourceId: r.id,
      title: r.title,
      artists: safeParseArray(r.artists, ["Unknown Artist"]),
      releaseDate: r.release_date ?? undefined,
      totalTracks: r.total_tracks ?? undefined,
      artworkUrl: r.artwork_url ?? undefined,
      label: r.label ?? undefined,
      upc: r.upc ?? undefined,
      webUrl: r.source_url ?? webUrl,
    };
  }

  private buildCachedAlbumResult(rows: AlbumWithLinkRow[], webUrl: string): CachedAlbumResult {
    const firstRow = rows[0];
    const album = this.rowToAlbum(firstRow, webUrl);

    const links = rows
      .filter(
        (r): r is AlbumWithLinkRow & { link_url: string; service: string; confidence: number; match_method: string } =>
          r.link_url != null,
      )
      .map((r) => ({
        service: r.service,
        url: r.link_url,
        confidence: r.confidence,
        matchMethod: r.match_method,
      }));

    return { albumId: firstRow.id, updatedAt: firstRow.updated_at ?? firstRow.created_at, album, links };
  }

  private findExistingByIsrcSync(isrc: string): { trackId: string; shortId: string } | null {
    const stmt = this.sqlite.prepare(`
      SELECT t.id AS track_id, su.id AS short_id
      FROM tracks t
      JOIN short_urls su ON t.id = su.track_id
      WHERE t.isrc = ?
      LIMIT 1
    `);

    const row = stmt.get(isrc) as { track_id: string; short_id: string } | undefined;
    if (!row) return null;

    return { trackId: row.track_id, shortId: row.short_id };
  }

  private rowToTrack(r: TrackRow, webUrl: string): NormalizedTrack {
    return {
      sourceService: "cached",
      sourceId: r.id,
      title: r.title,
      artists: safeParseArray(r.artists, ["Unknown Artist"]),
      albumName: r.album_name ?? undefined,
      isrc: r.isrc ?? undefined,
      artworkUrl: r.artwork_url ?? undefined,
      durationMs: r.duration_ms ?? undefined,
      releaseDate: r.release_date ?? undefined,
      isExplicit: r.is_explicit != null ? Boolean(r.is_explicit) : undefined,
      previewUrl: r.preview_url ?? undefined,
      webUrl: r.source_url ?? webUrl,
    };
  }

  private buildCachedResult(rows: TrackWithLinkRow[], webUrl: string): CachedTrackResult {
    const firstRow = rows[0];
    const track = this.rowToTrack(firstRow, webUrl);

    const links = rows
      .filter(
        (r): r is TrackWithLinkRow & { url: string; service: string; confidence: number; match_method: string } =>
          r.url != null,
      )
      .map((r) => ({
        service: r.service,
        url: r.url,
        confidence: r.confidence,
        matchMethod: r.match_method,
      }));

    return { trackId: firstRow.id, updatedAt: firstRow.updated_at ?? firstRow.created_at, track, links };
  }

  private buildSharePageResult(
    rows: {
      title: string;
      artists: string;
      albumName: string | null;
      artworkUrl: string | null;
      durationMs: number | null;
      isrc: string | null;
      releaseDate: string | null;
      isExplicit: number | null;
      linkService: string;
      linkUrl: string;
    }[],
    shortId: string,
  ): SharePageDbResult {
    const first = rows[0];
    const artists = safeParseArray(first.artists, ["Unknown Artist"]);
    const artistDisplay = artists.join(", ");
    const links = rows.map((r) => ({ service: r.linkService, url: r.linkUrl }));

    return {
      track: {
        title: first.title,
        albumName: first.albumName,
        artworkUrl: first.artworkUrl,
        durationMs: first.durationMs,
        isrc: first.isrc,
        releaseDate: first.releaseDate,
        isExplicit: first.isExplicit != null ? Boolean(first.isExplicit) : null,
      },
      artists,
      artistDisplay,
      shortId,
      links,
    };
  }


  async listTracks({ page, limit, q, sortBy, sortDir }: { page: number; limit: number; q?: string; sortBy?: string; sortDir?: "asc" | "desc" }): Promise<import("../admin-repository.js").ListResult<import("../admin-repository.js").TrackListItem>> {
    const offset = (page - 1) * limit;

    const ALLOWED = new Set(["title", "artists", "created_at", "link_count", "isrc", "source_service"]);
    const col = sortBy && ALLOWED.has(sortBy) ? sortBy : "created_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";
    // link_count is a SELECT alias; all others live on t
    const orderClause = col === "link_count" ? `link_count ${dir}` : `t.${col} ${dir}`;

    interface TrackCountRow { id: string; title: string; artists: string; album_name: string | null; isrc: string | null; artwork_url: string | null; source_service: string | null; link_count: number; created_at: number; short_id: string | null; is_featured: number; }

    let rows: TrackCountRow[];
    let total: number;

    if (q) {
      const ftsQuery = `${escapeFts5(q)}*`;
      rows = this.sqlite.prepare(`
        SELECT t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url, t.source_service, t.created_at,
               COUNT(sl.id) AS link_count, MIN(su.id) AS short_id, MAX(su.is_featured) AS is_featured
        FROM tracks_fts fts
        JOIN tracks t ON t.id = fts.track_id
        LEFT JOIN service_links sl ON t.id = sl.track_id
        LEFT JOIN short_urls su ON su.track_id = t.id
        WHERE fts MATCH ?
        GROUP BY t.id
        ORDER BY ${orderClause}
        LIMIT ? OFFSET ?
      `).all(ftsQuery, limit, offset) as TrackCountRow[];
      const countRow = this.sqlite.prepare(
        `SELECT COUNT(DISTINCT fts.track_id) AS total FROM tracks_fts fts WHERE fts MATCH ?`
      ).get(ftsQuery) as { total: number };
      total = countRow.total;
    } else {
      rows = this.sqlite.prepare(`
        SELECT t.id, t.title, t.artists, t.album_name, t.isrc, t.artwork_url, t.source_service, t.created_at,
               COUNT(sl.id) AS link_count, MIN(su.id) AS short_id, MAX(su.is_featured) AS is_featured
        FROM tracks t
        LEFT JOIN service_links sl ON t.id = sl.track_id
        LEFT JOIN short_urls su ON su.track_id = t.id
        GROUP BY t.id
        ORDER BY ${orderClause}
        LIMIT ? OFFSET ?
      `).all(limit, offset) as TrackCountRow[];
      const countRow = this.sqlite.prepare(
        `SELECT COUNT(*) AS total FROM tracks`
      ).get() as { total: number };
      total = countRow.total;
    }

    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        artists: safeParseArray(r.artists),
        albumName: r.album_name,
        isrc: r.isrc,
        artworkUrl: r.artwork_url,
        sourceService: r.source_service,
        linkCount: r.link_count,
        createdAt: r.created_at,
        shortId: r.short_id ?? null,
        isFeatured: r.is_featured === 1,
      })),
      total,
      page,
      limit,
    };
  }

  async listAlbums({ page, limit, q, sortBy, sortDir }: { page: number; limit: number; q?: string; sortBy?: string; sortDir?: "asc" | "desc" }): Promise<import("../admin-repository.js").ListResult<import("../admin-repository.js").AlbumListItem>> {
    const offset = (page - 1) * limit;

    const ALLOWED = new Set(["title", "artists", "created_at", "link_count", "release_date", "total_tracks", "upc", "source_service"]);
    const col = sortBy && ALLOWED.has(sortBy) ? sortBy : "created_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";
    const orderClause = col === "link_count" ? `link_count ${dir}` : `a.${col} ${dir}`;

    interface AlbumCountRow { id: string; title: string; artists: string; release_date: string | null; total_tracks: number | null; artwork_url: string | null; upc: string | null; source_service: string | null; link_count: number; created_at: number; short_id: string | null; is_featured: number; }

    let rows: AlbumCountRow[];
    let total: number;

    if (q) {
      const ftsQuery = `${escapeFts5(q)}*`;
      rows = this.sqlite.prepare(`
        SELECT a.id, a.title, a.artists, a.release_date, a.total_tracks, a.artwork_url, a.upc, a.source_service, a.created_at,
               COUNT(asl.id) AS link_count, MIN(asu.id) AS short_id, MAX(asu.is_featured) AS is_featured
        FROM albums_fts fts
        JOIN albums a ON a.id = fts.album_id
        LEFT JOIN album_service_links asl ON a.id = asl.album_id
        LEFT JOIN album_short_urls asu ON asu.album_id = a.id
        WHERE fts MATCH ?
        GROUP BY a.id
        ORDER BY ${orderClause}
        LIMIT ? OFFSET ?
      `).all(ftsQuery, limit, offset) as AlbumCountRow[];
      const countRow = this.sqlite.prepare(
        `SELECT COUNT(DISTINCT fts.album_id) AS total FROM albums_fts fts WHERE fts MATCH ?`
      ).get(ftsQuery) as { total: number };
      total = countRow.total;
    } else {
      rows = this.sqlite.prepare(`
        SELECT a.id, a.title, a.artists, a.release_date, a.total_tracks, a.artwork_url, a.upc, a.source_service, a.created_at,
               COUNT(asl.id) AS link_count, MIN(asu.id) AS short_id, MAX(asu.is_featured) AS is_featured
        FROM albums a
        LEFT JOIN album_service_links asl ON a.id = asl.album_id
        LEFT JOIN album_short_urls asu ON asu.album_id = a.id
        GROUP BY a.id
        ORDER BY ${orderClause}
        LIMIT ? OFFSET ?
      `).all(limit, offset) as AlbumCountRow[];
      const countRow = this.sqlite.prepare(
        `SELECT COUNT(*) AS total FROM albums`
      ).get() as { total: number };
      total = countRow.total;
    }

    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        artists: safeParseArray(r.artists),
        releaseDate: r.release_date,
        totalTracks: r.total_tracks,
        artworkUrl: r.artwork_url,
        upc: r.upc,
        sourceService: r.source_service,
        linkCount: r.link_count,
        createdAt: r.created_at,
        shortId: r.short_id ?? null,
        isFeatured: r.is_featured === 1,
      })),
      total,
      page,
      limit,
    };
  }

  async deleteTracks(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const ph = ids.map(() => "?").join(",");
    this.sqlite.transaction(() => {
      this.sqlite.prepare(`DELETE FROM service_links WHERE track_id IN (${ph})`).run(...ids);
      this.sqlite.prepare(`DELETE FROM short_urls WHERE track_id IN (${ph})`).run(...ids);
      this.sqlite.prepare(`DELETE FROM tracks WHERE id IN (${ph})`).run(...ids);
      // tracks_fts_delete trigger fires automatically on DELETE FROM tracks
    })();
  }

  async deleteAlbums(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const ph = ids.map(() => "?").join(",");
    this.sqlite.transaction(() => {
      this.sqlite.prepare(`DELETE FROM album_service_links WHERE album_id IN (${ph})`).run(...ids);
      this.sqlite.prepare(`DELETE FROM album_short_urls WHERE album_id IN (${ph})`).run(...ids);
      this.sqlite.prepare(`DELETE FROM albums WHERE id IN (${ph})`).run(...ids);
      // albums_fts_delete trigger fires automatically on DELETE FROM albums
    })();
  }

  async setTrackFeatured(shortId: string, featured: boolean): Promise<void> {
    this.sqlite
      .prepare(`UPDATE short_urls SET is_featured = ? WHERE id = ?`)
      .run(featured ? 1 : 0, shortId);
  }

  async setAlbumFeatured(shortId: string, featured: boolean): Promise<void> {
    this.sqlite
      .prepare(`UPDATE album_short_urls SET is_featured = ? WHERE id = ?`)
      .run(featured ? 1 : 0, shortId);
  }

  async clearArtistCache(): Promise<{ deleted: number }> {
    const result = this.sqlite.prepare(`DELETE FROM artist_cache`).run();
    return { deleted: result.changes };
  }
}
