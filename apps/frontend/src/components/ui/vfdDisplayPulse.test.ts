import { describe, expect, it } from "vitest";
import type { VfdCanvasRenderState } from "@/components/ui/VfdDisplayTypes";
import {
  rowPulseAlpha,
  syncPulseState,
  VFD_PULSE_MIN_ALPHA,
  VFD_PULSE_PERIOD_MS,
  vfdPulseAlpha,
} from "@/components/ui/vfdDisplayPulse";

/** Builds a minimal render state for pulse tests. */
function makeState(prefersReducedMotion = false): VfdCanvasRenderState {
  return {
    lines: [],
    transitions: new Map(),
    marqueeStates: new Map(),
    overlays: new Map(),
    pulses: new Map(),
    cellCount: 44,
    rowCount: 4,
    prefersReducedMotion,
  };
}

describe("vfdPulseAlpha", () => {
  it("starts and ends each cycle at full brightness", () => {
    expect(vfdPulseAlpha(0)).toBe(1);
    expect(vfdPulseAlpha(VFD_PULSE_PERIOD_MS)).toBeCloseTo(1);
  });

  it("reaches its lowest brightness half way through a cycle", () => {
    expect(vfdPulseAlpha(VFD_PULSE_PERIOD_MS / 2)).toBeCloseTo(VFD_PULSE_MIN_ALPHA);
  });

  it("changes gradually rather than in steps", () => {
    const step = VFD_PULSE_PERIOD_MS / 100;
    for (let elapsed = step; elapsed <= VFD_PULSE_PERIOD_MS; elapsed += step) {
      expect(Math.abs(vfdPulseAlpha(elapsed) - vfdPulseAlpha(elapsed - step))).toBeLessThan(0.05);
    }
  });
});

describe("syncPulseState and rowPulseAlpha", () => {
  it("starts a pulse at full brightness when a row begins to pulse", () => {
    const state = makeState();
    syncPulseState(state, { pulse: true }, 3, 1000, false);

    expect(rowPulseAlpha(state, 3, 1000)).toBe(1);
    expect(rowPulseAlpha(state, 3, 1000 + VFD_PULSE_PERIOD_MS / 2)).toBeCloseTo(VFD_PULSE_MIN_ALPHA);
  });

  it("keeps the running phase when the row stays pulsing", () => {
    const state = makeState();
    syncPulseState(state, { pulse: true }, 3, 1000, false);
    syncPulseState(state, { pulse: true }, 3, 1400, false);

    expect(state.pulses.get(3)?.startedAt).toBe(1000);
  });

  it("finishes the running cycle up to full brightness before stopping", () => {
    const state = makeState();
    syncPulseState(state, { pulse: true }, 3, 0, false);
    const stopRequestedAt = VFD_PULSE_PERIOD_MS * 0.5;
    syncPulseState(state, { pulse: false }, 3, stopRequestedAt, false);

    expect(rowPulseAlpha(state, 3, VFD_PULSE_PERIOD_MS * 0.75)).toBeLessThan(1);
    expect(rowPulseAlpha(state, 3, VFD_PULSE_PERIOD_MS)).toBe(1);
    expect(state.pulses.has(3)).toBe(false);
  });

  it("resumes without a jump when pulsing is asked for again before the cycle ends", () => {
    const state = makeState();
    syncPulseState(state, { pulse: true }, 3, 0, false);
    syncPulseState(state, { pulse: false }, 3, VFD_PULSE_PERIOD_MS * 0.5, false);
    syncPulseState(state, { pulse: true }, 3, VFD_PULSE_PERIOD_MS * 0.6, false);

    expect(rowPulseAlpha(state, 3, VFD_PULSE_PERIOD_MS * 1.5)).toBeCloseTo(VFD_PULSE_MIN_ALPHA);
  });

  it("does not pulse under reduced motion", () => {
    const state = makeState(true);
    syncPulseState(state, { pulse: true }, 3, 0, true);

    expect(state.pulses.has(3)).toBe(false);
    expect(rowPulseAlpha(state, 3, VFD_PULSE_PERIOD_MS / 2)).toBe(1);
  });

  it("stops a running pulse at once when reduced motion is turned on", () => {
    const state = makeState();
    syncPulseState(state, { pulse: true }, 3, 0, false);
    state.prefersReducedMotion = true;

    expect(rowPulseAlpha(state, 3, VFD_PULSE_PERIOD_MS / 2)).toBe(1);
    expect(state.pulses.has(3)).toBe(false);
  });

  it("leaves a row without a pulse at full brightness", () => {
    expect(rowPulseAlpha(makeState(), 0, 500)).toBe(1);
  });
});
