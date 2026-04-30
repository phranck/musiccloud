/**
 * @file Admin endpoints for the crawler subsystem.
 *
 * Registered inside the admin scope in `server.ts`, so every request has
 * passed `authenticateAdmin` (Bearer JWT with `role: "admin"`) before this
 * handler runs.
 *
 * Five endpoints:
 *
 * - `GET    /sources`                   — list every `crawl_state` row.
 * - `PATCH  /sources/:id`               — mutate `enabled`, `intervalMinutes`, `config`, or `cursor`.
 * - `POST   /sources/:id/run-now`       — set `next_run_at = NOW()`; heartbeat picks up next minute.
 * - `POST   /sources/:id/release-lock`  — clear a stuck `running_since` so the next tick can re-acquire.
 * - `GET    /runs?source=&page=&limit=` — paginated `crawl_runs` history.
 *
 * The list endpoint also re-seeds every registry-known source on entry. That's
 * idempotent (`ON CONFLICT DO NOTHING`) and means a freshly-deployed source
 * appears in the dashboard immediately, not "after the next heartbeat tick".
 */
import {
  type CrawlerRunInfo,
  type CrawlerRunsPage,
  type CrawlerSourceInfo,
  ENDPOINTS,
  ROUTE_TEMPLATES,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import type { CrawlRunRecord, CrawlStateRecord } from "../db/repository.js";
import { getCrawlerSource, listCrawlerSources } from "../services/crawler/registry.js";

function rowToSourceInfo(row: CrawlStateRecord): CrawlerSourceInfo {
  return {
    source: row.source,
    displayName: row.displayName,
    enabled: row.enabled,
    intervalMinutes: row.intervalMinutes,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    config: row.config,
    cursor: row.cursor,
    runningSince: row.runningSince ? row.runningSince.toISOString() : null,
    errorCount: row.errorCount,
    consecutiveErrors: row.consecutiveErrors,
    lastError: row.lastError,
  };
}

function rowToRunInfo(row: CrawlRunRecord): CrawlerRunInfo {
  return {
    id: row.id,
    source: row.source,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    status: row.status,
    discovered: row.discovered,
    ingested: row.ingested,
    skipped: row.skipped,
    errors: row.errors,
    notes: row.notes,
  };
}

async function listAllSources(): Promise<CrawlerSourceInfo[]> {
  const repo = await getRepository();
  // Seed any registry-known source that isn't yet in `crawl_state`. Cheap
  // and idempotent (`ON CONFLICT DO NOTHING`); ensures a freshly-deployed
  // source appears in the admin list without waiting for the next tick.
  for (const source of listCrawlerSources()) {
    await repo.seedCrawlState({
      source: source.id,
      displayName: source.displayName,
      defaultEnabled: source.defaultEnabled,
      defaultIntervalMinutes: source.defaultIntervalMinutes,
      defaultConfig: source.defaultConfig,
    });
  }
  const records = await repo.listCrawlState();
  return records.map(rowToSourceInfo);
}

interface SourcePatchBody {
  enabled?: unknown;
  intervalMinutes?: unknown;
  config?: unknown;
  cursor?: unknown;
}

export default async function adminCrawlerRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.crawler.sources, async () => {
    return listAllSources();
  });

  app.patch<{ Params: { id: string }; Body: SourcePatchBody }>(
    ROUTE_TEMPLATES.admin.crawler.sourceDetail,
    async (request, reply) => {
      const { id } = request.params;
      if (!getCrawlerSource(id)) {
        return reply.status(404).send({ error: "NOT_FOUND", message: `Unknown crawler source: ${id}` });
      }

      const body = request.body ?? {};
      const patch: Parameters<Awaited<ReturnType<typeof getRepository>>["updateCrawlState"]>[1] = {};

      if (body.enabled !== undefined) {
        if (typeof body.enabled !== "boolean") {
          return reply.status(400).send({ error: "INVALID_BODY", message: "`enabled` must be boolean." });
        }
        patch.enabled = body.enabled;
      }
      if (body.intervalMinutes !== undefined) {
        if (
          typeof body.intervalMinutes !== "number" ||
          body.intervalMinutes < 1 ||
          !Number.isFinite(body.intervalMinutes)
        ) {
          return reply
            .status(400)
            .send({ error: "INVALID_BODY", message: "`intervalMinutes` must be a positive number." });
        }
        patch.intervalMinutes = Math.floor(body.intervalMinutes);
      }
      if (body.config !== undefined) {
        if (typeof body.config !== "object" || body.config === null || Array.isArray(body.config)) {
          return reply.status(400).send({ error: "INVALID_BODY", message: "`config` must be an object." });
        }
        patch.config = body.config as Record<string, unknown>;
      }
      if (body.cursor !== undefined) {
        // cursor accepts any JSON-serialisable value, including null.
        patch.cursor = body.cursor;
      }

      const repo = await getRepository();
      const updated = await repo.updateCrawlState(id, patch);
      if (!updated) {
        return reply.status(404).send({ error: "NOT_FOUND", message: `Source row not found: ${id}` });
      }
      return rowToSourceInfo(updated);
    },
  );

  app.post<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.crawler.sourceRunNow, async (request, reply) => {
    const { id } = request.params;
    if (!getCrawlerSource(id)) {
      return reply.status(404).send({ error: "NOT_FOUND", message: `Unknown crawler source: ${id}` });
    }
    const repo = await getRepository();
    const updated = await repo.updateCrawlState(id, { nextRunAt: new Date() });
    if (!updated) {
      return reply.status(404).send({ error: "NOT_FOUND", message: `Source row not found: ${id}` });
    }
    return rowToSourceInfo(updated);
  });

  app.post<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.crawler.sourceReleaseLock, async (request, reply) => {
    const { id } = request.params;
    if (!getCrawlerSource(id)) {
      return reply.status(404).send({ error: "NOT_FOUND", message: `Unknown crawler source: ${id}` });
    }
    const repo = await getRepository();
    const updated = await repo.updateCrawlState(id, { runningSince: null });
    if (!updated) {
      return reply.status(404).send({ error: "NOT_FOUND", message: `Source row not found: ${id}` });
    }
    return rowToSourceInfo(updated);
  });

  app.get<{ Querystring: { source?: string; page?: string; limit?: string } }>(
    ENDPOINTS.admin.crawler.runs,
    async (request, reply): Promise<CrawlerRunsPage | { error: string; message: string }> => {
      const { source, page: pageStr, limit: limitStr } = request.query;
      const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
      const limit = limitStr ? Math.min(200, Math.max(1, parseInt(limitStr, 10))) : 50;
      if (!Number.isFinite(page) || !Number.isFinite(limit)) {
        return reply
          .status(400)
          .send({ error: "INVALID_QUERY", message: "`page` and `limit` must be positive integers." });
      }

      const repo = await getRepository();
      const result = await repo.listCrawlRuns({ source, page, limit });
      return {
        items: result.items.map(rowToRunInfo),
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    },
  );
}
