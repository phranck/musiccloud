import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../schemas/sqlite.js";
import type { TrackRepository, CachedTrackResult, SharePageDbResult, PersistTrackData } from "../repository.js";
import type { NormalizedTrack } from "../../services/types.js";
import { generateTrackId, generateShortId } from "../../lib/short-id.js";
import { log } from "../../lib/logger.js";

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

function safeParseArray(json: string, fallback: string[] = []): string[] {
  try { return JSON.parse(json); }
  catch { return fallback; }
}

function escapeFts5(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

export class SqliteAdapter implements TrackRepository {
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
    const tableExists = this.sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'`
    ).get();

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

    // Ensure FTS5 table exists even if tracks table was created before this fix
    const ftsExists = this.sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='tracks_fts'`
    ).get();

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
      WHERE t.id = (SELECT track_id FROM service_links WHERE url = ? LIMIT 1)
    `);

    const rows = stmt.all(url) as TrackWithLinkRow[];
    if (rows.length === 0) return null;

    return this.buildCachedResult(rows, url);
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

    return this.sqlite.transaction(() => {
      const existing = data.sourceTrack.isrc
        ? this.findExistingByIsrcSync(data.sourceTrack.isrc)
        : null;

      if (existing) {
        // Update timestamp + fill null metadata fields with new data
        this.sqlite.prepare(`
          UPDATE tracks SET
            updated_at = ?,
            is_explicit = COALESCE(is_explicit, ?),
            preview_url = COALESCE(preview_url, ?),
            source_service = COALESCE(source_service, ?),
            source_url = COALESCE(source_url, ?)
          WHERE id = ?
        `).run(
          now,
          data.sourceTrack.isExplicit != null ? (data.sourceTrack.isExplicit ? 1 : 0) : null,
          data.sourceTrack.previewUrl ?? null,
          data.sourceTrack.sourceService ?? null,
          data.sourceTrack.sourceUrl ?? null,
          existing.trackId,
        );

        for (const link of data.links) {
          this.db.insert(schema.serviceLinks).values({
            id: generateTrackId(),
            trackId: existing.trackId,
            service: link.service,
            externalId: link.externalId ?? null,
            url: link.url,
            confidence: link.confidence,
            matchMethod: link.matchMethod,
            createdAt: now,
          }).onConflictDoNothing().run();
        }
        return { trackId: existing.trackId, shortId: existing.shortId };
      }

      const newTrackId = generateTrackId();
      const newShortId = generateShortId();

      this.db.insert(schema.tracks).values({
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
      }).run();

      for (const link of data.links) {
        this.db.insert(schema.serviceLinks).values({
          id: generateTrackId(),
          trackId: newTrackId,
          service: link.service,
          externalId: link.externalId ?? null,
          url: link.url,
          confidence: link.confidence,
          matchMethod: link.matchMethod,
          createdAt: now,
        }).onConflictDoNothing().run();
      }

      this.db.insert(schema.shortUrls).values({
        id: newShortId,
        trackId: newTrackId,
        createdAt: now,
      }).run();

      return { trackId: newTrackId, shortId: newShortId };
    })();
  }

  async addLinksToTrack(trackId: string, links: Array<{
    service: string; url: string; confidence: number; matchMethod: string; externalId?: string;
  }>): Promise<void> {
    if (links.length === 0) return;

    const now = Date.now();
    this.sqlite.transaction(() => {
      for (const link of links) {
        this.db.insert(schema.serviceLinks).values({
          id: generateTrackId(),
          trackId,
          service: link.service,
          externalId: link.externalId ?? null,
          url: link.url,
          confidence: link.confidence,
          matchMethod: link.matchMethod,
          createdAt: now,
        }).onConflictDoNothing().run();
      }

      // Update track timestamp so cache TTL reflects the gap-fill
      this.sqlite.prepare("UPDATE tracks SET updated_at = ? WHERE id = ?").run(now, trackId);
    })();
  }

  async cleanupStaleCache(ttlMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - ttlMs;
    const result = this.sqlite.prepare(`
      DELETE FROM service_links
      WHERE track_id IN (
        SELECT t.id FROM tracks t
        LEFT JOIN short_urls su ON su.track_id = t.id
        WHERE t.updated_at < ? AND su.id IS NULL
      )
    `).run(cutoff);

    this.sqlite.prepare(`
      DELETE FROM tracks
      WHERE updated_at < ?
      AND id NOT IN (SELECT track_id FROM short_urls)
    `).run(cutoff);

    return result.changes;
  }

  async updateTrackTimestamp(trackId: string): Promise<void> {
    this.sqlite.prepare(`UPDATE tracks SET updated_at = ? WHERE id = ?`).run(Date.now(), trackId);
  }

  async close(): Promise<void> {
    this.sqlite.close();
  }

  // --- Private helpers ---

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
      .filter((r): r is TrackWithLinkRow & { url: string; service: string; confidence: number; match_method: string } => r.url != null)
      .map((r) => ({
        service: r.service,
        url: r.url,
        confidence: r.confidence,
        matchMethod: r.match_method,
      }));

    return { trackId: firstRow.id, updatedAt: firstRow.updated_at ?? firstRow.created_at, track, links };
  }

  private buildSharePageResult(
    rows: { title: string; artists: string; albumName: string | null; artworkUrl: string | null; durationMs: number | null; isrc: string | null; releaseDate: string | null; isExplicit: number | null; linkService: string; linkUrl: string }[],
    shortId: string,
  ): SharePageDbResult {
    const first = rows[0];
    const artists = safeParseArray(first.artists, ["Unknown Artist"]);
    const artistDisplay = artists.join(", ");
    const links = rows.map((r) => ({ service: r.linkService, url: r.linkUrl }));

    return {
      track: { title: first.title, albumName: first.albumName, artworkUrl: first.artworkUrl, durationMs: first.durationMs, isrc: first.isrc, releaseDate: first.releaseDate, isExplicit: first.isExplicit != null ? Boolean(first.isExplicit) : null },
      artists,
      artistDisplay,
      shortId,
      links,
    };
  }
}
