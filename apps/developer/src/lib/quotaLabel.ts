/**
 * @file Labels for the request quota a registration runs under. A project's
 * quota comes from the subscription that currently grants it a tier, so a
 * project whose plan is paused, past due, expired or cancelled has no quota at
 * all. These labels say that instead of printing a number the API would refuse
 * to honour.
 */

/** Stands wherever a quota figure would, for a project whose plan grants nothing. */
const NO_ACTIVE_PLAN_LABEL = "No active plan";

/** Built once, because both labels format a number on every row of a list. */
const QUOTA_NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/**
 * The per-minute quota as a sentence fragment.
 *
 * @param requestsPerMinute - The limit in force, or `null` when no plan grants one.
 * @returns For example `"60 requests/minute"`, or the no-plan label.
 */
export function perMinuteQuotaLabel(requestsPerMinute: number | null): string {
  if (requestsPerMinute === null) return NO_ACTIVE_PLAN_LABEL;
  return `${QUOTA_NUMBER_FORMAT.format(requestsPerMinute)} requests/minute`;
}

/**
 * The per-day quota as a sentence fragment.
 *
 * @param requestsPerDay - The daily limit in force, or `null` when no plan grants one.
 * @returns For example `"10,000 requests/day"`, or the no-plan label.
 */
export function perDayQuotaLabel(requestsPerDay: number | null): string {
  if (requestsPerDay === null) return NO_ACTIVE_PLAN_LABEL;
  return `${QUOTA_NUMBER_FORMAT.format(requestsPerDay)} requests/day`;
}

/**
 * Both quotas on one line.
 *
 * The no-plan label stands in for the whole line rather than for each half of
 * it, because a project without a plan otherwise reads "No active plan · No
 * active plan", which says the same thing twice and reads as a fault.
 *
 * @param requestsPerMinute - The limit in force, or `null` when no plan grants one.
 * @param requestsPerDay - The daily limit in force, or `null` when no plan grants one.
 * @returns One line of text.
 */
export function quotaSummaryLabel(requestsPerMinute: number | null, requestsPerDay: number | null): string {
  if (requestsPerMinute === null || requestsPerDay === null) return NO_ACTIVE_PLAN_LABEL;
  return `${perMinuteQuotaLabel(requestsPerMinute)} · ${perDayQuotaLabel(requestsPerDay)}`;
}
