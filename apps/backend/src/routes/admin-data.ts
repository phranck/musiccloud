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
}
