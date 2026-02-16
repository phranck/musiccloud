import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import * as schema from "../schemas/postgres.js";
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

export class PostgresAdapter implements TrackRepository {
  private pool: pg.Pool;
  private db: ReturnType<typeof drizzle>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
  }

  async findTrackByUrl(url: string): Promise<CachedTrackResult | null> {
    const { rows } = await this.pool.query<TrackWithLinkRow>(`
      SELECT DISTINCT t.id, t.title, t.artists, t.album_name, t.isrc,
             t.artwork_url, t.duration_ms, t.created_at, t.updated_at,
             sl.url, sl.service, sl.confidence, sl.match_method
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      WHERE sl.url = $1
      LIMIT 1
    `, [url]);

    if (rows.length === 0) return null;

    return this.buildCachedResult(rows, url);
  }

  async findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null> {
    const { rows } = await this.pool.query<TrackWithLinkRow>(`
      SELECT DISTINCT t.id, t.title, t.artists, t.album_name, t.isrc,
             t.artwork_url, t.duration_ms, t.created_at, t.updated_at,
             sl.url, sl.service, sl.confidence, sl.match_method
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      WHERE t.isrc = $1
      LIMIT 1
    `, [isrc]);

    if (rows.length === 0) return null;

    return this.buildCachedResult(rows, "");
  }

  async findTracksByTextSearch(query: string, maxResults: number = 10): Promise<NormalizedTrack[]> {
    try {
      const { rows } = await this.pool.query<TrackRow>(`
        SELECT t.id, t.title, t.artists, t.album_name, t.isrc,
               t.artwork_url, t.duration_ms
        FROM tracks t
        WHERE t.search_vector @@ plainto_tsquery('simple', $1)
        ORDER BY ts_rank(t.search_vector, plainto_tsquery('simple', $1)) DESC
        LIMIT $2
      `, [query, maxResults]);

      log.debug("DB", "PostgreSQL FTS returned", rows.length, "rows");

      return rows.map((r) => this.rowToTrack(r, ""));
    } catch (error) {
      log.error("DB", "findTracksByTextSearch error:", error);
      return [];
    }
  }

  async findExistingByIsrc(isrc: string): Promise<{ trackId: string; shortId: string } | null> {
    const { rows } = await this.pool.query<{ track_id: string; short_id: string }>(`
      SELECT t.id AS track_id, su.id AS short_id
      FROM tracks t
      JOIN short_urls su ON t.id = su.track_id
      WHERE t.isrc = $1
      LIMIT 1
    `, [isrc]);

    if (rows.length === 0) return null;

    return { trackId: rows[0].track_id, shortId: rows[0].short_id };
  }

  async loadByShortId(shortId: string): Promise<SharePageDbResult | null> {
    const rows = await this.db
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
      .where(eq(schema.shortUrls.id, shortId));

    if (rows.length === 0) return null;

    return this.buildSharePageResult(rows, shortId);
  }

  async loadByTrackId(trackId: string): Promise<SharePageDbResult | null> {
    const rows = await this.db
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
      .where(eq(schema.tracks.id, trackId));

    if (rows.length === 0) return null;

    const shortId = rows[0].shortUrlId ?? trackId;
    return this.buildSharePageResult(rows, shortId);
  }

  async persistTrackWithLinks(data: PersistTrackData): Promise<{ trackId: string; shortId: string }> {
    const now = Date.now();

    return await this.db.transaction(async (tx) => {
      // Check for existing track by ISRC
      if (data.sourceTrack.isrc) {
        const existingRows = await tx
          .select({ trackId: schema.tracks.id, shortId: schema.shortUrls.id })
          .from(schema.tracks)
          .innerJoin(schema.shortUrls, eq(schema.shortUrls.trackId, schema.tracks.id))
          .where(eq(schema.tracks.isrc, data.sourceTrack.isrc))
          .limit(1);

        if (existingRows.length > 0) {
          const existing = existingRows[0];

          // Update timestamp to mark this track as freshly resolved
          await tx.update(schema.tracks).set({ updatedAt: now }).where(eq(schema.tracks.id, existing.trackId));

          for (const link of data.links) {
            await tx.insert(schema.serviceLinks).values({
              id: generateTrackId(),
              trackId: existing.trackId,
              service: link.service,
              externalId: null,
              url: link.url,
              confidence: link.confidence,
              matchMethod: link.matchMethod,
              createdAt: now,
            }).onConflictDoNothing();
          }
          return { trackId: existing.trackId, shortId: existing.shortId };
        }
      }

      // Insert new track
      const newTrackId = generateTrackId();
      const newShortId = generateShortId();

      await tx.insert(schema.tracks).values({
        id: newTrackId,
        title: data.sourceTrack.title,
        artists: JSON.stringify(data.sourceTrack.artists),
        albumName: data.sourceTrack.albumName ?? null,
        isrc: data.sourceTrack.isrc ?? null,
        artworkUrl: data.sourceTrack.artworkUrl ?? null,
        durationMs: data.sourceTrack.durationMs ? Math.floor(data.sourceTrack.durationMs) : null,
        createdAt: now,
        updatedAt: now,
      });

      for (const link of data.links) {
        await tx.insert(schema.serviceLinks).values({
          id: generateTrackId(),
          trackId: newTrackId,
          service: link.service,
          externalId: null,
          url: link.url,
          confidence: link.confidence,
          matchMethod: link.matchMethod,
          createdAt: now,
        }).onConflictDoNothing();
      }

      await tx.insert(schema.shortUrls).values({
        id: newShortId,
        trackId: newTrackId,
        createdAt: now,
      });

      return { trackId: newTrackId, shortId: newShortId };
    });
  }

  async cleanupStaleCache(ttlMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - ttlMs;

    await this.pool.query(`
      DELETE FROM service_links
      WHERE track_id IN (
        SELECT t.id FROM tracks t
        LEFT JOIN short_urls su ON su.track_id = t.id
        WHERE t.updated_at < $1 AND su.id IS NULL
      )
    `, [cutoff]);

    const result = await this.pool.query(`
      DELETE FROM tracks
      WHERE updated_at < $1
      AND id NOT IN (SELECT track_id FROM short_urls)
    `, [cutoff]);

    return result.rowCount ?? 0;
  }

  async updateTrackTimestamp(trackId: string): Promise<void> {
    await this.pool.query(`UPDATE tracks SET updated_at = $1 WHERE id = $2`, [Date.now(), trackId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // --- Private helpers ---

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

    return { trackId: firstRow.id, updatedAt: firstRow.updated_at ?? firstRow.created_at, track, links };
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
