import { describe, expect, it, vi } from "vitest";
import type { ApiAccessRepository, DeveloperProject } from "../../db/api-access-repository.js";

/**
 * How many times longer than the real windows the mocked policy makes the
 * limiters' windows: 7. Any factor other than 1 works, because a usage read
 * counting over windows of its own would count over the real lengths and so
 * miss the mocked ones.
 */
const WINDOW_SCALE = 7;

vi.mock("../../lib/infra/rate-limit-policy.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/infra/rate-limit-policy.js")>();
  return {
    ...actual,
    MINUTE_WINDOW_MS: actual.MINUTE_WINDOW_MS * WINDOW_SCALE,
    DAY_WINDOW_MS: actual.DAY_WINDOW_MS * WINDOW_SCALE,
  };
});

const { DAY_WINDOW_MS, MINUTE_WINDOW_MS } = await import("../../lib/infra/rate-limit-policy.js");
const { buildApiUsageReport } = await import("../api-usage-report.js");
const { isUsageWindowRejection, resolveUsageWindow } = await import("../api-usage-window.js");

const NOW = Date.parse("2026-08-31T12:00:00.000Z");

/** A project with a plan's quota, which is all the report reads from it. */
const PROJECT = {
  id: "project-1",
  effectiveRequestsPerMinute: 60,
  effectiveRequestsPerDay: 10_000,
} as DeveloperProject;

/**
 * A repository that records the ranges it was asked to count and answers with
 * an empty summary.
 */
function recordingRepo() {
  const countProjectUsage = vi.fn<ApiAccessRepository["countProjectUsage"]>().mockResolvedValue(0);
  const summariseProjectUsage = vi
    .fn<ApiAccessRepository["summariseProjectUsage"]>()
    .mockImplementation(async (_projectId, from, to, bucket) => ({
      from,
      to,
      bucket,
      total: 0,
      byRegistration: [],
      buckets: [],
    }));
  return { countProjectUsage, summariseProjectUsage } as unknown as ApiAccessRepository & {
    countProjectUsage: typeof countProjectUsage;
  };
}

describe("the usage read counts over the limiter's windows", () => {
  it("counts the live minute and day over the windows the limiter exports", async () => {
    const repo = recordingRepo();
    const window = resolveUsageWindow({}, NOW);
    if (isUsageWindowRejection(window)) throw new Error(window.message);

    const report = await buildApiUsageReport(repo, PROJECT, window, NOW);

    expect(repo.countProjectUsage).toHaveBeenCalledWith(PROJECT.id, NOW - MINUTE_WINDOW_MS, NOW);
    expect(repo.countProjectUsage).toHaveBeenCalledWith(PROJECT.id, NOW - DAY_WINDOW_MS, NOW);
    expect(Date.parse(report.windows.minute.from)).toBe(NOW - MINUTE_WINDOW_MS);
    expect(Date.parse(report.windows.day.from)).toBe(NOW - DAY_WINDOW_MS);
  });

  it("opens an unbounded range on the limiter's day", () => {
    const window = resolveUsageWindow({}, NOW);
    if (isUsageWindowRejection(window)) throw new Error(window.message);

    expect(window.to - window.from).toBe(DAY_WINDOW_MS);
  });
});
