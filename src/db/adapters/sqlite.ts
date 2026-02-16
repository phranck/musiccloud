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
  }

  async findTrackByUrl(url: string): Promise<CachedTrackResult | null> {
    const stmt = this.sqlite.prepare(`
      SELECT DISTINCT t.id, t.title, t.artists, t.album_name, t.isrc,
             t.artwork_url, t.duration_ms, t.created_at, t.updated_at,
             sl.url, sl.service, sl.confidence, sl.match_method
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      WHERE sl.url = ?
      LIMIT 1
    `);

    const rows = stmt.all(url) as TrackWithLinkRow[];
    if (rows.length === 0) return null;

    return this.buildCachedResult(rows, url);
  }

  async findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null> {
    const stmt = this.sqlite.prepare(`
      SELECT DISTINCT t.id, t.title, t.artists, t.album_name, t.isrc,
             t.artwork_url, t.duration_ms,
             sl.url, sl.service, sl.confidence, sl.match_method
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      WHERE t.isrc = ?
      LIMIT 1
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
               t.artwork_url, t.duration_ms
        FROM tracks_fts fts
        JOIN tracks t ON t.id = fts.rowid
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
        for (const link of data.links) {
          this.db.insert(schema.serviceLinks).values({
            id: generateTrackId(),
            trackId: existing.trackId,
            service: link.service,
            externalId: null,
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
        createdAt: now,
        updatedAt: now,
      }).run();

      for (const link of data.links) {
        this.db.insert(schema.serviceLinks).values({
          id: generateTrackId(),
          trackId: newTrackId,
          service: link.service,
          externalId: null,
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
      webUrl,
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

    return { track, links };
  }

  private buildSharePageResult(
    rows: { title: string; artists: string; albumName: string | null; artworkUrl: string | null; linkService: string; linkUrl: string }[],
    shortId: string,
  ): SharePageDbResult {
    const first = rows[0];
    const artists = safeParseArray(first.artists, ["Unknown Artist"]);
    const artistDisplay = artists.join(", ");
    const links = rows.map((r) => ({ service: r.linkService, url: r.linkUrl }));

    return {
      track: { title: first.title, albumName: first.albumName, artworkUrl: first.artworkUrl },
      artists,
      artistDisplay,
      shortId,
      links,
    };
  }
}
