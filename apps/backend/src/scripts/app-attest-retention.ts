/**
 * @file App Attest key retention cron entrypoint.
 *
 * `app_attest_keys` holds one row per installation of the Apple app that
 * attested a key. This runs once a day through Zerops' cron
 * (`zerops.yml:run.crontab`) and removes the keys unused for longer than the
 * period in `services/app-attest-retention.ts`.
 *
 * The script lives under `src/scripts/` so tsup bundles it into
 * `dist/scripts/app-attest-retention.js` (see `tsup.config.ts:entry`).
 */
import { closeRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { sweepAppAttestKeyRetention } from "../services/app-attest-retention.js";
import { deleteAttestedKeysUnusedSince } from "../services/app-attest/store.js";

/**
 * Removes the App Attest keys that have aged past their retention period.
 *
 * @param now - The moment to measure the cutoff back from.
 * @returns How many keys were removed.
 */
export async function runAppAttestRetention(now: number = Date.now()) {
  const removed = await sweepAppAttestKeyRetention(deleteAttestedKeysUnusedSince, now);
  log.debug("AppAccess", `Retention removed ${removed} App Attest keys`);
  return removed;
}

/**
 * Direct execution guard. The production bundle is CommonJS, so this is
 * `module === require.main` rather than an `import.meta` check; see
 * `apps/backend/RUNTIME_SAFETY.md`.
 */
if (typeof module !== "undefined" && require.main === module) {
  runAppAttestRetention()
    .then(async () => {
      await closeRepository();
      process.exit(0);
    })
    .catch(async (error) => {
      log.error("AppAccess", `Retention crashed: ${error instanceof Error ? error.message : String(error)}`);
      await closeRepository();
      process.exit(1);
    });
}
