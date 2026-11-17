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

import { deriveSupportAmounts, fundingProgress, groupIban, type SiteVariableValues } from "@musiccloud/shared";
import { KEYLESS_RESOLVE_REQUESTS_PER_DAY, KEYLESS_RESOLVE_REQUESTS_PER_MINUTE } from "../lib/infra/rate-limiter.js";
import { getMaxProjectsPerAccount, MAX_REGISTRATIONS_PER_PROJECT } from "./developer-limits.js";
import { readDonationTotals } from "./donations.js";
import { listSelfServiceAssignableTiers } from "./signup-tier.js";
import { getSponsoringConfig } from "./sponsoring-config.js";

/**
 * What a page states about the free plan whilst no plan can be chosen for free.
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
 * rather than once per variable. The free plan's two limits come from the first
 * plan a developer may choose themselves, in catalogue order, which is the same
 * row the pricing page renders, so a page naming a limit and the plan table
 * beside it cannot disagree. Every sponsoring figure comes from
 * `deriveSupportAmounts`, which the support ladder reads too, so a sentence and
 * the amount card beside it cannot disagree either.
 */
export async function resolveSiteVariableValues(): Promise<SiteVariableValues> {
  const [assignable, projectsPerAccount, sponsoring, donations] = await Promise.all([
    listSelfServiceAssignableTiers(),
    getMaxProjectsPerAccount(),
    getSponsoringConfig(),
    readDonationTotals(),
  ]);
  // The plan a page calls free is the one a developer can sign up for, so
  // its limits come from the same answer the signup reads.
  const free = assignable[0];
  const amounts = deriveSupportAmounts(sponsoring);
  const funding = fundingProgress(amounts.annualCostCents, donations.donatedYearCents);

  return {
    freeRequestsPerMinute: free?.requestsPerMinute ?? UNKNOWN_LIMIT,
    freeRequestsPerDay: free?.requestsPerDay ?? UNKNOWN_LIMIT,
    projectsPerAccount,
    registrationsPerProject: MAX_REGISTRATIONS_PER_PROJECT,
    keylessRequestsPerMinute: KEYLESS_RESOLVE_REQUESTS_PER_MINUTE,
    keylessRequestsPerDay: KEYLESS_RESOLVE_REQUESTS_PER_DAY,
    annualCost: amounts.annualCostCents,
    monthlyCost: amounts.monthlyCostCents,
    donatedYear: donations.donatedYearCents,
    donatedMonth: donations.donatedMonthCents,
    missingYear: funding.missingCents,
    amountWeek: amounts.weekEur,
    amountMonth: amounts.monthEur,
    amountQuarter: amounts.quarterEur,
    amountYear: amounts.yearEur,
    amountMonthHalf: amounts.monthHalfEur,
    amountMonthQuarter: amounts.monthQuarterEur,
    peoplePerYear: amounts.peoplePerYear,
    amountSponsorMin: amounts.sponsorMinimumEur,
    payeeName: sponsoring.payeeName,
    // Printed the way a banking app shows it, because somebody compares the
    // two character by character.
    payeeIban: groupIban(sponsoring.payeeIban),
    payeeBic: sponsoring.payeeBic,
    purposeDonation: sponsoring.purposeDonation,
    purposeSponsor: sponsoring.purposeSponsor,
    purposePaypal: sponsoring.purposePaypal,
  };
}
