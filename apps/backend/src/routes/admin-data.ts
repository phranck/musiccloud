import type { FastifyInstance } from "fastify";
import { getAdminRepository } from "../db/index.js";

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
}
