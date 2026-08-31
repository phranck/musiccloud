/**
 * @file What a count of requests means against the quota it runs under.
 *
 * A figure on its own does not tell a developer whether they are about to be
 * refused. These helpers turn the pair into what a quota page shows: a
 * fraction, a percentage and a bar width.
 */

/** Built once, because a page formats several of these. */
const USAGE_NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/** What a project without a granting plan shows instead of a fraction. */
const NO_LIMIT_LABEL = "no limit granted";

/** One window's usage, ready to render. */
export interface UsageShare {
  /** For example `"1,200 of 10,000"`, or the count alone when nothing is granted. */
  label: string;
  /** `0` to `100`, clamped, for a bar. `null` when nothing is granted. */
  percent: number | null;
  /** Whether the window has reached or passed what it is allowed. */
  exhausted: boolean;
}

/**
 * Describes one window's usage against its limit.
 *
 * A project whose plan grants nothing has no denominator, and saying so is
 * more useful than dividing by a number that does not exist. The percentage is
 * clamped at 100 for the bar, whilst `exhausted` still reports the real
 * situation, because a bar cannot show 130 per cent and a warning should.
 *
 * @param used - Requests counted in the window.
 * @param granted - What the plan allows in it, or `null` when it grants nothing.
 * @returns The label, the bar percentage and whether the window is spent.
 */
export function usageShare(used: number, granted: number | null): UsageShare {
  if (granted === null || granted <= 0) {
    return { label: `${USAGE_NUMBER_FORMAT.format(used)} · ${NO_LIMIT_LABEL}`, percent: null, exhausted: false };
  }
  return {
    label: `${USAGE_NUMBER_FORMAT.format(used)} of ${USAGE_NUMBER_FORMAT.format(granted)}`,
    percent: Math.min(Math.round((used / granted) * 100), 100),
    exhausted: used >= granted,
  };
}
