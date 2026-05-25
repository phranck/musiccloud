/**
 * Crawler state + runs domain: scheduling, locking, status updates and
 * historical run records for periodic source crawlers (migration 0023).
 *
 * Scope:
 *   - Per-source state row (`crawl_state`): seed, lookup, listing,
 *     listing-due, partial patch, lock acquisition, tick completion.
 *   - Per-run history (`crawl_runs`): insert / finalize / paginate.
 *
 * Excludes:
 *   - Crawler scheduling logic (the heartbeat job calling these
 *     functions lives in `scripts/crawler-heartbeat.ts`).
 *   - Per-source ingestion plugins (`services/crawler/sources/*`).
 */

import type { Pool } from "pg";
import type {
  CrawlRunFinalize,
  CrawlRunInsert,
  CrawlRunRecord,
  CrawlRunsPage,
  CrawlStatePatch,
  CrawlStateRecord,
  CrawlStateSeed,
  CrawlTickOutcome,
} from "../repository.js";
import type { CountRow } from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

interface CrawlStateSqlRow {
  source: string;
  display_name: string;
  enabled: boolean;
  interval_minutes: number;
  next_run_at: Date;
  last_run_at: Date | null;
  cursor: unknown;
  config: Record<string, unknown> | null;
  running_since: Date | null;
  error_count: number;
  last_error: string | null;
  consecutive_errors: number;
}

interface CrawlRunSqlRow {
  id: string;
  source: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  discovered: number;
  ingested: number;
  skipped: number;
  errors: number;
  notes: string | null;
}

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * Maps a raw `crawl_state` row to {@link CrawlStateRecord}. A `NULL`
 * `config` becomes the empty object so callers never need a null-check
 * before spreading the JSON config.
 */
function rowToCrawlStateRecord(row: CrawlStateSqlRow): CrawlStateRecord {
  return {
    source: row.source,
    displayName: row.display_name,
    enabled: row.enabled,
    intervalMinutes: row.interval_minutes,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    cursor: row.cursor,
    config: row.config ?? {},
    runningSince: row.running_since,
    errorCount: row.error_count,
    lastError: row.last_error,
    consecutiveErrors: row.consecutive_errors,
  };
}

// ============================================================================
// CRAWL STATE
// ============================================================================

/**
 * Inserts the initial `crawl_state` row for a source if one does not
 * already exist. ON CONFLICT NOOP — safe to call on every startup.
 *
 * @param pool - Postgres connection pool.
 * @param seed - Initial values: source key, display name, default
 *   enabled flag, default interval, and the default JSON config.
 */
export async function seedCrawlState(pool: Pool, seed: CrawlStateSeed): Promise<void> {
  await pool.query(
    `INSERT INTO crawl_state (source, display_name, enabled, interval_minutes, config)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (source) DO NOTHING`,
    [
      seed.source,
      seed.displayName,
      seed.defaultEnabled,
      seed.defaultIntervalMinutes,
      JSON.stringify(seed.defaultConfig),
    ],
  );
}

/**
 * Loads one `crawl_state` row by source key.
 *
 * @param pool - Postgres connection pool.
 * @param source - The source key (e.g. `"deezer-charts"`).
 * @returns The state record, or `null` if no row matches.
 */
export async function findCrawlState(pool: Pool, source: string): Promise<CrawlStateRecord | null> {
  const result = await pool.query(
    `SELECT source, display_name, enabled, interval_minutes, next_run_at, last_run_at,
            cursor, config, running_since, error_count, last_error, consecutive_errors
     FROM crawl_state WHERE source = $1`,
    [source],
  );
  if (result.rows.length === 0) return null;
  return rowToCrawlStateRecord(result.rows[0] as CrawlStateSqlRow);
}

/**
 * Lists every `crawl_state` row ordered alphabetically by display name.
 * Used by the admin dashboard.
 */
export async function listCrawlState(pool: Pool): Promise<CrawlStateRecord[]> {
  const result = await pool.query(
    `SELECT source, display_name, enabled, interval_minutes, next_run_at, last_run_at,
            cursor, config, running_since, error_count, last_error, consecutive_errors
     FROM crawl_state
     ORDER BY display_name ASC`,
  );
  return (result.rows as CrawlStateSqlRow[]).map(rowToCrawlStateRecord);
}

/**
 * Lists every `crawl_state` row that is enabled, has `next_run_at` in
 * the past, and is not currently running. The heartbeat job consumes
 * this list to decide what to tick next.
 *
 * @param pool - Postgres connection pool.
 * @returns Due rows ordered by `next_run_at` ascending.
 */
export async function listDueCrawlState(pool: Pool): Promise<CrawlStateRecord[]> {
  const result = await pool.query(
    `SELECT source, display_name, enabled, interval_minutes, next_run_at, last_run_at,
            cursor, config, running_since, error_count, last_error, consecutive_errors
     FROM crawl_state
     WHERE enabled = true AND next_run_at <= NOW() AND running_since IS NULL
     ORDER BY next_run_at ASC`,
  );
  return (result.rows as CrawlStateSqlRow[]).map(rowToCrawlStateRecord);
}

/**
 * Partial patch on one `crawl_state` row. Only fields present on
 * `patch` are written. When `patch` is effectively empty (no diff),
 * re-reads via {@link findCrawlState}.
 *
 * @remarks `cursor` is JSON-encoded into a `jsonb` column;
 *   `runningSince: null` (explicit) clears the lock without taking a
 *   value parameter.
 *
 * @param pool - Postgres connection pool.
 * @param source - The source key.
 * @param patch - Fields to update.
 * @returns The updated row, or `null` if the row no longer exists.
 */
export async function updateCrawlState(
  pool: Pool,
  source: string,
  patch: CrawlStatePatch,
): Promise<CrawlStateRecord | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.enabled !== undefined) {
    sets.push(`enabled = $${idx++}`);
    values.push(patch.enabled);
  }
  if (patch.intervalMinutes !== undefined) {
    sets.push(`interval_minutes = $${idx++}`);
    values.push(patch.intervalMinutes);
  }
  if (patch.config !== undefined) {
    sets.push(`config = $${idx++}::jsonb`);
    values.push(JSON.stringify(patch.config));
  }
  if (patch.cursor !== undefined) {
    sets.push(`cursor = $${idx++}::jsonb`);
    values.push(patch.cursor === null ? null : JSON.stringify(patch.cursor));
  }
  if (patch.nextRunAt !== undefined) {
    sets.push(`next_run_at = $${idx++}`);
    values.push(patch.nextRunAt);
  }
  if (patch.runningSince === null) {
    sets.push(`running_since = NULL`);
  }

  if (sets.length === 0) {
    return findCrawlState(pool, source);
  }

  values.push(source);
  const result = await pool.query(
    `UPDATE crawl_state SET ${sets.join(", ")}
     WHERE source = $${idx}
     RETURNING source, display_name, enabled, interval_minutes, next_run_at, last_run_at,
               cursor, config, running_since, error_count, last_error, consecutive_errors`,
    values,
  );
  if (result.rows.length === 0) return null;
  return rowToCrawlStateRecord(result.rows[0] as CrawlStateSqlRow);
}

/**
 * Attempts to claim the crawl lock for one source by setting
 * `running_since = NOW()` if and only if either no lock is held or
 * the existing lock is stale (older than `maxRunMs`).
 *
 * @remarks Stale-detection covers prior heartbeat crashes or mid-run
 *   kills that left a stuck `running_since`. The compare-and-set is
 *   atomic via the `RETURNING` clause's `rowCount === 1` check.
 *
 * @param pool - Postgres connection pool.
 * @param source - The source key.
 * @param maxRunMs - Maximum allowed run age in milliseconds before a
 *   lock is considered stale.
 * @returns `true` when the caller now owns the lock.
 */
export async function acquireCrawlLock(pool: Pool, source: string, maxRunMs: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE crawl_state
       SET running_since = NOW()
       WHERE source = $1
         AND (running_since IS NULL OR running_since < NOW() - $2::bigint * INTERVAL '1 millisecond')
       RETURNING source`,
    [source, maxRunMs],
  );
  return result.rowCount === 1;
}

/**
 * Commits the outcome of one crawler tick. On success: clears the
 * lock, stamps `last_run_at`, advances `next_run_at`, persists the new
 * cursor, and resets the error counter. On failure: clears the lock,
 * stamps `last_run_at`, advances `next_run_at`, increments
 * `error_count` and `consecutive_errors`, persists the error message,
 * and auto-disables the source when consecutive errors hit the
 * threshold.
 *
 * @remarks The auto-disable CASE-WHEN reads the already-incremented
 *   `consecutive_errors + 1` so the threshold check is consistent
 *   inside the same UPDATE.
 *
 * @param pool - Postgres connection pool.
 * @param source - The source key.
 * @param outcome - Tick outcome (success / failure path differ).
 */
export async function completeCrawlTick(pool: Pool, source: string, outcome: CrawlTickOutcome): Promise<void> {
  const threshold = outcome.autoDisableThreshold ?? 5;
  if (outcome.success) {
    await pool.query(
      `UPDATE crawl_state
         SET running_since = NULL,
             last_run_at = NOW(),
             next_run_at = $1,
             cursor = $2::jsonb,
             consecutive_errors = 0,
             last_error = NULL
         WHERE source = $3`,
      [outcome.nextRunAt, outcome.cursor === null ? null : JSON.stringify(outcome.cursor), source],
    );
  } else {
    await pool.query(
      `UPDATE crawl_state
         SET running_since = NULL,
             last_run_at = NOW(),
             next_run_at = $1,
             error_count = error_count + 1,
             consecutive_errors = consecutive_errors + 1,
             last_error = $2,
             enabled = CASE WHEN consecutive_errors + 1 >= $3 THEN false ELSE enabled END
         WHERE source = $4`,
      [outcome.nextRunAt, outcome.errorMessage ?? null, threshold, source],
    );
  }
}

// ============================================================================
// CRAWL RUNS
// ============================================================================

/**
 * Inserts an in-progress `crawl_runs` row at the start of a tick.
 * Finalize via {@link finalizeCrawlRun}.
 */
export async function insertCrawlRun(pool: Pool, run: CrawlRunInsert): Promise<void> {
  await pool.query(
    `INSERT INTO crawl_runs (id, source, started_at, status)
     VALUES ($1, $2, $3, $4)`,
    [run.id, run.source, run.startedAt, run.status],
  );
}

/**
 * Finalizes a previously inserted `crawl_runs` row with the run's
 * outcome (status, discovery / ingest / skip / error counters, finish
 * time, optional notes).
 */
export async function finalizeCrawlRun(pool: Pool, id: string, finalize: CrawlRunFinalize): Promise<void> {
  await pool.query(
    `UPDATE crawl_runs
       SET status = $1,
           finished_at = $2,
           discovered = $3,
           ingested = $4,
           skipped = $5,
           errors = $6,
           notes = $7
       WHERE id = $8`,
    [
      finalize.status,
      finalize.finishedAt,
      finalize.discovered,
      finalize.ingested,
      finalize.skipped,
      finalize.errors,
      finalize.notes ?? null,
      id,
    ],
  );
}

/**
 * Paginates `crawl_runs` rows, optionally filtered by source. Ordered
 * newest-started first.
 *
 * @param pool - Postgres connection pool.
 * @param params - Pagination cursor plus optional `source` filter.
 * @returns Page of {@link CrawlRunRecord} including the total count.
 */
export async function listCrawlRuns(
  pool: Pool,
  params: { source?: string; page: number; limit: number },
): Promise<CrawlRunsPage> {
  const { source, page, limit } = params;
  const offset = (page - 1) * limit;

  const whereParams: unknown[] = [];
  let where = "";
  if (source) {
    where = `WHERE source = $1`;
    whereParams.push(source);
  }

  const countResult = await pool.query<CountRow>(`SELECT COUNT(*) as count FROM crawl_runs ${where}`, whereParams);
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataParams: unknown[] = [...whereParams, limit, offset];
  const limitIdx = whereParams.length + 1;
  const offsetIdx = whereParams.length + 2;
  const result = await pool.query(
    `SELECT id, source, started_at, finished_at, status,
            discovered, ingested, skipped, errors, notes
     FROM crawl_runs
     ${where}
     ORDER BY started_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams,
  );

  const items: CrawlRunRecord[] = (result.rows as CrawlRunSqlRow[]).map((r) => ({
    id: r.id,
    source: r.source,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    discovered: r.discovered,
    ingested: r.ingested,
    skipped: r.skipped,
    errors: r.errors,
    notes: r.notes,
  }));

  return { items, total, page, limit };
}
