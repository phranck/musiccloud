/**
 * @file API-access retention cron entrypoint.
 *
 * `api_usage_events` gains a row on every authenticated API request and
 * `api_access_audit_events` one on every change to a project, an application
 * or a key, so something has to take rows away again. This runs once a day
 * through Zerops' cron (`zerops.yml:run.crontab`) and removes what has aged
 * past each table's retention period.
 *
 * The periods live in `services/api-access-retention.ts`, and
 * `docs/api-access-retention.md` gives the reasoning behind them.
 *
 * The script lives under `src/scripts/` so tsup bundles it into
 * `dist/scripts/api-access-retention.js` (see `tsup.config.ts:entry`).
 */
import { closeRepository, getApiAccessRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { sweepApiAccessRetention } from "../services/api-access-retention.js";

/**
 * Removes the usage and audit rows that have aged past their retention periods.
 *
 * @param now - The moment to measure the cutoffs back from.
 * @returns How many rows each table lost.
 */
export async function runApiAccessRetention(now: number = Date.now()) {
  const removed = await sweepApiAccessRetention(await getApiAccessRepository(), now);
  log.debug("ApiAccess", `Retention removed ${removed.usageRows} usage rows and ${removed.auditRows} audit rows`);
  return removed;
}

/**
 * Direct execution guard. The production bundle is CommonJS, so this is
 * `module === require.main` rather than an `import.meta` check; see
 * `apps/backend/RUNTIME_SAFETY.md`.
 */
if (typeof module !== "undefined" && require.main === module) {
  runApiAccessRetention()
    .then(async () => {
      await closeRepository();
      process.exit(0);
    })
    .catch(async (error) => {
      log.error("ApiAccess", `Retention crashed: ${error instanceof Error ? error.message : String(error)}`);
      await closeRepository().catch(() => undefined);
      process.exit(1);
    });
}
