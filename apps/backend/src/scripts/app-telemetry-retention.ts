/**
 * @file App telemetry retention cron entrypoint.
 *
 * `app_telemetry_events` gains a row whenever a TestFlight build of the Apple
 * app reports a failed conversion. This runs once a day through Zerops' cron
 * (`zerops.yml:run.crontab`) and removes the rows older than the period in
 * `services/app-telemetry-retention.ts`.
 *
 * The script lives under `src/scripts/` so tsup bundles it into
 * `dist/scripts/app-telemetry-retention.js` (see `tsup.config.ts:entry`).
 */
import { closeRepository, getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { sweepAppTelemetryRetention } from "../services/app-telemetry-retention.js";

/**
 * Removes the telemetry events that have aged past their retention period.
 *
 * @param now - The moment to measure the cutoff back from.
 * @returns How many rows were removed.
 */
export async function runAppTelemetryRetention(now: number = Date.now()) {
  const removed = await sweepAppTelemetryRetention(await getRepository(), now);
  log.debug("Telemetry", `Retention removed ${removed} app telemetry rows`);
  return removed;
}

/**
 * Direct execution guard. The production bundle is CommonJS, so this is
 * `module === require.main` rather than an `import.meta` check; see
 * `apps/backend/RUNTIME_SAFETY.md`.
 */
if (typeof module !== "undefined" && require.main === module) {
  runAppTelemetryRetention()
    .then(async () => {
      await closeRepository();
      process.exit(0);
    })
    .catch(async (error) => {
      log.error("Telemetry", `Retention crashed: ${error instanceof Error ? error.message : String(error)}`);
      await closeRepository().catch(() => undefined);
      process.exit(1);
    });
}
