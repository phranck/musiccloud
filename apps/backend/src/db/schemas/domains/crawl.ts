import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Per-source crawler state. Populated lazily on heartbeat tick via
// idempotent ON CONFLICT DO NOTHING upsert from the in-memory registry,
// so adding a new source costs zero migration work. Mutable fields
// (`enabled`, `intervalMinutes`, `config`, `cursor`) are written from the
// admin API at runtime; transient fields (`runningSince`, `lastRunAt`,
// `nextRunAt`, `consecutiveErrors`, `lastError`) are written by the
// heartbeat itself. Partial index on `nextRunAt WHERE enabled = true`
// keeps the per-minute "is anything due?" probe O(log n_active).
/**
 * Mutable scheduler state for each registered crawler source.
 * Seeded idempotently from the in-memory source registry and updated by the
 * admin API and heartbeat runner.
 */
export const crawlState = pgTable(
  "crawl_state",
  {
    source: text("source").primaryKey(),
    displayName: text("display_name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    intervalMinutes: integer("interval_minutes").notNull().default(360),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    cursor: jsonb("cursor"),
    config: jsonb("config").notNull().default({}),
    runningSince: timestamp("running_since", { withTimezone: true }),
    errorCount: integer("error_count").notNull().default(0),
    lastError: text("last_error"),
    consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  },
  (table) => [index("idx_crawl_state_due").on(table.nextRunAt).where(sql`${table.enabled} = true`)],
);

export type CrawlStateRow = typeof crawlState.$inferSelect;
export type CrawlStateInsert = typeof crawlState.$inferInsert;

// Per-tick observability log. One row per source per heartbeat tick that
// did real work (skipped/locked ticks are recorded as `status = 'skipped'`
// only when a tick was actually attempted but lock acquisition failed,
// while purely idle minutes write nothing). Counters get finalized in the same
// transaction as the `crawl_state` update.
/**
 * Historical crawler heartbeat run records.
 * Captures per-tick status, counters and notes for admin observability and
 * debugging of background ingestion sources.
 */
export const crawlRuns = pgTable(
  "crawl_runs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(), // 'running' | 'success' | 'error' | 'aborted' | 'skipped'
    discovered: integer("discovered").notNull().default(0),
    ingested: integer("ingested").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    notes: text("notes"),
  },
  (table) => [
    index("idx_crawl_runs_source_started").on(table.source, table.startedAt.desc()),
    index("idx_crawl_runs_started_at").on(table.startedAt.desc()),
  ],
);

export type CrawlRunRow = typeof crawlRuns.$inferSelect;
export type CrawlRunInsert = typeof crawlRuns.$inferInsert;
