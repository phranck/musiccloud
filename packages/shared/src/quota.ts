/**
 * @file How a request quota and its usage read, on the developer portal and in
 * the admin dashboard alike.
 *
 * An operator answering "why is this developer being throttled" and the
 * developer looking at their own usage page see the same figures in the same
 * words, because both screens format them here. A project's quota comes from
 * the subscription that currently grants it a tier, so a project whose plan is
 * paused, past due, expired or cancelled has no quota at all, and the labels
 * say that instead of printing a number the API would refuse to honor.
 */

import type { ApiUsageReport } from "./api.js";

/** Formats every figure in this file, built once because a page formats many. */
const QUOTA_NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/** Stands wherever a quota figure would, for a project whose plan grants nothing. */
export const NO_ACTIVE_PLAN_LABEL = "No active plan";

/** What a window without a granted limit shows after its count instead of a fraction. */
const NO_LIMIT_LABEL = "no limit granted";

/** The largest share of a quota a usage bar shows, a full bar: 100. */
const FULL_BAR_PERCENT = 100;

/** One window's usage, ready to render. */
export interface UsageShare {
  /** For example `"1,200 of 10,000"`, or `"42 · no limit granted"` when nothing is granted. */
  label: string;
  /** From `0` to `100`, clamped, for a bar. `null` when nothing is granted. */
  percent: number | null;
  /** Whether the window has reached or passed what it is allowed. `false` when nothing is granted. */
  exhausted: boolean;
}

/**
 * Describes one window's usage against its limit.
 *
 * A project whose plan grants nothing has no denominator, and saying so is
 * more useful than dividing by a number that does not exist. A grant of zero or
 * less counts as nothing granted, because dividing by it says nothing either.
 * The percentage is clamped at 100 for the bar, while `exhausted` and the
 * label still report the real situation, because a bar cannot show 130
 * percent and a warning should.
 *
 * @param used - Requests counted in the window.
 * @param granted - What the plan allows in it, or `null` when it grants nothing.
 * @returns The label, the bar percentage and whether the window is spent.
 */
export function usageShare(used: number, granted: number | null): UsageShare {
  if (granted === null || granted <= 0) {
    return { label: `${QUOTA_NUMBER_FORMAT.format(used)} · ${NO_LIMIT_LABEL}`, percent: null, exhausted: false };
  }
  return {
    label: `${QUOTA_NUMBER_FORMAT.format(used)} of ${QUOTA_NUMBER_FORMAT.format(granted)}`,
    percent: Math.min(Math.round((used / granted) * FULL_BAR_PERCENT), FULL_BAR_PERCENT),
    exhausted: used >= granted,
  };
}

/** The unit after a per-minute quota figure, as in `"60 requests/minute"`. */
export const PER_MINUTE_QUOTA_UNIT = "requests/minute";

/** The unit after a per-day quota figure, as in `"10,000 requests/day"`. */
export const PER_DAY_QUOTA_UNIT = "requests/day";

/**
 * A quota figure as every label writes it, grouped the same on every server.
 * The pricing card uses it on its own to set the figure apart from its unit.
 *
 * @param count - The number of requests.
 * @returns The figure in US grouping, for example `"10,000"`.
 */
export function formatQuotaCount(count: number): string {
  return QUOTA_NUMBER_FORMAT.format(count);
}

/**
 * The per-minute quota as a sentence fragment.
 *
 * @param requestsPerMinute - The limit in force, or `null` when no plan grants one.
 * @returns For example `"60 requests/minute"`, or {@link NO_ACTIVE_PLAN_LABEL}.
 */
export function perMinuteQuotaLabel(requestsPerMinute: number | null): string {
  if (requestsPerMinute === null) return NO_ACTIVE_PLAN_LABEL;
  return `${formatQuotaCount(requestsPerMinute)} ${PER_MINUTE_QUOTA_UNIT}`;
}

/**
 * The per-day quota as a sentence fragment.
 *
 * @param requestsPerDay - The daily limit in force, or `null` when no plan grants one.
 * @returns For example `"10,000 requests/day"`, or {@link NO_ACTIVE_PLAN_LABEL}.
 */
export function perDayQuotaLabel(requestsPerDay: number | null): string {
  if (requestsPerDay === null) return NO_ACTIVE_PLAN_LABEL;
  return `${formatQuotaCount(requestsPerDay)} ${PER_DAY_QUOTA_UNIT}`;
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
 * @returns For example `"60 requests/minute · 10,000 requests/day"`, or
 *   {@link NO_ACTIVE_PLAN_LABEL} when either is `null`.
 */
export function quotaSummaryLabel(requestsPerMinute: number | null, requestsPerDay: number | null): string {
  if (requestsPerMinute === null || requestsPerDay === null) return NO_ACTIVE_PLAN_LABEL;
  return `${perMinuteQuotaLabel(requestsPerMinute)} · ${perDayQuotaLabel(requestsPerDay)}`;
}

/**
 * Whether a project has never been called, as far as the report can tell.
 *
 * A report with nothing in the live day and nothing in its range belongs to a
 * project whose first authenticated request is still to come. Both screens
 * show a sentence saying so in place of an empty chart, which would read as a
 * fault.
 *
 * @param report - The project's usage report.
 * @returns `true` when the day window and the range both count zero requests.
 */
export function isNeverCalled(report: ApiUsageReport): boolean {
  return report.windows.day.total === 0 && report.range.total === 0;
}

/**
 * The accessible label of a report's usage chart.
 *
 * @param report - The project's usage report.
 * @returns For example `"1,200 requests between <from> and <to>"`, with the
 *   range's ISO 8601 bounds as the report gives them.
 */
export function usageChartLabel(report: ApiUsageReport): string {
  return `${QUOTA_NUMBER_FORMAT.format(report.range.total)} requests between ${report.range.from} and ${report.range.to}`;
}
