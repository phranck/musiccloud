import type { FastifyInstance } from "fastify";
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
    return (await getManagedUmamiMetrics(q.type, q.period)) ?? [];
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
