import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import * as schema from "./schema";
import type { NormalizedTrack } from "../services/types.js";
import { log } from "../lib/logger.js";

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

const dbPath = import.meta.env.DATABASE_PATH || "data/music.db";
export const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

function safeParseArray(json: string, fallback: string[] = []): string[] {
  try { return JSON.parse(json); }
  catch { return fallback; }
}

/**
 * Find a cached track by its web URL (from any service)
 */
export function findTrackByUrl(url: string): { track: NormalizedTrack; links: any[] } | null {
  const stmt = sqlite.prepare(`
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

  const firstRow = rows[0];
  const track: NormalizedTrack = {
    sourceService: "cached",
    sourceId: firstRow.id,
    title: firstRow.title,
    artists: safeParseArray(firstRow.artists, ["Unknown Artist"]),
    albumName: firstRow.album_name ?? undefined,
    isrc: firstRow.isrc ?? undefined,
    artworkUrl: firstRow.artwork_url ?? undefined,
    durationMs: firstRow.duration_ms ?? undefined,
    webUrl: url,
  };

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

/**
 * Find cached tracks by full-text search (title + artists)
 * Returns up to maxResults tracks sorted by FTS5 rank
 */
function escapeFts5(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

export function findTracksByTextSearch(query: string, maxResults: number = 10): NormalizedTrack[] {
  try {
    // Escape FTS5 metacharacters to prevent injection
    const ftsQuery = `${escapeFts5(query)}*`;

    const stmt = sqlite.prepare(`
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

    return rows.map((r) => ({
      sourceService: "cached",
      sourceId: r.id,
      title: r.title,
      artists: safeParseArray(r.artists, ["Unknown Artist"]),
      albumName: r.album_name ?? undefined,
      isrc: r.isrc ?? undefined,
      artworkUrl: r.artwork_url ?? undefined,
      durationMs: r.duration_ms ?? undefined,
      webUrl: "",
    }));
  } catch (error) {
    log.error("DB", "findTracksByTextSearch error:", error);
    return [];
  }
}

/**
 * Find a cached track by ISRC
 */
export function findTrackByIsrc(isrc: string): { track: NormalizedTrack; links: Array<{ service: string; url: string; confidence: number; matchMethod: string }> } | null {
  const stmt = sqlite.prepare(`
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

  const firstRow = rows[0];
  const track: NormalizedTrack = {
    sourceService: "cached",
    sourceId: firstRow.id,
    title: firstRow.title,
    artists: safeParseArray(firstRow.artists, ["Unknown Artist"]),
    albumName: firstRow.album_name ?? undefined,
    isrc: firstRow.isrc ?? undefined,
    artworkUrl: firstRow.artwork_url ?? undefined,
    durationMs: firstRow.duration_ms ?? undefined,
    webUrl: "",
  };

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

/**
 * Find an existing track + short URL by ISRC.
 * Used for deduplication: if a track with this ISRC already exists,
 * we reuse the existing short URL instead of creating a new one.
 */
export function findExistingByIsrc(isrc: string): { trackId: string; shortId: string } | null {
  const stmt = sqlite.prepare(`
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

/**
 * Remove cached tracks (and their service links) older than the given TTL.
 * Short URLs are preserved to avoid breaking shared links.
 * Tracks with short URLs are kept; only orphaned cache entries are removed.
 */
export function cleanupStaleCache(ttlMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - ttlMs;
  const result = sqlite.prepare(`
    DELETE FROM service_links
    WHERE track_id IN (
      SELECT t.id FROM tracks t
      LEFT JOIN short_urls su ON su.track_id = t.id
      WHERE t.updated_at < ? AND su.id IS NULL
    )
  `).run(cutoff);

  sqlite.prepare(`
    DELETE FROM tracks
    WHERE updated_at < ?
    AND id NOT IN (SELECT track_id FROM short_urls)
  `).run(cutoff);

  return result.changes;
}

// Schedule cache cleanup every 6 hours
setInterval(() => cleanupStaleCache(), 6 * 60 * 60 * 1000);
