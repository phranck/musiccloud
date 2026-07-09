import { prefersReducedMotion } from "./setup";

/**
 * Web-Animations-API timeline for the turntable record swap: the outgoing record
 * lifts off the spindle and slides out along a circular arc to the lower right
 * while the incoming record slides in along the same arc from the upper left and
 * settles onto the spindle.
 *
 * This is the WAAPI counterpart of `coverSwap.ts` (which uses GSAP for the flat
 * TFT cover). It is deliberately WAAPI, not GSAP: the swap fires during the
 * main-thread-heavy hub remount, where an off-main-thread compositor animation is
 * more robust; it is also the exact mechanism the vinyl rotor already uses
 * (`VinylRecord.tsx`), keeping the vinyl module consistent. Transform-only, with a
 * trailing `translateZ` so the value resolves to a real `matrix3d` on a stable GPU
 * layer (Safari/Firefox otherwise leave a flat `matrix` on the main thread).
 */

// --- Arc geometry (deck-normalized 0..1; see MC-112 plan) ---------------------
// The record centre travels on the circle through the top-⅓ edge crossing, the
// spindle centre (0.5, 0.5) and the right-⅔ edge crossing.
const ARC_CENTER_X = 0.9167;
const ARC_CENTER_Y = 0.0833;
const ARC_RADIUS = 0.5892;
/** Record diameter as a fraction of the deck (the platter disc is 86% of the deck). */
const DISC_TO_DECK = 0.86;
/** Angle (deg, atan2 in screen coords) of the spindle centre on the arc circle. */
const CENTER_ANGLE_DEG = 135;
/** Entry angle: far enough past the top-⅓ crossing that the whole disc clears the top edge. */
const ENTRY_ANGLE_DEG = 242;
/** Exit angle: far enough past the right-⅔ crossing that the whole disc clears the right edge. */
const EXIT_ANGLE_DEG = 30;
/** Sample count for the arc; 12 short segments approximate the circle smoothly. */
const ARC_SAMPLES = 12;
const DEG_TO_RAD = Math.PI / 180;

// --- Timing / easing ----------------------------------------------------------
/** Total duration (ms) of one record swap. Tunable; the lift/settle read from the scale ramp. */
const RECORD_SWAP_DURATION_MS = 1000;
/** Scale the record grows to as it lifts off the spindle, and shrinks back from as it settles. */
const LIFT_SCALE = 1.05;
/** The app-wide `mcOut` curve (see MotionEase.McOut / MC_OUT_BEZIER), applied per arc segment. */
const MC_OUT_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/** A running record-swap timeline. {@link cancel} stops it without settling (interrupt contract). */
export interface RecordSwapHandle {
  /**
   * Cancels both animations without firing `onSettle` (an interrupting swap
   * supersedes the settle). Commits the live transform before cancelling so a
   * compositor cancel does not flash the base transform for a frame.
   */
  cancel(): void;
}

/** Options for {@link buildRecordSwapTimeline}. */
export interface RecordSwapOptions {
  /** The freshly mounted record that slides in from the upper left and settles. */
  incoming: HTMLElement;
  /** The previous record that lifts off and slides out to the lower right. */
  outgoing: HTMLElement;
  /**
   * Called exactly once after natural completion (the incoming record settled) so
   * the consumer can unmount the outgoing buffer. NOT called on {@link RecordSwapHandle.cancel}
   * and NOT on the `null` reduced-motion path (the caller settles itself there).
   */
  onSettle: () => void;
}

/**
 * Builds `translate`/`scale` keyframes that walk the record centre along the arc
 * between two angles (percent translate is relative to the disc's own box, so it
 * scales with the responsive deck). A trailing `translateZ(0.01px)` forces a
 * `matrix3d` for GPU stability.
 *
 * @param fromAngleDeg - Start angle on the arc circle.
 * @param toAngleDeg - End angle on the arc circle.
 * @param fromScale - Scale at the start (the lift amount).
 * @param toScale - Scale at the end.
 * @returns Uniformly spaced WAAPI transform keyframes.
 */
function arcTransformKeyframes(
  fromAngleDeg: number,
  toAngleDeg: number,
  fromScale: number,
  toScale: number,
): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i += 1) {
    const t = i / ARC_SAMPLES;
    const angle = (fromAngleDeg + (toAngleDeg - fromAngleDeg) * t) * DEG_TO_RAD;
    const pointX = ARC_CENTER_X + ARC_RADIUS * Math.cos(angle);
    const pointY = ARC_CENTER_Y + ARC_RADIUS * Math.sin(angle);
    const translateXPercent = ((pointX - 0.5) / DISC_TO_DECK) * 100;
    const translateYPercent = ((pointY - 0.5) / DISC_TO_DECK) * 100;
    const scale = fromScale + (toScale - fromScale) * t;
    frames.push({
      transform: `translate(${translateXPercent.toFixed(3)}%, ${translateYPercent.toFixed(3)}%) scale(${scale.toFixed(4)}) translateZ(0.01px)`,
    });
  }
  return frames;
}

const SWAP_TIMING: KeyframeAnimationOptions = {
  duration: RECORD_SWAP_DURATION_MS,
  easing: MC_OUT_EASING,
  fill: "forwards",
};

/**
 * Builds and starts the record swap: the outgoing record animates from the
 * spindle centre out to the exit point (lifting via a scale ramp), the incoming
 * record animates from the entry point in to the spindle centre (settling as the
 * scale ramps back). Both run over {@link RECORD_SWAP_DURATION_MS}. Call it inside
 * a layout effect so the start transforms apply before the swap commit's first paint.
 *
 * @param options - Buffer elements and the settle callback (see {@link RecordSwapOptions}).
 * @returns A {@link RecordSwapHandle}, or `null` when the user prefers reduced
 *   motion (no styles written) or the Web Animations API is unavailable — the
 *   caller must settle immediately in that case.
 */
export function buildRecordSwapTimeline(options: RecordSwapOptions): RecordSwapHandle | null {
  if (prefersReducedMotion()) return null;
  const { incoming, outgoing, onSettle } = options;
  if (typeof incoming.animate !== "function" || typeof outgoing.animate !== "function") return null;

  let cancelled = false;

  const outgoingAnimation = outgoing.animate(
    arcTransformKeyframes(CENTER_ANGLE_DEG, EXIT_ANGLE_DEG, 1, LIFT_SCALE),
    SWAP_TIMING,
  );
  const incomingAnimation = incoming.animate(
    arcTransformKeyframes(ENTRY_ANGLE_DEG, CENTER_ANGLE_DEG, LIFT_SCALE, 1),
    SWAP_TIMING,
  );

  // The incoming record settling marks the swap complete; the outgoing buffer is
  // unmounted by the consumer in onSettle (its final off-deck transform is held by
  // `fill: forwards` until then).
  incomingAnimation.onfinish = () => {
    if (!cancelled) onSettle();
  };

  return {
    cancel() {
      cancelled = true;
      for (const animation of [outgoingAnimation, incomingAnimation]) {
        try {
          animation.commitStyles();
        } catch {
          // commitStyles throws on a detached/unstyled target; harmless here.
        }
        animation.cancel();
      }
    },
  };
}
