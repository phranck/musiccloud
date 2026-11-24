/**
 * Repository contract for the crawler: the per-source `crawl_state` rows the
 * heartbeat schedules and locks, and the `crawl_runs` history the admin API
 * lists. `postgres-crawl.ts` implements it behind the `PostgresAdapter` facade.
 */

/** Idempotent default-row payload written by the heartbeat for every source
 *  registered in the in-memory registry. The insert uses ON CONFLICT (source)
 *  DO NOTHING, so once the row exists, the admin API and the heartbeat own its
 *  mutable fields. */
export interface CrawlStateSeed {
  source: string;
  displayName: string;
  defaultEnabled: boolean;
  defaultIntervalMinutes: number;
  defaultConfig: Record<string, unknown>;
}

/** Normalized `crawl_state` row. Timestamps come back as Date; jsonb columns
 *  come back as parsed JS values courtesy of the pg driver. */
export interface CrawlStateRecord {
  source: string;
  displayName: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: Date;
  lastRunAt: Date | null;
  cursor: unknown;
  config: Record<string, unknown>;
  runningSince: Date | null;
  errorCount: number;
  lastError: string | null;
  consecutiveErrors: number;
}

/** Admin-API mutation payload. `runningSince: null` is the only allowed shape
 *  for that field, which the release-lock endpoint uses. Setting `nextRunAt` to
 *  NOW() is how the run-now endpoint nudges the heartbeat. */
export interface CrawlStatePatch {
  enabled?: boolean;
  intervalMinutes?: number;
  config?: Record<string, unknown>;
  cursor?: unknown;
  nextRunAt?: Date;
  runningSince?: null;
}

/** Outcome of one heartbeat tick. Drives release + schedule advance + error
 *  bookkeeping in a single statement, so the row update is atomic. */
export interface CrawlTickOutcome {
  cursor: unknown;
  nextRunAt: Date;
  success: boolean;
  errorMessage?: string;
  /** Auto-disable threshold for `consecutive_errors`. Default 5. */
  autoDisableThreshold?: number;
}

/** Crawl run insert data shape returned or accepted by the database repository layer. */
export interface CrawlRunInsert {
  id: string;
  source: string;
  startedAt: Date;
  status: "running" | "skipped";
}

/** Crawl run finalize data shape returned or accepted by the database repository layer. */
export interface CrawlRunFinalize {
  status: "success" | "error" | "aborted" | "skipped";
  finishedAt: Date;
  discovered: number;
  ingested: number;
  skipped: number;
  errors: number;
  notes?: string | null;
}

/** Crawl run record shape returned or accepted by the database repository layer. */
export interface CrawlRunRecord {
  id: string;
  source: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  discovered: number;
  ingested: number;
  skipped: number;
  errors: number;
  notes: string | null;
}

/** Crawl runs page data shape returned or accepted by the database repository layer. */
export interface CrawlRunsPage {
  items: CrawlRunRecord[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Reads and writes crawler state and run history. `TrackRepository` extends
 * it, so every caller of the full repository keeps these methods.
 */
export interface CrawlRepository {
  // Crawler: state + runs (migration 0023). The heartbeat lives in
  // services/crawler/heartbeat.ts and orchestrates these calls; the admin
  // API uses the same surface for list/patch/run-now/release-lock.
  /**
   * Seeds crawl state.
   *
   * @param seed - The `seed` value.
   * @returns A promise that resolves when the operation completes.
   */
  seedCrawlState(seed: CrawlStateSeed): Promise<void>;
  /**
   * Finds crawl state.
   *
   * @param source - The `source` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findCrawlState(source: string): Promise<CrawlStateRecord | null>;
  /**
   * Lists crawl state.
   *
   * @returns The matching rows.
   */
  listCrawlState(): Promise<CrawlStateRecord[]>;
  /**
   * Lists due crawl state.
   *
   * @returns The matching rows.
   */
  listDueCrawlState(): Promise<CrawlStateRecord[]>;
  /**
   * Updates crawl state.
   *
   * @param source - The `source` value.
   * @param patch - The `patch` value.
   * @returns The matching record, or `null` when no row matches.
   */
  updateCrawlState(source: string, patch: CrawlStatePatch): Promise<CrawlStateRecord | null>;
  /**
   * Acquires crawl lock.
   *
   * @param source - The `source` value.
   * @param maxRunMs - The `maxRunMs` value.
   * @returns Whether the requested row exists or mutation succeeded.
   */
  acquireCrawlLock(source: string, maxRunMs: number): Promise<boolean>;
  /**
   * Completes crawl tick.
   *
   * @param source - The `source` value.
   * @param outcome - The `outcome` value.
   * @returns A promise that resolves when the operation completes.
   */
  completeCrawlTick(source: string, outcome: CrawlTickOutcome): Promise<void>;
  /**
   * Inserts crawl run.
   *
   * @param run - The `run` value.
   * @returns A promise that resolves when the operation completes.
   */
  insertCrawlRun(run: CrawlRunInsert): Promise<void>;
  /**
   * Finalizes crawl run.
   *
   * @param id - The `id` value.
   * @param finalize - The `finalize` value.
   * @returns A promise that resolves when the operation completes.
   */
  finalizeCrawlRun(id: string, finalize: CrawlRunFinalize): Promise<void>;
  /**
   * Lists crawl runs.
   *
   * @param params - The `params` value.
   * @returns The requested repository result.
   */
  listCrawlRuns(params: { source?: string; page: number; limit: number }): Promise<CrawlRunsPage>;
}
