/**
 * @file Usage-retention cron entrypoint.
 *
 * `api_usage_events` gains a row on every authenticated API request, so
 * something has to take rows away again. This runs once a day through
 * Zerops' cron (`zerops.yml:run.crontab`) and removes what has aged past the
 * retention period.
 *
 * The rule and the reasoning behind the period live in
 * `docs/api-usage-retention.md`. The number is here, once, and that document
 * points at it.
 *
 * The script lives under `src/scripts/` so tsup bundles it into
 * `dist/scripts/api-usage-retention.js` (see `tsup.config.ts:entry`).
 */
import { closeRepository, getApiAccessRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";

/**
 * How long a usage row is kept.
 *
 * Ninety days covers a quarter, which is the longest range any screen offers
 * and long enough to answer "was this developer always this busy". Nothing
 * bills on these rows, so keeping them beyond the question they answer buys
 * only disk.
 */
export const USAGE_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Removes usage rows older than the retention period.
 *
 * @param now - The moment to measure the cutoff back from.
 * @returns How many rows were removed.
 */
export async function runUsageRetention(now: number = Date.now()): Promise<number> {
  const repo = await getApiAccessRepository();
  const cutoff = now - USAGE_RETENTION_DAYS * DAY_MS;
  const removed = await repo.deleteApiUsageEventsBefore(cutoff);
  log.debug(
    "Usage",
    `Retention removed ${removed} usage rows older than ${new Date(cutoff).toISOString()} (${USAGE_RETENTION_DAYS} days)`,
  );
  return removed;
}

/**
 * Direct execution guard. The production bundle is CommonJS, so this is
 * `module === require.main` rather than an `import.meta` check; see
 * `apps/backend/RUNTIME_SAFETY.md`.
 */
if (typeof module !== "undefined" && require.main === module) {
  runUsageRetention()
    .then(async () => {
      await closeRepository();
      process.exit(0);
    })
    .catch(async (error) => {
      log.error("Usage", `Retention crashed: ${error instanceof Error ? error.message : String(error)}`);
      await closeRepository().catch(() => undefined);
      process.exit(1);
    });
}
