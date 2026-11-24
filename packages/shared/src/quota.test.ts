import { describe, expect, it } from "vitest";
import type { ApiUsageReport } from "./api.js";
import {
  isNeverCalled,
  NO_ACTIVE_PLAN_LABEL,
  perDayQuotaLabel,
  perMinuteQuotaLabel,
  quotaSummaryLabel,
  usageChartLabel,
  usageShare,
} from "./quota.js";

/**
 * A usage report with the given totals in its day window and its range, which
 * are the only figures the report helpers read besides the range bounds.
 */
function report(dayTotal: number, rangeTotal: number): ApiUsageReport {
  return {
    windows: {
      minute: { from: "2026-08-31T11:59:00.000Z", to: "2026-08-31T12:00:00.000Z", total: 0 },
      day: { from: "2026-08-30T12:00:00.000Z", to: "2026-08-31T12:00:00.000Z", total: dayTotal },
    },
    range: {
      from: "2026-08-30T12:00:00.000Z",
      to: "2026-08-31T12:00:00.000Z",
      bucket: "hour",
      total: rangeTotal,
      byRegistration: [],
      buckets: [],
    },
    quota: { requestsPerMinute: 60, requestsPerDay: 10_000 },
  };
}

describe("usageShare", () => {
  it("reads a count against what the plan grants", () => {
    const share = usageShare(1200, 10000);

    expect(share.label).toBe("1,200 of 10,000");
    expect(share.percent).toBe(12);
    expect(share.exhausted).toBe(false);
  });

  it("says nothing is granted rather than dividing by a limit that does not exist", () => {
    const share = usageShare(42, null);

    expect(share.label).toBe("42 · no limit granted");
    expect(share.percent).toBeNull();
    expect(share.exhausted).toBe(false);
  });

  it("clamps the bar at full whilst still reporting the window as spent", () => {
    const share = usageShare(130, 100);

    expect(share.percent).toBe(100);
    expect(share.exhausted).toBe(true);
    expect(share.label).toBe("130 of 100");
  });

  it("counts a window as spent the moment it reaches its limit", () => {
    expect(usageShare(60, 60).exhausted).toBe(true);
    expect(usageShare(59, 60).exhausted).toBe(false);
  });

  it("treats a granted zero as nothing granted, because dividing by it says nothing", () => {
    const share = usageShare(5, 0);

    expect(share.percent).toBeNull();
    expect(share.exhausted).toBe(false);
  });

  it("words a granted zero as no limit, the way the dashboard shows it", () => {
    expect(usageShare(1200, 0).label).toBe("1,200 · no limit granted");
  });
});

describe("quota labels", () => {
  it("words each quota with its unit and a grouped figure", () => {
    expect(perMinuteQuotaLabel(60)).toBe("60 requests/minute");
    expect(perDayQuotaLabel(10_000)).toBe("10,000 requests/day");
    expect(quotaSummaryLabel(60, 10_000)).toBe("60 requests/minute · 10,000 requests/day");
  });

  it("says once that no plan is active instead of printing a figure", () => {
    expect(perMinuteQuotaLabel(null)).toBe(NO_ACTIVE_PLAN_LABEL);
    expect(perDayQuotaLabel(null)).toBe(NO_ACTIVE_PLAN_LABEL);
    expect(quotaSummaryLabel(null, 10_000)).toBe(NO_ACTIVE_PLAN_LABEL);
    expect(quotaSummaryLabel(60, null)).toBe(NO_ACTIVE_PLAN_LABEL);
  });
});

describe("report helpers", () => {
  it("calls a project never called only when its day and its range are both empty", () => {
    expect(isNeverCalled(report(0, 0))).toBe(true);
    expect(isNeverCalled(report(1, 0))).toBe(false);
    expect(isNeverCalled(report(0, 1))).toBe(false);
  });

  it("labels the chart with the grouped range total and its bounds", () => {
    expect(usageChartLabel(report(0, 1200))).toBe(
      "1,200 requests between 2026-08-30T12:00:00.000Z and 2026-08-31T12:00:00.000Z",
    );
  });
});
