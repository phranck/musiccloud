import type { FastifyInstance } from "fastify";
import { getAdminRepository } from "../db/index.js";
import {
  getManagedUmamiActive,
  getManagedUmamiInteractionTotal,
  getManagedUmamiLinkClicksByService,
  getManagedUmamiLinkClickTotal,
  getManagedUmamiMetrics,
  getManagedUmamiPageviews,
  getManagedUmamiRealtime,
  getManagedUmamiResolvesByService,
  getManagedUmamiResolveTotal,
  getManagedUmamiStats,
} from "../services/admin-umami.js";

export default async function adminAnalyticsRoutes(app: FastifyInstance) {
  app.get("/api/admin/analytics/stats", async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiStats(q.period)) ?? {};
  });

  app.get("/api/admin/analytics/pageviews", async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiPageviews(q.period)) ?? {};
  });

  app.get("/api/admin/analytics/metrics", async (request) => {
    const q = request.query as { period?: string; type?: string };
    const raw = (await getManagedUmamiMetrics(q.type, q.period)) ?? [];

    if (q.type === "url" && Array.isArray(raw) && raw.length > 0) {
      const shortIds = raw
        .map((row: { x?: string }) => (row.x ?? "").replace(/^\//, ""))
        .filter((id: string) => id !== "" && id !== "/");
      if (shortIds.length > 0) {
        const repo = await getAdminRepository();
        const infoMap = await repo.resolveShortIds(shortIds);
        return raw.map((row: { x?: string; y?: number }) => {
          const id = (row.x ?? "").replace(/^\//, "");
          const info = infoMap.get(id);
          return info ? { ...row, title: info.title, artist: info.artist } : row;
        });
      }
    }

    return raw;
  });

  app.get("/api/admin/analytics/active", async () => {
    return (await getManagedUmamiActive()) ?? {};
  });

  app.get("/api/admin/analytics/realtime", async () => {
    return (await getManagedUmamiRealtime()) ?? {};
  });

  // --- musiccloud-specific event endpoints ---

  app.get("/api/admin/analytics/events/resolves", async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiResolvesByService(q.period)) ?? [];
  });

  app.get("/api/admin/analytics/events/resolves/total", async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiResolveTotal(q.period)) ?? { total: 0 };
  });

  app.get("/api/admin/analytics/events/link-clicks", async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiLinkClicksByService(q.period)) ?? [];
  });

  app.get("/api/admin/analytics/events/link-clicks/total", async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiLinkClickTotal(q.period)) ?? { total: 0 };
  });

  app.get("/api/admin/analytics/events/interactions/total", async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiInteractionTotal(q.period)) ?? { total: 0 };
  });
}
