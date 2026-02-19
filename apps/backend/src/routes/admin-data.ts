import type { FastifyInstance } from "fastify";
import { getAdminRepository } from "../db/index.js";

export default async function adminDataRoutes(app: FastifyInstance) {
  app.get("/api/admin/tracks", async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;

    const repo = await getAdminRepository();
    return repo.listTracks({ page, limit, q: search });
  });

  app.get("/api/admin/albums", async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;

    const repo = await getAdminRepository();
    return repo.listAlbums({ page, limit, q: search });
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
}
