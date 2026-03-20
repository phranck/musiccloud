import type { FastifyInstance } from "fastify";
import { getAdminRepository } from "../db/index.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";

export default async function adminDataRoutes(app: FastifyInstance) {
  app.get("/api/admin/tracks", async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string; sortBy?: string; sortDir?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;
    const sortDir = q.sortDir === "asc" || q.sortDir === "desc" ? q.sortDir : undefined;

    const repo = await getAdminRepository();
    return repo.listTracks({ page, limit, q: search, sortBy: q.sortBy, sortDir });
  });

  app.get("/api/admin/albums", async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string; sortBy?: string; sortDir?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;
    const sortDir = q.sortDir === "asc" || q.sortDir === "desc" ? q.sortDir : undefined;

    const repo = await getAdminRepository();
    return repo.listAlbums({ page, limit, q: search, sortBy: q.sortBy, sortDir });
  });

  app.get("/api/admin/tracks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const repo = await getAdminRepository();
    const track = await repo.getTrackById(id);
    if (!track) return reply.status(404).send({ error: "Track not found" });
    return track;
  });

  app.patch("/api/admin/tracks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") data.title = body.title;
    if (Array.isArray(body.artists)) data.artists = body.artists;
    if (body.albumName !== undefined) data.albumName = body.albumName ?? null;
    if (body.isrc !== undefined) data.isrc = body.isrc ?? null;
    if (body.artworkUrl !== undefined) data.artworkUrl = body.artworkUrl ?? null;
    if (Object.keys(data).length === 0) return reply.status(400).send({ error: "No valid fields to update" });
    const repo = await getAdminRepository();
    await repo.updateTrack(id, data);
    return { ok: true };
  });

  app.delete("/api/admin/tracks", async (request, reply) => {
    const body = request.body as { ids?: unknown };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: "ids array required" });
    }
    const ids = (body.ids as unknown[]).filter((id): id is string => typeof id === "string");
    const repo = await getAdminRepository();
    await repo.deleteTracks(ids);
    return { deleted: ids.length };
  });

  app.patch("/api/admin/tracks/:shortId/featured", async (request, reply) => {
    const { shortId } = request.params as { shortId: string };
    const body = request.body as { featured?: unknown };
    if (typeof body?.featured !== "boolean") {
      return reply.status(400).send({ error: "featured (boolean) required" });
    }
    const repo = await getAdminRepository();
    await repo.setTrackFeatured(shortId, body.featured);
    return { ok: true };
  });

  app.patch("/api/admin/albums/:shortId/featured", async (request, reply) => {
    const { shortId } = request.params as { shortId: string };
    const body = request.body as { featured?: unknown };
    if (typeof body?.featured !== "boolean") {
      return reply.status(400).send({ error: "featured (boolean) required" });
    }
    const repo = await getAdminRepository();
    await repo.setAlbumFeatured(shortId, body.featured);
    return { ok: true };
  });

  app.post("/api/admin/artist-cache/clear", async (_request, reply) => {
    const repo = await getAdminRepository();
    const result = await repo.clearArtistCache();
    return reply.send(result);
  });

  app.get("/api/admin/data-counts", async (_request, reply) => {
    const repo = await getAdminRepository();
    const counts = await repo.countAllData();
    return reply.send(counts);
  });

  app.post("/api/admin/reset-all", async (_request, reply) => {
    const repo = await getAdminRepository();
    const result = await repo.resetAllData();
    return reply.send(result);
  });

  app.delete("/api/admin/albums", async (request, reply) => {
    const body = request.body as { ids?: unknown };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: "ids array required" });
    }
    const ids = (body.ids as unknown[]).filter((id): id is string => typeof id === "string");
    const repo = await getAdminRepository();
    await repo.deleteAlbums(ids);
    return { deleted: ids.length };
  });

  app.get("/api/admin/stats", async () => {
    const repo = await getAdminRepository();
    const counts = await repo.countAllData();
    const adminCount = await repo.countAdmins();
    return { tracks: counts.tracks, albums: counts.albums, users: adminCount };
  });

  // --- Temporary Qobuz API diagnostics (remove after debugging) ---
  app.get("/api/admin/qobuz-diag", async () => {
    const APP_ID = process.env.QOBUZ_APP_ID ?? "377257687";
    const API_BASE = "https://www.qobuz.com/api.json/0.2";
    const UA =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const baseHeaders: Record<string, string> = { "User-Agent": UA, "X-App-Id": APP_ID };

    // Try to authenticate with Qobuz user credentials
    let authToken: string | null = null;
    let loginError: string | null = null;
    const email = process.env.QOBUZ_EMAIL;
    const password = process.env.QOBUZ_PASSWORD;

    if (email && password) {
      try {
        const loginRes = await fetchWithTimeout(
          `${API_BASE}/user/login`,
          {
            method: "POST",
            headers: { ...baseHeaders, "Content-Type": "application/x-www-form-urlencoded" },
            body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
          },
          10000,
        );
        const loginBody = await loginRes.text();
        if (loginRes.ok) {
          const loginData = JSON.parse(loginBody) as { user_auth_token?: string };
          authToken = loginData.user_auth_token ?? null;
        } else {
          loginError = `HTTP ${loginRes.status}: ${loginBody.slice(0, 200)}`;
        }
      } catch (err) {
        loginError = err instanceof Error ? err.message : "Unknown error";
      }
    }

    const authedHeaders = authToken ? { ...baseHeaders, "X-User-Auth-Token": authToken } : null;

    const endpoints = [
      { name: "track/get (ID 212123133)", url: `${API_BASE}/track/get?track_id=212123133` },
      { name: "track/search (zebrahead)", url: `${API_BASE}/track/search?query=zebrahead&limit=1` },
      { name: "catalog/search (zebrahead)", url: `${API_BASE}/catalog/search?query=zebrahead&limit=1` },
      { name: "album/get (0060253780968)", url: `${API_BASE}/album/get?album_id=0060253780968` },
    ];

    async function runTest(name: string, url: string, headers: Record<string, string>) {
      try {
        const res = await fetchWithTimeout(url, { headers }, 10000);
        const body = await res.text();
        return { name, status: res.status, ok: res.ok, bodyPreview: body.slice(0, 300) };
      } catch (err) {
        return { name, status: 0, ok: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    }

    const unauthResults = await Promise.all(endpoints.map((e) => runTest(e.name, e.url, baseHeaders)));

    const authResults = authedHeaders
      ? await Promise.all(endpoints.map((e) => runTest(`${e.name} [AUTH]`, e.url, authedHeaders)))
      : null;

    return {
      appId: APP_ID,
      env: {
        QOBUZ_APP_ID: process.env.QOBUZ_APP_ID ? "set" : "not set",
        QOBUZ_EMAIL: email ? "set" : "not set",
        QOBUZ_PASSWORD: password ? "set" : "not set",
      },
      auth: {
        token: authToken ? `${authToken.slice(0, 8)}...` : null,
        error: loginError,
      },
      unauthResults,
      authResults,
    };
  });
}
