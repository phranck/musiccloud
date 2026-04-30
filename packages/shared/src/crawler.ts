/**
 * Wire-format types for the crawler admin endpoints.
 *
 * Mirrors the shape of `plugins.ts`: one info type for the admin dashboard
 * (`CrawlerSourceInfo`), one for the run-history table (`CrawlerRunInfo`),
 * one paginated wrapper for the run-history endpoint. All timestamps are
 * ISO 8601 strings so the wire format stays JSON-friendly; the backend
 * serialises `Date` to ISO automatically via Fastify, the frontend parses
 * back with `new Date(...)` when needed.
 */

/**
 * Shape returned by `GET /api/admin/crawler/sources` (one entry per row in
 * `crawl_state`) and by `PATCH /api/admin/crawler/sources/:id` (the single
 * affected entry, so the dashboard can update its row in place).
 */
export interface CrawlerSourceInfo {
  /** Stable id, primary key of `crawl_state`. */
  source: string;
  displayName: string;
  enabled: boolean;
  intervalMinutes: number;
  /** ISO 8601 timestamp — when the next tick is due. */
  nextRunAt: string;
  /** ISO 8601 timestamp or null — when the most recent tick finished. */
  lastRunAt: string | null;
  /** Free-form per-source config blob (chart genre IDs, tag list, etc.). */
  config: Record<string, unknown>;
  /** Opaque per-source pagination state. */
  cursor: unknown;
  /** ISO 8601 timestamp or null — set while a tick is in progress. */
  runningSince: string | null;
  errorCount: number;
  /** Resets to 0 on a successful tick; auto-disables source at threshold. */
  consecutiveErrors: number;
  /** Most recent fetch-failure message; cleared on next success. */
  lastError: string | null;
}

/**
 * Shape returned by `GET /api/admin/crawler/runs` (one entry per row in
 * `crawl_runs`). Counters are running totals for that single tick.
 */
export interface CrawlerRunInfo {
  id: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  /** `running` | `success` | `error` | `aborted` | `skipped`. */
  status: string;
  discovered: number;
  ingested: number;
  skipped: number;
  errors: number;
  notes: string | null;
}

/** Paginated wrapper returned by `GET /api/admin/crawler/runs`. */
export interface CrawlerRunsPage {
  items: CrawlerRunInfo[];
  total: number;
  page: number;
  limit: number;
}
