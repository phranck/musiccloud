import type { FastifyInstance } from "fastify";
import { getAdminRepository } from "../db/index.js";
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

// ─── URL helpers ─────────────────────────────────────────────────────────────

function extractIdFromUrl(service: string, url: string): string | null {
  if (service === "deezer") {
    return url.match(/deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/i)?.[1] ?? null;
  }
  if (service === "spotify") {
    return url.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/i)?.[1] ?? null;
  }
  return null;
}

// ─── Backfill job ────────────────────────────────────────────────────────────

const DELAY_MS = 250;

async function runBackfillJob(): Promise<void> {
  const repo = await getAdminRepository();
  try {
    const rows = await repo.getTracksForPreviewBackfill();
    const total = rows.length;
    adminEventBroadcaster.emit({ type: "backfill:started", data: { total } });

    let processed = 0;
    let updated = 0;

    for (const row of rows) {
      const links = await repo.getServiceLinksForBackfill(row.id);
      let previewUrl: string | null = null;

      for (const link of links) {
        const externalId = link.external_id ?? extractIdFromUrl(link.service, link.url);
        if (!externalId) continue;
        await sleep(DELAY_MS);

        if (link.service === "deezer") {
          previewUrl = await getDeezerPreview(externalId);
          if (previewUrl) break;
        } else if (link.service === "spotify") {
          previewUrl = await getSpotifyPreview(externalId);
          if (previewUrl) break;
        }
      }

      // Fallback: if stored IDs returned no preview, try Deezer ISRC lookup
      if (!previewUrl && row.isrc) {
        await sleep(DELAY_MS);
        previewUrl = await getDeezerPreviewByIsrc(row.isrc);
      }

      if (previewUrl) {
        await repo.updatePreviewUrl(row.id, previewUrl);
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
    isRunning = false;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export default async function adminBackfillRoutes(app: FastifyInstance) {
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
    runBackfillJob().catch(() => {
      isRunning = false;
    });
    return { ok: true };
  });
}
