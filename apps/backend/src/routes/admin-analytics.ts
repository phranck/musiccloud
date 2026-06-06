/**
 * @file Admin analytics endpoints backed by the managed Umami instance.
 *
 * Thin HTTP surface on top of `services/admin-umami.ts`. Each handler
 * forwards the `period` query param (24h / 7d / 30d etc.) to the service
 * and returns what Umami sends back.
 *
 * ## Null coalescing defaults
 *
 * Every handler applies a `?? {}` or `?? []` or `?? { total: 0 }` fallback.
 * The service layer swallows errors and returns `null` on failure, so
 * these defaults are what the admin dashboard receives when Umami is
 * temporarily unreachable. The shape of each fallback matches what the
 * dashboard expects for that card: an empty series renders as "no data"
 * instead of crashing.
 *
 * ## URL metric enrichment
 *
 * The `metrics` endpoint with `type=url` is the one handler that does more
 * than forward. Umami returns rows of `{ x: "/<shortId>", y: <views> }`;
 * the dashboard's "Top Tracks" card wants to show human-readable titles
 * and artists, not opaque short IDs. This handler strips the leading slash
 * to recover the short ID, asks the admin repository for track metadata,
 * and attaches `title` + `artist` where a match exists. Rows with no
 * match pass through untouched, which keeps non-track pages (e.g. `/about`)
 * still visible.
 *
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getAdminRepository } from "../db/index.js";
import {
  getManagedUmamiActive,
  getManagedUmamiMetrics,
  getManagedUmamiPageviews,
  getManagedUmamiRealtime,
  getManagedUmamiStats,
} from "../services/admin-umami.js";

export default async function adminAnalyticsRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.analytics.stats, async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiStats(q.period)) ?? {};
  });

  app.get(ENDPOINTS.admin.analytics.pageviews, async (request) => {
    const q = request.query as { period?: string };
    return (await getManagedUmamiPageviews(q.period)) ?? {};
  });

  app.get(ENDPOINTS.admin.analytics.metrics, async (request) => {
    const q = request.query as { period?: string; type?: string };
    const raw = (await getManagedUmamiMetrics(q.type, q.period)) ?? [];

    // Only the `url` dimension carries share pages; other dimensions
    // (referrer, country, browser...) ship through unchanged.
    if (q.type === "url" && Array.isArray(raw) && raw.length > 0) {
      const shortIds = raw
        .map((row: { x?: string }) => (row.x ?? "").replace(/^\//, ""))
        .filter((id: string) => id !== "" && id !== "/");
      if (shortIds.length > 0) {
        const repo = await getAdminRepository();
        // Single batched lookup across the whole page of metrics rows.
        // Doing one call per row would N+1 against the DB for a
        // top-pages card that typically already shows 20+ entries.
        const infoMap = await repo.resolveShortIds(shortIds);
        return raw.map((row: { x?: string; y?: number }) => {
          const id = (row.x ?? "").replace(/^\//, "");
          const info = infoMap.get(id);
          // Leave rows without a match untouched: non-track pages
          // (`/about`, `/privacy`, ...) belong in the list too.
          return info ? { ...row, title: info.title, artist: info.artist } : row;
        });
      }
    }

    return raw;
  });

  app.get(ENDPOINTS.admin.analytics.active, async () => {
    return (await getManagedUmamiActive()) ?? {};
  });

  app.get(ENDPOINTS.admin.analytics.realtime, async () => {
    return (await getManagedUmamiRealtime()) ?? {};
  });
}
