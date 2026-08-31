/**
 * @file The range a usage read may ask for, and the step it is grouped by.
 *
 * Both the developer route and the admin route answer the same question about
 * the same table, so they resolve their range here rather than each carrying
 * its own arithmetic. A bound that exists in one of two places is a bound.
 */
import { UsageBucket, type UsageBucketValue } from "../db/api-access-repository.js";

/** One minute, the window the per-minute quota is enforced over. */
export const MINUTE_WINDOW_MS = 60_000;

/** Twenty-four hours, the window the daily quota is enforced over. */
export const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The widest range a single read may cover.
 *
 * A month of hourly steps is 744 rows, which is a chart. A year is not, and
 * the point of a ceiling is that nobody has to decide per call.
 */
export const MAX_RANGE_MS = 31 * DAY_WINDOW_MS;

/**
 * Beyond this width the series is grouped by day rather than by hour, so the
 * number of steps stays in the hundreds whatever the range.
 */
export const HOURLY_SERIES_LIMIT_MS = 2 * DAY_WINDOW_MS;

/** A resolved, bounded range. */
export interface UsageWindow {
  /** Start, epoch ms, inclusive. */
  from: number;
  /** End, epoch ms, exclusive. */
  to: number;
  /** The step the series is grouped by, derived from the width. */
  bucket: UsageBucketValue;
}

/** Why a requested range was refused. */
export interface UsageWindowRejection {
  message: string;
}

/**
 * Resolves the range a usage read covers.
 *
 * Both bounds are optional. With neither, the answer is the last twenty-four
 * hours, which is what a quota page opens on. The step is derived from the
 * width rather than requested, so no caller can ask for a series of unbounded
 * length.
 *
 * @param query - The `from` and `to` query parameters, as given.
 * @param now - The moment to resolve an open end against.
 * @returns The resolved window, or the reason it was refused.
 */
export function resolveUsageWindow(
  query: { from?: string; to?: string },
  now: number,
): UsageWindow | UsageWindowRejection {
  const to = query.to === undefined ? now : Date.parse(query.to);
  if (Number.isNaN(to)) return { message: "to must be an ISO date." };

  const from = query.from === undefined ? to - DAY_WINDOW_MS : Date.parse(query.from);
  if (Number.isNaN(from)) return { message: "from must be an ISO date." };

  if (from >= to) return { message: "from must be before to." };
  if (to - from > MAX_RANGE_MS) return { message: "The range may cover at most 31 days." };

  return { from, to, bucket: to - from <= HOURLY_SERIES_LIMIT_MS ? UsageBucket.Hour : UsageBucket.Day };
}

/**
 * Whether resolving a window failed.
 *
 * @param result - What {@link resolveUsageWindow} returned.
 * @returns `true` when the range was refused.
 */
export function isUsageWindowRejection(result: UsageWindow | UsageWindowRejection): result is UsageWindowRejection {
  return "message" in result;
}
