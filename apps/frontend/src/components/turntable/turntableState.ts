import { AudioStatus } from "@/components/audio/AudioStatus";
import {
  TurntablePower,
  type TurntablePower as TurntablePowerValue,
  TurntableSpeed,
  type TurntableSpeed as TurntableSpeedValue,
} from "@/components/turntable/TurntablePlayerContext";
import { VinylSpinState, type VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";

/**
 * Indicator angle (CSS `rotate`, degrees) the speed knob points at per speed.
 *
 * The deck runs at a single speed (33⅓ RPM); the knob is a pure **indicator**,
 * not a control. It points at the lower-left "STANDBY" caption while stopped and
 * eases up to the upper-left "33" caption while playing. Derived from the label
 * geometry of the deck: the knob is a circle pinned to the bottom-right of its
 * 19%-wide label box, and the two captions sit at 150deg ("STANDBY") and 210deg
 * ("33") from the knob center (CSS convention: 0deg points right, positive is
 * clockwise because the y-axis points down).
 *
 * The values stay **monotonically increasing** (150 < 210) rather than wrapped
 * into (-180, 180]. A CSS `rotate` transition interpolates the raw degree numbers,
 * so the two stages must stay numerically close or the indicator would spin the
 * long way through 0deg between STANDBY and 33. `rotate(210deg)` renders
 * identically to `-150deg`, so the resting optic is unchanged; only the animated
 * path shortens.
 */
export const SPEED_KNOB_ANGLE_DEG = {
  /** Points at the lower-left "STANDBY" caption (deck stopped). */
  Standby: 150,
  /** Points at the upper-left "33" caption (deck playing). */
  Rpm33: 210,
} as const;

/**
 * Derives the power state from a speed.
 *
 * @param speed - The active turntable speed.
 * @returns `On` for the playing speed (`Rpm33`), `Standby` otherwise.
 */
export function derivePower(speed: TurntableSpeedValue): TurntablePowerValue {
  return speed === TurntableSpeed.Standby ? TurntablePower.Standby : TurntablePower.On;
}

/**
 * Maps a speed to its indicator angle (the caption the knob points at).
 *
 * @param speed - The active speed.
 * @returns The knob indicator angle in degrees ({@link SPEED_KNOB_ANGLE_DEG}).
 */
export function speedKnobAngle(speed: TurntableSpeedValue): number {
  return speed === TurntableSpeed.Rpm33 ? SPEED_KNOB_ANGLE_DEG.Rpm33 : SPEED_KNOB_ANGLE_DEG.Standby;
}

/** Parameters for {@link deriveSpinState}. */
export interface DeriveSpinStateParams {
  /** The spin state currently shown, used to decide whether to coast on stop. */
  currentSpinState: VinylSpinStateValue;
  /** The latest audio status, or `null` before any status is known. */
  status: AudioStatus | null;
}

/**
 * Derives the vinyl spin state from the audio status and the prior spin.
 *
 * Owned by the hub:
 * - `Playing` while the audio plays.
 * - `Coasting` when the audio stops (pause/end) out of a `Playing`/`Coasting`
 *   spin, so the rotor winds down instead of snapping to a halt.
 * - `Idle` when unavailable, status-less, or stopping from a non-spinning rest.
 *
 * @param params - The current spin state and audio status.
 * @returns The next {@link VinylSpinState}.
 */
export function deriveSpinState({ currentSpinState, status }: DeriveSpinStateParams): VinylSpinStateValue {
  if (status === AudioStatus.Playing) return VinylSpinState.Playing;
  if (status === AudioStatus.Unavailable || status === null) return VinylSpinState.Idle;
  if (currentSpinState === VinylSpinState.Playing || currentSpinState === VinylSpinState.Coasting) {
    return VinylSpinState.Coasting;
  }
  return VinylSpinState.Idle;
}
