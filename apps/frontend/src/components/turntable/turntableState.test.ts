import { describe, expect, it } from "vitest";
import { AudioStatus } from "@/components/audio/AudioStatus";
import { TurntablePower, TurntableSpeed } from "@/components/turntable/TurntablePlayerContext";
import {
  derivePower,
  deriveSpinState,
  SPEED_KNOB_ANGLE_DEG,
  speedKnobAngle,
} from "@/components/turntable/turntableState";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";

describe("derivePower", () => {
  it("is Standby when stopped", () => {
    expect(derivePower(TurntableSpeed.Standby)).toBe(TurntablePower.Standby);
  });

  it("is On while playing", () => {
    expect(derivePower(TurntableSpeed.Rpm33)).toBe(TurntablePower.On);
  });
});

describe("speedKnobAngle", () => {
  it("points the indicator at the matching caption angle for each speed", () => {
    expect(speedKnobAngle(TurntableSpeed.Rpm33)).toBe(SPEED_KNOB_ANGLE_DEG.Rpm33);
    expect(speedKnobAngle(TurntableSpeed.Standby)).toBe(SPEED_KNOB_ANGLE_DEG.Standby);
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
