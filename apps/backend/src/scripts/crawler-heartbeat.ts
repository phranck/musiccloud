/**
 * @file Crawler-heartbeat cron entrypoint.
 *
 * Wired to Zerops' per-minute cron via `zerops.yml:run.crontab`. Runs one
 * heartbeat tick (idempotent seeding + per-source orchestration over due
 * rows) and exits. The Zerops cron re-invokes us next minute; if a tick
 * is still mid-run when the next minute arrives, the new invocation's
 * `acquireCrawlLock` returns `false` and the duplicate exits cleanly
 * without overlapping work.
 *
 * The script lives under `src/scripts/` so tsup bundles it into
 * `dist/scripts/crawler-heartbeat.js` (see `tsup.config.ts:entry`); the
 * cron command then runs `node apps/backend/dist/scripts/crawler-heartbeat.js`.
 */
import { closeRepository } from "../db/index.js";
import { runMigrations } from "../db/run-migrations.js";
import { log } from "../lib/infra/logger.js";
import { runHeartbeat } from "../services/crawler/heartbeat.js";

async function main(): Promise<void> {
  // Apply any pending migrations before the heartbeat touches `crawl_state`
  // / `crawl_runs`. The main backend service already runs migrations at
  // start, but the cron container is a separate process and might be the
  // first one to wake up after a deploy that introduced a new migration.
  await runMigrations();

  await runHeartbeat();
}

main()
  .then(async () => {
    await closeRepository();
    process.exit(0);
  })
  .catch(async (err) => {
    log.error("Crawler", `Heartbeat crashed: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log.error("Crawler", err.stack);
    await closeRepository().catch(() => {});
    process.exit(1);
  });
