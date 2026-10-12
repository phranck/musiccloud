/**
 * @file Artist identity enrichment cron entrypoint.
 *
 * Runs through Zerops' cron (`zerops.yml:run.crontab`) and checks the next
 * batch of artist entities against MusicBrainz, recording their type,
 * lifecycle dates and band memberships. `services/artist-identity/enrich.ts`
 * decides which entities are due and how large a batch is.
 *
 * The script lives under `src/scripts/` so tsup bundles it into
 * `dist/scripts/artist-identity-enrichment.js` (see `tsup.config.ts:entry`).
 */
import { closeRepository, getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { enrichArtistIdentities } from "../services/artist-identity/enrich.js";

/**
 * Checks one batch and logs how it went.
 *
 * @returns How many checks came to each outcome.
 */
export async function runArtistIdentityEnrichment() {
  const outcomes = await enrichArtistIdentities(await getRepository());
  log.debug(
    "ArtistIdentity",
    `Enrichment checked ${Object.values(outcomes).reduce((sum, count) => sum + count, 0)} artists: ` +
      `${outcomes.matched} matched, ${outcomes.no_match} unknown to MusicBrainz, ` +
      `${outcomes.conflict} conflicting, ${outcomes.failed} failed`,
  );
  return outcomes;
}

/**
 * Direct execution guard. The production bundle is CommonJS, so this is
 * `module === require.main` rather than an `import.meta` check; see
 * `apps/backend/RUNTIME_SAFETY.md`.
 */
if (typeof module !== "undefined" && require.main === module) {
  runArtistIdentityEnrichment()
    .then(async () => {
      await closeRepository();
      process.exit(0);
    })
    .catch(async (error) => {
      log.error(
        "ArtistIdentity",
        `Enrichment crashed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await closeRepository().catch(() => undefined);
      process.exit(1);
    });
}
