/**
 * @file Crawler heartbeat — entry point for the per-minute cron tick.
 *
 * Two responsibilities:
 *
 * 1. **Idempotent seeding.** On every tick, every entry in the static
 *    `SOURCES` array gets an `ON CONFLICT DO NOTHING` upsert into
 *    `crawl_state`. Adding a new source is therefore zero-migration: its
 *    row appears the first minute the new code is deployed. Removing a
 *    source leaves the row in place for audit; the heartbeat ignores rows
 *    whose source id is not registered.
 *
 * 2. **Tick orchestration.** Lists every due source (`enabled = true AND
 *    next_run_at <= NOW() AND running_since IS NULL`), takes a row-lock
 *    via `acquireCrawlLock`, runs the source's `fetch`, dedupes and
 *    ingests each candidate through the existing resolver pipeline,
 *    finalises the `crawl_runs` row, and releases the lock with the next
 *    schedule advanced.
 *
 * Lock + state-update SQL lives in `TrackRepository` (committed in
 * 871c5d84): the heartbeat is a thin orchestrator over `acquireCrawlLock`,
 * `insertCrawlRun`, `finalizeCrawlRun`, and `completeCrawlTick`.
 */
import { getRepository } from "../../db/index.js";
import type { CrawlStateRecord } from "../../db/repository.js";
import { log } from "../../lib/infra/logger.js";
import { generateShortId } from "../../lib/short-id.js";
import { isAlreadyIngested } from "./dedupe.js";
import { ingestCandidate } from "./ingest.js";
import { getCrawlerSource, listCrawlerSources } from "./registry.js";

/** Stale-detection window for `acquireCrawlLock`. Prior heartbeat crashes
 *  or mid-run kills leave `running_since` non-null; a tick older than this
 *  is treated as orphaned and re-acquired by the next heartbeat. */
const MAX_RUN_MS = 30 * 60 * 1000;

/**
 * One full heartbeat invocation. Safe to call repeatedly; idempotent and
 * lock-protected. Returns when every due source has been ticked.
 */
export async function runHeartbeat(): Promise<void> {
  const repo = await getRepository();

  // Seed registry-known sources lazily. ON CONFLICT DO NOTHING — no-op
  // when the row already exists. Catches new sources after a deploy.
  for (const source of listCrawlerSources()) {
    await repo.seedCrawlState({
      source: source.id,
      displayName: source.displayName,
      defaultEnabled: source.defaultEnabled,
      defaultIntervalMinutes: source.defaultIntervalMinutes,
      defaultConfig: source.defaultConfig,
    });
  }

  const due = await repo.listDueCrawlState();
  for (const row of due) {
    await runSourceTick(row);
  }
}

/**
 * Tick one source. Acquires the lock first; if another heartbeat already
 * holds it (and is not stale), this returns without writing a `crawl_runs`
 * row — silent skips on contention keep the table noise-free.
 *
 * Failures inside the source's fetch or the per-candidate ingest never
 * throw out of this function: per-candidate errors increment the run's
 * `errors` counter; a full source-fetch failure is recorded as
 * `status = 'error'` on the run row and increments the source's
 * `consecutive_errors` counter (auto-disable at 5 hits).
 */
async function runSourceTick(state: CrawlStateRecord): Promise<void> {
  const repo = await getRepository();
  const source = getCrawlerSource(state.source);
  if (!source) {
    // Row from a previous deploy that registered a source we no longer
    // ship. Leave the row for audit and skip.
    log.debug("Crawler", `[${state.source}] unknown source id, skipping`);
    return;
  }

  const acquired = await repo.acquireCrawlLock(state.source, MAX_RUN_MS);
  if (!acquired) {
    log.debug("Crawler", `[${state.source}] lock held by another heartbeat, skipping`);
    return;
  }

  const runId = generateShortId();
  const startedAt = new Date();
  await repo.insertCrawlRun({
    id: runId,
    source: state.source,
    startedAt,
    status: "running",
  });

  let discovered = 0;
  let ingested = 0;
  let skipped = 0;
  let errors = 0;
  let nextCursor: unknown = null;
  let fetchError: string | undefined;

  try {
    const result = await source.fetch(state.config, state.cursor ?? null);
    nextCursor = result.nextCursor;
    discovered = result.candidates.length;

    for (const candidate of result.candidates) {
      if (await isAlreadyIngested(candidate)) {
        skipped++;
        continue;
      }
      const status = await ingestCandidate(candidate);
      if (status === "ingested") ingested++;
      else if (status === "skipped") skipped++;
      else errors++;
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
    log.error("Crawler", `[${state.source}] fetch failed: ${fetchError}`);
  }

  const finishedAt = new Date();
  const success = fetchError === undefined;

  await repo.finalizeCrawlRun(runId, {
    status: success ? "success" : "error",
    finishedAt,
    discovered,
    ingested,
    skipped,
    errors,
    notes: fetchError ?? null,
  });

  const nextRunAt = new Date(finishedAt.getTime() + state.intervalMinutes * 60 * 1000);
  await repo.completeCrawlTick(state.source, {
    cursor: nextCursor,
    nextRunAt,
    success,
    errorMessage: fetchError,
  });

  log.debug(
    "Crawler",
    `[${state.source}] tick done — discovered=${discovered} ingested=${ingested} skipped=${skipped} errors=${errors}${
      fetchError ? ` (${fetchError})` : ""
    }`,
  );
}
