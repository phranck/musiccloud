import { AudioStatus } from "@/components/audio/AudioStatus";
import {
  TurntablePower,
  type TurntablePower as TurntablePowerValue,
  TurntableSpeed,
  type TurntableSpeed as TurntableSpeedValue,
} from "@/components/turntable/TurntablePlayerContext";
import { VinylSpinState, type VinylSpinState as VinylSpinStateValue } from "@/components/vinyl/VinylRecord.types";

/**
 * One full rotor revolution at 33⅓ RPM, in milliseconds.
 *
 * Matches the original single rotation duration of `VinylRecord` and stays the
 * default so the deco spinners (HeroSubmitSlot, SlideArtwork) keep their tempo.
 */
export const LP_ROTATION_DURATION_33_MS = 1800;

/**
 * One full rotor revolution at 45 RPM, in milliseconds.
 *
 * ≈ 1800 × 33⅓ / 45 = 1333.3, rounded to 1333. 45 RPM turns ~1.35× faster than
 * 33⅓, so the rotor completes a revolution in proportionally less time. This is
 * a purely visual tempo; `audio.playbackRate` is never touched (no pitch shift).
 */
export const LP_ROTATION_DURATION_45_MS = 1333;

/**
 * Indicator angle (CSS `rotate`, degrees) the speed knob points at per speed.
 *
 * Derived from the label geometry in `Turntable.tsx`: the knob is a circle pinned
 * to the bottom-right of its 19%-wide label box (center at 63.5%/63.5% of the
 * box), and the "33", "45" and "STANDBY" captions sit at known box-relative
 * positions. The angle from the knob center to each caption (CSS convention:
 * 0deg points right, positive is clockwise because the y-axis points down)
 * resolves to exactly these values. `Rpm33` reproduces the original decorative
 * `rotate(-150deg)` indicator, which already pointed at the "33" caption.
 */
export const SPEED_KNOB_ANGLE_DEG = {
  /** Points at the lower-left "STANDBY" caption. */
  Standby: 150,
  /** Points at the upper-left "33" caption (the original static indicator angle). */
  Rpm33: -150,
  /** Points at the upper "45" caption. */
  Rpm45: -120,
} as const;

/** Ordered speed cycle for the keyboard arrow stepper: Standby -> Rpm33 -> Rpm45 -> Standby. */
const SPEED_CYCLE: readonly TurntableSpeedValue[] = [
  TurntableSpeed.Standby,
  TurntableSpeed.Rpm33,
  TurntableSpeed.Rpm45,
];

/**
 * Derives the power state from a speed.
 *
 * @param speed - The active turntable speed.
 * @returns `On` for a playing speed (`Rpm33`/`Rpm45`), `Standby` otherwise.
 */
export function derivePower(speed: TurntableSpeedValue): TurntablePowerValue {
  return speed === TurntableSpeed.Standby ? TurntablePower.Standby : TurntablePower.On;
}

/**
 * Advances one step through the speed cycle (Standby -> Rpm33 -> Rpm45 -> Standby).
 *
 * Used by the keyboard arrow stepper on the knob. Drag interaction snaps via
 * {@link speedFromAngle} instead.
 *
 * @param speed - The current speed.
 * @returns The next speed in the cycle.
 */
export function nextSpeedInCycle(speed: TurntableSpeedValue): TurntableSpeedValue {
  const index = SPEED_CYCLE.indexOf(speed);
  return SPEED_CYCLE[(index + 1) % SPEED_CYCLE.length] ?? TurntableSpeed.Standby;
}

/**
 * Shifts a speed by a signed number of detents along the ladder
 * Standby -> Rpm33 -> Rpm45, clamped at both ends (no wrap).
 *
 * Drives the knob's vertical drag: the drag distance maps to a detent offset
 * from the speed held at press, so a longer drag moves several detents at once.
 * A positive `offset` moves toward a faster speed, a negative `offset` toward
 * `Standby`; offsets past either end clamp.
 *
 * @param speed - The reference speed (where the drag started).
 * @param offset - Signed detent count to move (positive = faster).
 * @returns The speed `offset` detents away, clamped to the ladder ends.
 */
export function speedAtOffset(speed: TurntableSpeedValue, offset: number): TurntableSpeedValue {
  const index = SPEED_CYCLE.indexOf(speed);
  if (index === -1) return speed;
  const nextIndex = Math.max(0, Math.min(SPEED_CYCLE.length - 1, index + offset));
  return SPEED_CYCLE[nextIndex] ?? speed;
}

/**
 * Steps a speed one detent up or down the ladder Standby -> Rpm33 -> Rpm45.
 *
 * Drives the knob's keyboard control: a positive `delta` moves toward a faster
 * speed, a negative `delta` toward `Standby`, clamped at both ends (no wrap),
 * matching `role="slider"` arrow-key semantics. Only the sign of `delta` matters.
 *
 * @param speed - The current speed.
 * @param delta - Direction to step (positive = faster, negative = toward Standby).
 * @returns The neighbouring speed, clamped at the ends of the ladder.
 */
export function stepSpeed(speed: TurntableSpeedValue, delta: number): TurntableSpeedValue {
  if (delta === 0) return speed;
  return speedAtOffset(speed, delta > 0 ? 1 : -1);
}

/**
 * Maps a speed to its indicator angle (the caption the knob points at).
 *
 * @param speed - The active speed.
 * @returns The knob indicator angle in degrees.
 */
export function speedKnobAngle(speed: TurntableSpeedValue): number {
  switch (speed) {
    case TurntableSpeed.Rpm45:
      return SPEED_KNOB_ANGLE_DEG.Rpm45;
    case TurntableSpeed.Rpm33:
      return SPEED_KNOB_ANGLE_DEG.Rpm33;
    case TurntableSpeed.Standby:
      return SPEED_KNOB_ANGLE_DEG.Standby;
  }
}

/**
 * Selects the rotor revolution duration for a speed.
 *
 * @param speed - The active speed.
 * @returns {@link LP_ROTATION_DURATION_45_MS} for `Rpm45`, otherwise
 *   {@link LP_ROTATION_DURATION_33_MS} (used for `Rpm33` and `Standby`).
 */
export function rotationDurationForSpeed(speed: TurntableSpeedValue): number {
  return speed === TurntableSpeed.Rpm45 ? LP_ROTATION_DURATION_45_MS : LP_ROTATION_DURATION_33_MS;
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
 * Mirrors the `nextVinylSpinStateFromPreviewStatus` logic that previously lived
 * in `ShareLayout`, now owned by the hub:
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
