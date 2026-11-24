import { describe, expect, it } from "vitest";
import {
  advancePeakHold,
  decayStereoLevel,
  STEREO_LEVEL_DECAY,
  STEREO_PEAK_HOLD_DECAY_PER_TICK,
  STEREO_PEAK_HOLD_MS,
  type StereoPeakHoldState,
} from "@/components/audio/spectrumAnalysis";

/** A level comfortably above the snap-to-zero threshold. */
const AUDIBLE_LEVEL = 0.8;
/** A level whose decayed value falls below the snap-to-zero threshold. */
const FAINT_LEVEL = 0.004;
/** Timestamp in milliseconds at which the held peak in these tests was latched. */
const LATCHED_AT_MS = 1000;
/** Held peak level in these tests. */
const HELD_LEVEL = 0.6;
/** Live level below the held peak. */
const LOWER_LEVEL = 0.2;

describe("decayStereoLevel", () => {
  it("multiplies the level by the decay factor", () => {
    expect(decayStereoLevel(AUDIBLE_LEVEL)).toBeCloseTo(AUDIBLE_LEVEL * STEREO_LEVEL_DECAY);
  });

  it("snaps a faint level to zero so the fade-out ends", () => {
    expect(decayStereoLevel(FAINT_LEVEL)).toBe(0);
    expect(decayStereoLevel(0)).toBe(0);
  });
});

describe("advancePeakHold", () => {
  const held: StereoPeakHoldState = { level: HELD_LEVEL, setAt: LATCHED_AT_MS };

  it("latches a level at or above the held peak with the current time", () => {
    const now = LATCHED_AT_MS + 1;
    expect(advancePeakHold(held, AUDIBLE_LEVEL, now)).toEqual({ level: AUDIBLE_LEVEL, setAt: now });
    expect(advancePeakHold(held, HELD_LEVEL, now)).toEqual({ level: HELD_LEVEL, setAt: now });
  });

  it("keeps the held peak while the hold window is open", () => {
    expect(advancePeakHold(held, LOWER_LEVEL, LATCHED_AT_MS + STEREO_PEAK_HOLD_MS - 1)).toBe(held);
  });

  it("decays the held peak by one step once the hold window has elapsed", () => {
    const next = advancePeakHold(held, LOWER_LEVEL, LATCHED_AT_MS + STEREO_PEAK_HOLD_MS);
    expect(next.level).toBeCloseTo(HELD_LEVEL - STEREO_PEAK_HOLD_DECAY_PER_TICK);
    expect(next.setAt).toBe(LATCHED_AT_MS);
  });

  it("never decays below the live level", () => {
    const liveLevel = HELD_LEVEL - STEREO_PEAK_HOLD_DECAY_PER_TICK / 2;
    const next = advancePeakHold(held, liveLevel, LATCHED_AT_MS + STEREO_PEAK_HOLD_MS);
    expect(next.level).toBe(liveLevel);
  });
});
