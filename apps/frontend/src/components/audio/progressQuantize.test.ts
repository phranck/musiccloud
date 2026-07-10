import { describe, expect, it } from "vitest";
import { PROGRESS_RATIO_QUANTUM, quantizeProgressRatio } from "./progressQuantize";

/**
 * The playback progress ratio advances continuously (currentTime/duration) and is
 * sampled on the shared 60 Hz ticker. Routing every raw sample through React state
 * re-rendered the whole player subtree 60×/s during playback — the source of the
 * hover/transition jank. Quantizing the ratio to a coarse step collapses those into
 * a handful of state changes per second while the progress bar (which floors to a
 * couple of pixels anyway) looks unchanged.
 */
describe("quantizeProgressRatio", () => {
  it("snaps a raw ratio to the nearest quantum step", () => {
    // 0.5033 / 0.005 = 100.66 → round 101 → 0.505
    expect(quantizeProgressRatio(0.5033)).toBeCloseTo(0.505, 10);
    // A sub-quantum wobble resolves to the SAME value, so the dedup guard skips the re-render.
    expect(quantizeProgressRatio(0.5041)).toBe(quantizeProgressRatio(0.5033));
  });

  it("keeps the endpoints exact (0 and 1 are not rounded away)", () => {
    expect(quantizeProgressRatio(0)).toBe(0);
    expect(quantizeProgressRatio(1)).toBe(1);
  });

  it("clamps out-of-range finite input and maps non-finite to 0", () => {
    expect(quantizeProgressRatio(1.4)).toBe(1);
    expect(quantizeProgressRatio(-0.2)).toBe(0);
    // Non-finite means "position unknown" — treat as the start (0), matching the
    // engine's prior `Number.isFinite ? … : 0` guard, never a spurious full bar.
    expect(quantizeProgressRatio(Number.NaN)).toBe(0);
    expect(quantizeProgressRatio(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("uses a quantum coarse enough to cut the 60 Hz churn by an order of magnitude", () => {
    // A 30 s preview sampled at 60 fps yields ~1800 raw samples; at this quantum the
    // distinct quantized values a full sweep can produce stays well under 250.
    expect(1 / PROGRESS_RATIO_QUANTUM).toBeLessThanOrEqual(250);
  });
});
