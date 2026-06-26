import { describe, expect, it } from "vitest";
import { readEventLoopLagMs } from "../event-loop-lag.js";

describe("readEventLoopLagMs", () => {
  it("returns finite, non-negative mean and max in milliseconds", async () => {
    // Let the loop tick a few times so the histogram has at least one sample.
    await new Promise((resolve) => setTimeout(resolve, 30));

    const lag = readEventLoopLagMs();

    expect(typeof lag.mean).toBe("number");
    expect(typeof lag.max).toBe("number");
    expect(Number.isFinite(lag.mean)).toBe(true);
    expect(Number.isFinite(lag.max)).toBe(true);
    expect(lag.mean).toBeGreaterThanOrEqual(0);
    expect(lag.max).toBeGreaterThanOrEqual(0);
    // max can never be below mean for a delay histogram.
    expect(lag.max).toBeGreaterThanOrEqual(lag.mean);
  });
});
