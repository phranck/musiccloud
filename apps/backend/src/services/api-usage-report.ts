/**
 * @file The usage answer both routes give, built once.
 *
 * A developer and an administrator ask the same question about the same
 * project, so they get the same shape from the same place. What differs is who
 * is allowed to ask, which is the route's business and not this file's.
 */
import type { ApiAccessRepository, DeveloperProject } from "../db/api-access-repository.js";
import { DAY_WINDOW_MS, MINUTE_WINDOW_MS, type UsageWindow } from "./api-usage-window.js";

/**
 * Aggregated usage for one project, with the quota it is measured against.
 *
 * The quota travels with the counts because a number of requests means nothing
 * without what it is allowed to reach, and a screen asking twice would be
 * showing two moments as though they were one.
 */
export interface ApiUsageReport {
  windows: {
    minute: { from: string; to: string; total: number };
    day: { from: string; to: string; total: number };
  };
  range: {
    from: string;
    to: string;
    bucket: string;
    total: number;
    byRegistration: { registrationId: string; total: number }[];
    buckets: { startedAt: string; total: number }[];
  };
  quota: {
    /** What the plan grants per minute, or `null` when no plan grants one. */
    requestsPerMinute: number | null;
    /** What the plan grants per day, or `null` when no plan grants one. */
    requestsPerDay: number | null;
  };
}

/**
 * Builds the usage report for one project.
 *
 * The two live windows are counted against `now` rather than against the
 * requested range, because they answer "how close am I right now" whilst the
 * range answers "what has this looked like".
 *
 * @param repo - The API-access repository.
 * @param project - The project to report on, already loaded and authorised.
 * @param window - The resolved range for the series.
 * @param now - The moment the live windows end at.
 * @returns The report.
 */
export async function buildApiUsageReport(
  repo: ApiAccessRepository,
  project: DeveloperProject,
  window: UsageWindow,
  now: number,
): Promise<ApiUsageReport> {
  const [minuteTotal, dayTotal, summary] = await Promise.all([
    repo.countProjectUsage(project.id, now - MINUTE_WINDOW_MS, now),
    repo.countProjectUsage(project.id, now - DAY_WINDOW_MS, now),
    repo.summariseProjectUsage(project.id, window.from, window.to, window.bucket),
  ]);

  return {
    windows: {
      minute: {
        from: new Date(now - MINUTE_WINDOW_MS).toISOString(),
        to: new Date(now).toISOString(),
        total: minuteTotal,
      },
      day: {
        from: new Date(now - DAY_WINDOW_MS).toISOString(),
        to: new Date(now).toISOString(),
        total: dayTotal,
      },
    },
    range: {
      from: new Date(summary.from).toISOString(),
      to: new Date(summary.to).toISOString(),
      bucket: summary.bucket,
      total: summary.total,
      byRegistration: summary.byRegistration,
      buckets: summary.buckets.map((entry) => ({
        startedAt: new Date(entry.startedAt).toISOString(),
        total: entry.total,
      })),
    },
    quota: {
      requestsPerMinute: project.effectiveRequestsPerMinute,
      requestsPerDay: project.effectiveRequestsPerDay,
    },
  };
}
