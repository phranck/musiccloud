import { describe, expect, it } from "vitest";
import { UsageBucket } from "../../db/api-access-repository.js";
import {
  DAY_WINDOW_MS,
  isUsageWindowRejection,
  MAX_RANGE_MS,
  resolveUsageWindow,
  type UsageWindow,
} from "../api-usage-window.js";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");

/** Resolves and asserts the range was accepted, so the tests read as windows. */
function accepted(query: { from?: string; to?: string }, now = NOW): UsageWindow {
  const result = resolveUsageWindow(query, now);
  if (isUsageWindowRejection(result)) throw new Error(`expected a window, got: ${result.message}`);
  return result;
}

describe("resolveUsageWindow", () => {
  it("answers the last twenty-four hours when neither bound is given", () => {
    const window = accepted({});

    expect(window.to).toBe(NOW);
    expect(window.from).toBe(NOW - DAY_WINDOW_MS);
  });

  it("groups a short range by hour and a long one by day", () => {
    expect(accepted({}).bucket).toBe(UsageBucket.Hour);
    expect(accepted({ from: "2026-08-01T12:00:00.000Z" }).bucket).toBe(UsageBucket.Day);
  });

  it("keeps an exactly two-day range on hourly steps", () => {
    const window = accepted({ from: new Date(NOW - 2 * DAY_WINDOW_MS).toISOString() });

    expect(window.bucket).toBe(UsageBucket.Hour);
  });

  it("refuses a range wider than the ceiling", () => {
    const result = resolveUsageWindow({ from: new Date(NOW - MAX_RANGE_MS - 1).toISOString() }, NOW);

    expect(isUsageWindowRejection(result)).toBe(true);
  });

  it("accepts a range exactly at the ceiling", () => {
    const window = accepted({ from: new Date(NOW - MAX_RANGE_MS).toISOString() });

    expect(window.to - window.from).toBe(MAX_RANGE_MS);
  });

  it("refuses a range that ends before it starts, and one that is empty", () => {
    for (const from of ["2026-08-31T13:00:00.000Z", "2026-08-31T12:00:00.000Z"]) {
      const result = resolveUsageWindow({ from, to: "2026-08-31T12:00:00.000Z" }, NOW);
      expect(isUsageWindowRejection(result), from).toBe(true);
    }
  });

  it("refuses a bound that is not a date", () => {
    expect(isUsageWindowRejection(resolveUsageWindow({ from: "yesterday" }, NOW))).toBe(true);
    expect(isUsageWindowRejection(resolveUsageWindow({ to: "soon" }, NOW))).toBe(true);
  });

  it("spans a day boundary without changing the step", () => {
    const window = accepted({ from: "2026-08-30T22:00:00.000Z", to: "2026-08-31T02:00:00.000Z" });

    expect(window.bucket).toBe(UsageBucket.Hour);
    expect(window.to - window.from).toBe(4 * 60 * 60 * 1000);
  });
});
