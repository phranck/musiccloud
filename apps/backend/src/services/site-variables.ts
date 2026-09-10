/**
 * @file Reads each figure a page may name from the one place that owns it.
 *
 * The names and their descriptions are declared in `@musiccloud/shared`, where
 * the editor's reference reads them. This is the other half: where each figure
 * actually comes from. They are apart because a figure's source is a database
 * row, a setting or a module constant, none of which the dashboard can reach,
 * whilst the list of names has to be readable from both sides.
 *
 * Nothing here holds a number of its own. A figure written here as a literal
 * would be a second answer to a question the plan, the setting or the rate
 * limiter has already answered, and it would go quietly out of step with it.
 */

import type { SiteVariableValues } from "@musiccloud/shared";
import { getTierRepository } from "../db/index.js";
import { KEYLESS_RESOLVE_REQUESTS_PER_DAY, KEYLESS_RESOLVE_REQUESTS_PER_MINUTE } from "../lib/infra/rate-limiter.js";
import { getMaxProjectsPerAccount, MAX_REGISTRATIONS_PER_PROJECT } from "./developer-limits.js";
import { TIER_FREE_ID } from "./signup-tier.js";

/**
 * What a page states about the free plan whilst that plan cannot be read.
 *
 * Zero, which is visibly wrong rather than plausibly wrong. A page saying "0
 * requests a minute" is read as a fault and reported; one quoting a figure
 * somebody typed here is read as true and believed.
 */
const UNKNOWN_LIMIT = 0;

/**
 * Reads every figure a page may name.
 *
 * @returns The figures, ready to be put in place of their names.
 *
 * @remarks
 * Reads the database and the settings store, so it runs once per rendered page
 * rather than once per variable. The free plan's two limits come from the tier
 * itself, which is the same row the pricing page renders, so a page naming a
 * limit and the plan table beside it cannot disagree.
 */
export async function resolveSiteVariableValues(): Promise<SiteVariableValues> {
  const [tiers, projectsPerAccount] = await Promise.all([
    getTierRepository().then((repository) => repository.listTiers()),
    getMaxProjectsPerAccount(),
  ]);
  const free = tiers.find((tier) => tier.id === TIER_FREE_ID);

  return {
    freeRequestsPerMinute: free?.requestsPerMinute ?? UNKNOWN_LIMIT,
    freeRequestsPerDay: free?.requestsPerDay ?? UNKNOWN_LIMIT,
    projectsPerAccount,
    registrationsPerProject: MAX_REGISTRATIONS_PER_PROJECT,
    keylessRequestsPerMinute: KEYLESS_RESOLVE_REQUESTS_PER_MINUTE,
    keylessRequestsPerDay: KEYLESS_RESOLVE_REQUESTS_PER_DAY,
  };
}
