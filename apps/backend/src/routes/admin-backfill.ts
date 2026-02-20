import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { getAdminRepository } from "../db/index.js";
import { loadDatabaseConfig } from "../db/config.js";
import { adminEventBroadcaster } from "../lib/event-broadcaster.js";

// ─── Job state ──────────────────────────────────────────────────────────────

let isRunning = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Deezer (public API, no auth) ───────────────────────────────────────────

async function parseDeezerPreview(data: { preview?: string; error?: unknown }): Promise<string | null> {
  if ("error" in data) return null;
  return data.preview || null; // || catches empty string too
}

async function getDeezerPreview(externalId: string): Promise<string | null> {
  try {
    const res = await timedFetch(`https://api.deezer.com/track/${externalId}`);
    if (!res.ok) return null;
    return parseDeezerPreview((await res.json()) as { preview?: string; error?: unknown });
  } catch {
    return null;
  }
}

async function getDeezerPreviewByIsrc(isrc: string): Promise<string | null> {
  try {
    const res = await timedFetch(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
    if (!res.ok) return null;
    return parseDeezerPreview((await res.json()) as { preview?: string; error?: unknown });
  } catch {
    return null;
  }
}

// ─── Spotify (OAuth client_credentials) ─────────────────────────────────────

interface SpotifyToken {
  value: string;
  expiresAt: number;
}

let cachedSpotifyToken: SpotifyToken | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedSpotifyToken && Date.now() < cachedSpotifyToken.expiresAt - 60_000) {
    return cachedSpotifyToken.value;
  }

  try {
    const res = await timedFetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
      8000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedSpotifyToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedSpotifyToken.value;
  } catch {
    return null;
  }
}

async function getSpotifyPreview(externalId: string): Promise<string | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    const res = await timedFetch(`https://api.spotify.com/v1/tracks/${externalId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { preview_url?: string | null };
    return data.preview_url ?? null;
  } catch {
    return null;
  }
}

// ─── DB row types ────────────────────────────────────────────────────────────

interface TrackRow {
  id: string;
  title: string;
  artists: string;
  isrc: string | null;
}

interface ServiceLinkRow {
  service: string;
  external_id: string | null;
}

// ─── Backfill job ────────────────────────────────────────────────────────────

const DELAY_MS = 250;

async function runBackfillJob(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT t.id, t.title, t.artists, t.isrc
         FROM tracks t
         JOIN service_links sl ON sl.track_id = t.id
         WHERE t.preview_url IS NULL
           AND sl.service IN ('deezer', 'spotify')
         ORDER BY t.created_at DESC`,
      )
      .all() as TrackRow[];

    const total = rows.length;
    adminEventBroadcaster.emit({ type: "backfill:started", data: { total } });

    const updateStmt = db.prepare("UPDATE tracks SET preview_url = ?, updated_at = ? WHERE id = ?");
    let processed = 0;
    let updated = 0;

    for (const row of rows) {
      const links = db
        .prepare(
          `SELECT service, external_id
           FROM service_links
           WHERE track_id = ?
             AND service IN ('deezer', 'spotify')
           ORDER BY CASE service WHEN 'deezer' THEN 1 WHEN 'spotify' THEN 2 END`,
        )
        .all(row.id) as ServiceLinkRow[];

      let previewUrl: string | null = null;

      for (const link of links) {
        if (!link.external_id) continue;
        await sleep(DELAY_MS);

        if (link.service === "deezer") {
          previewUrl = await getDeezerPreview(link.external_id);
          if (previewUrl) break;
        } else if (link.service === "spotify") {
          previewUrl = await getSpotifyPreview(link.external_id);
          if (previewUrl) break;
        }
      }

      // Fallback: if stored IDs returned no preview, try Deezer ISRC lookup
      if (!previewUrl && row.isrc) {
        await sleep(DELAY_MS);
        previewUrl = await getDeezerPreviewByIsrc(row.isrc);
      }

      if (previewUrl) {
        updateStmt.run(previewUrl, Date.now(), row.id);
        updated++;
      }

      processed++;
      adminEventBroadcaster.emit({
        type: "backfill:progress",
        data: { processed, updated, total },
      });
    }

    adminEventBroadcaster.emit({
      type: "backfill:done",
      data: { updated, noneFound: total - updated, total },
    });
  } catch (err) {
    adminEventBroadcaster.emit({
      type: "backfill:error",
      data: { message: err instanceof Error ? err.message : "Unknown error" },
    });
  } finally {
    db.close();
    isRunning = false;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export default async function adminBackfillRoutes(app: FastifyInstance) {
  app.get("/api/admin/backfill/preview-urls/debug", async () => {
    const config = loadDatabaseConfig();
    const db = new Database(config.path);
    try {
      interface DebugRow {
        id: string;
        title: string;
        isrc: string | null;
        preview_url: string | null;
        service: string;
        external_id: string | null;
      }
      const rows = db.prepare(
        `SELECT t.id, t.title, t.isrc, t.preview_url, sl.service, sl.external_id
         FROM tracks t
         JOIN service_links sl ON sl.track_id = t.id
         WHERE t.preview_url IS NULL
           AND sl.service IN ('deezer', 'spotify')
         ORDER BY t.title`,
      ).all() as DebugRow[];
      return rows;
    } finally {
      db.close();
    }
  });

  app.get("/api/admin/backfill/preview-urls/status", async () => {
    const repo = await getAdminRepository();
    const missing = await repo.countTracksWithMissingPreviewUrl();
    return { missing, isRunning };
  });

  app.post("/api/admin/backfill/preview-urls/start", async (_request, reply) => {
    if (isRunning) {
      return reply.status(409).send({ error: "already_running" });
    }
    isRunning = true;
    const config = loadDatabaseConfig();
    runBackfillJob(config.path).catch(() => {
      isRunning = false;
    });
    return { ok: true };
  });
}
