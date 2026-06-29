import { describe, expect, it } from "vitest";
import { AudioStatus } from "@/components/audio/AudioStatus";
import { TurntablePower, TurntableSpeed } from "@/components/turntable/TurntablePlayerContext";
import {
  derivePower,
  deriveSpinState,
  LP_ROTATION_DURATION_33_MS,
  LP_ROTATION_DURATION_45_MS,
  nextSpeedInCycle,
  rotationDurationForSpeed,
  SPEED_KNOB_ANGLE_DEG,
  speedAtOffset,
  speedKnobAngle,
  stepSpeed,
} from "@/components/turntable/turntableState";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";

describe("derivePower", () => {
  it("is Standby for Standby speed", () => {
    expect(derivePower(TurntableSpeed.Standby)).toBe(TurntablePower.Standby);
  });

  it("is On for both playing speeds", () => {
    expect(derivePower(TurntableSpeed.Rpm33)).toBe(TurntablePower.On);
    expect(derivePower(TurntableSpeed.Rpm45)).toBe(TurntablePower.On);
  });
});

describe("nextSpeedInCycle", () => {
  it("cycles Standby -> Rpm33 -> Rpm45 -> Standby", () => {
    expect(nextSpeedInCycle(TurntableSpeed.Standby)).toBe(TurntableSpeed.Rpm33);
    expect(nextSpeedInCycle(TurntableSpeed.Rpm33)).toBe(TurntableSpeed.Rpm45);
    expect(nextSpeedInCycle(TurntableSpeed.Rpm45)).toBe(TurntableSpeed.Standby);
  });
});

describe("stepSpeed", () => {
  it("steps up the ladder and clamps at Rpm45", () => {
    expect(stepSpeed(TurntableSpeed.Standby, 1)).toBe(TurntableSpeed.Rpm33);
    expect(stepSpeed(TurntableSpeed.Rpm33, 1)).toBe(TurntableSpeed.Rpm45);
    // Already at the top: clamps, no wrap.
    expect(stepSpeed(TurntableSpeed.Rpm45, 1)).toBe(TurntableSpeed.Rpm45);
  });

  it("steps down the ladder and clamps at Standby", () => {
    expect(stepSpeed(TurntableSpeed.Rpm45, -1)).toBe(TurntableSpeed.Rpm33);
    expect(stepSpeed(TurntableSpeed.Rpm33, -1)).toBe(TurntableSpeed.Standby);
    // Already at the bottom: clamps, no wrap.
    expect(stepSpeed(TurntableSpeed.Standby, -1)).toBe(TurntableSpeed.Standby);
  });

  it("only reads the sign of delta and ignores a zero step", () => {
    expect(stepSpeed(TurntableSpeed.Standby, 42)).toBe(TurntableSpeed.Rpm33);
    expect(stepSpeed(TurntableSpeed.Rpm45, -42)).toBe(TurntableSpeed.Rpm33);
    expect(stepSpeed(TurntableSpeed.Rpm33, 0)).toBe(TurntableSpeed.Rpm33);
  });
});

describe("speedAtOffset", () => {
  it("shifts up the ladder by the offset and clamps at Rpm45", () => {
    expect(speedAtOffset(TurntableSpeed.Standby, 1)).toBe(TurntableSpeed.Rpm33);
    expect(speedAtOffset(TurntableSpeed.Standby, 2)).toBe(TurntableSpeed.Rpm45);
    // Past the top clamps, no wrap.
    expect(speedAtOffset(TurntableSpeed.Standby, 5)).toBe(TurntableSpeed.Rpm45);
  });

  it("shifts down the ladder by the offset and clamps at Standby", () => {
    expect(speedAtOffset(TurntableSpeed.Rpm45, -1)).toBe(TurntableSpeed.Rpm33);
    expect(speedAtOffset(TurntableSpeed.Rpm45, -2)).toBe(TurntableSpeed.Standby);
    // Past the bottom clamps, no wrap.
    expect(speedAtOffset(TurntableSpeed.Rpm45, -5)).toBe(TurntableSpeed.Standby);
  });

  it("returns the same speed for a zero offset", () => {
    expect(speedAtOffset(TurntableSpeed.Rpm33, 0)).toBe(TurntableSpeed.Rpm33);
  });
});

describe("speedKnobAngle", () => {
  it("returns the stage angle for each speed", () => {
    expect(speedKnobAngle(TurntableSpeed.Rpm33)).toBe(SPEED_KNOB_ANGLE_DEG.Rpm33);
    expect(speedKnobAngle(TurntableSpeed.Rpm45)).toBe(SPEED_KNOB_ANGLE_DEG.Rpm45);
    expect(speedKnobAngle(TurntableSpeed.Standby)).toBe(SPEED_KNOB_ANGLE_DEG.Standby);
  });
});

describe("rotationDurationForSpeed", () => {
  it("uses the faster 45 RPM duration for Rpm45", () => {
    expect(rotationDurationForSpeed(TurntableSpeed.Rpm45)).toBe(LP_ROTATION_DURATION_45_MS);
    expect(LP_ROTATION_DURATION_45_MS).toBe(1333);
  });

  it("uses the 33 RPM duration for Rpm33 and Standby", () => {
    expect(rotationDurationForSpeed(TurntableSpeed.Rpm33)).toBe(LP_ROTATION_DURATION_33_MS);
    expect(rotationDurationForSpeed(TurntableSpeed.Standby)).toBe(LP_ROTATION_DURATION_33_MS);
    expect(LP_ROTATION_DURATION_33_MS).toBe(1800);
  });
});

describe("deriveSpinState", () => {
  it("spins while playing", () => {
    expect(deriveSpinState({ currentSpinState: VinylSpinState.Idle, status: AudioStatus.Playing })).toBe(
      VinylSpinState.Playing,
    );
  });

  it("coasts when stopping out of a playing/coasting spin", () => {
    expect(deriveSpinState({ currentSpinState: VinylSpinState.Playing, status: AudioStatus.Paused })).toBe(
      VinylSpinState.Coasting,
    );
    expect(deriveSpinState({ currentSpinState: VinylSpinState.Playing, status: AudioStatus.Ended })).toBe(
      VinylSpinState.Coasting,
    );
    expect(deriveSpinState({ currentSpinState: VinylSpinState.Coasting, status: AudioStatus.Paused })).toBe(
      VinylSpinState.Coasting,
    );
  });

  it("is idle when unavailable or status-less, regardless of the prior spin", () => {
    expect(deriveSpinState({ currentSpinState: VinylSpinState.Playing, status: AudioStatus.Unavailable })).toBe(
      VinylSpinState.Idle,
    );
    expect(deriveSpinState({ currentSpinState: VinylSpinState.Playing, status: null })).toBe(VinylSpinState.Idle);
  });

  it("is idle from a non-spinning resting state", () => {
    expect(deriveSpinState({ currentSpinState: VinylSpinState.Idle, status: AudioStatus.Paused })).toBe(
      VinylSpinState.Idle,
    );
    expect(deriveSpinState({ currentSpinState: VinylSpinState.Idle, status: AudioStatus.Ready })).toBe(
      VinylSpinState.Idle,
    );
  });
});
