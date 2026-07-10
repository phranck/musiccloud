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
/**
 * Entry angle: far enough BEFORE the top-⅓ crossing that the whole disc — at its
 * lifted {@link LIFT_SCALE} size — starts fully above the top edge. At the disc
 * radius (0.43 deck) × 1.12 the centre must clear the edge by ~0.48 deck, which
 * needs ~258° (242° left a sliver already on-deck at the first frame).
 */
const ENTRY_ANGLE_DEG = 258;
/**
 * Exit angle: far enough PAST the right-⅔ crossing that the whole lifted disc
 * clears the right edge. Same clearance math as {@link ENTRY_ANGLE_DEG}: ~8° puts
 * the centre ~1.02 deck to the right, so nothing is left on-deck when the arc ends
 * (30° left a visible slice that then popped away on unmount).
 */
const EXIT_ANGLE_DEG = 8;
/** Sample count for the arc; 12 short segments approximate the circle smoothly. */
const ARC_SAMPLES = 12;
const DEG_TO_RAD = Math.PI / 180;

// --- Timing / easing ----------------------------------------------------------
/**
 * Total duration (ms) of ONE record's arc; both records run this long and
 * overlap. Tunable. Deliberately slower than a plain slide so the lift-off and
 * the set-down each get a visible beat instead of flashing past.
 */
const RECORD_SWAP_DURATION_MS = 1700;
/**
 * Scale the record grows to as it lifts off the spindle, and shrinks back from as
 * it settles — the top-down projection of the disc rising toward / lowering away
 * from the viewer. Kept large enough that the lift and settle actually read (a few
 * percent looks like nothing).
 */
const LIFT_SCALE = 1.12;
/**
 * Ease-in-out curve (easeInOutCubic): slow start, fast middle, slow end. BOTH
 * records share this one curve so they move in perfect lockstep. The symmetry
 * pays off twice over: the slow start is the outgoing record's visible lift-off at
 * the spindle, the slow end is the incoming record's visible set-down, and the
 * fast middle keeps their crossover brief so the new disc never sits on top of the
 * old one for long.
 */
const MC_IN_OUT_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

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
 * Builds `translate`/`rotate`/`scale` keyframes that walk the record centre along
 * the arc between two angles (percent translate is relative to the disc's own box,
 * so it scales with the responsive deck).
 *
 * The disc also ROTATES about its own centre by its arc offset from the spindle —
 * translate + rotate together are one rigid-body rotation about the arc's centre, as
 * if the disc were pinned to a turntable arm. Without it the label would stay upright
 * while gliding a curved path, which reads as physically wrong (a disc carried around
 * a circle turns with the circle).
 *
 * The rotation is referenced to the SPINDLE ({@link CENTER_ANGLE_DEG}), not to the
 * arc start: the disc is upright (0°) exactly when centred on the spindle and
 * rotated by its arc displacement elsewhere. So the incoming disc settles upright,
 * the outgoing disc begins upright, the resting record is never left tilted, and a
 * later swap starts from that same 0° — nothing snaps. `rotate` sits before `scale`
 * (both act on the disc's own centre, before the translate positions it); a trailing
 * `translateZ(0.01px)` forces a `matrix3d` for GPU stability.
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
    const angleDeg = fromAngleDeg + (toAngleDeg - fromAngleDeg) * t;
    const angle = angleDeg * DEG_TO_RAD;
    const pointX = ARC_CENTER_X + ARC_RADIUS * Math.cos(angle);
    const pointY = ARC_CENTER_Y + ARC_RADIUS * Math.sin(angle);
    const translateXPercent = ((pointX - 0.5) / DISC_TO_DECK) * 100;
    const translateYPercent = ((pointY - 0.5) / DISC_TO_DECK) * 100;
    const scale = fromScale + (toScale - fromScale) * t;
    const rotationDeg = arcRotationDeg(angleDeg);
    frames.push({
      transform: `translate(${translateXPercent.toFixed(3)}%, ${translateYPercent.toFixed(3)}%) rotate(${rotationDeg.toFixed(3)}deg) scale(${scale.toFixed(4)}) translateZ(0.01px)`,
    });
  }
  return frames;
}

/**
 * The disc's own-centre rotation for a given arc position — its offset from the
 * spindle angle, so it is 0° at the spindle. Shared by the disc keyframes and the
 * reflection's counter-rotation.
 *
 * @param angleDeg - The disc centre's current angle on the arc circle.
 * @returns The disc rotation in degrees (0 at the spindle).
 */
function arcRotationDeg(angleDeg: number): number {
  return angleDeg - CENTER_ANGLE_DEG;
}

/**
 * Counter-rotation keyframes for the rainbow reflection so it stays FIXED while the
 * disc turns: the light source is constant, so the sheen must not rotate with the
 * grooves. It negates the disc's own-centre rotation ({@link arcRotationDeg}),
 * cancelling that layer's turn while the disc's translate + scale (from the wrapper)
 * still carry the reflection along with the moving disc.
 *
 * @param fromAngleDeg - Start angle on the arc circle.
 * @param toAngleDeg - End angle on the arc circle.
 * @returns Uniformly spaced counter-rotation keyframes.
 */
function reflectionCounterKeyframes(fromAngleDeg: number, toAngleDeg: number): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i += 1) {
    const t = i / ARC_SAMPLES;
    const angleDeg = fromAngleDeg + (toAngleDeg - fromAngleDeg) * t;
    frames.push({ transform: `rotate(${(-arcRotationDeg(angleDeg)).toFixed(3)}deg) translateZ(0.01px)` });
  }
  return frames;
}

/**
 * Animates the rainbow-reflection layer inside a record wrapper with the
 * counter-rotation that keeps it fixed under the constant light. Returns `null`
 * when the wrapper has no reflection layer (or no Web Animations API), so the
 * caller can skip it.
 *
 * @param host - The record wrapper element (its `[data-vinyl-reflection]` layer is animated).
 * @param fromAngleDeg - Start angle on the arc circle.
 * @param toAngleDeg - End angle on the arc circle.
 * @returns The reflection's counter-rotation animation, or `null`.
 */
function animateReflectionCounter(host: HTMLElement, fromAngleDeg: number, toAngleDeg: number): Animation | null {
  const reflection = host.querySelector<HTMLElement>("[data-vinyl-reflection]");
  if (!reflection || typeof reflection.animate !== "function") return null;
  return reflection.animate(reflectionCounterKeyframes(fromAngleDeg, toAngleDeg), SWAP_TIMING);
}

/**
 * Shared timing for both records: identical duration and easing, so the outgoing
 * and incoming records travel at mirror positions on the arc at every moment —
 * they move synchronously, never one lagging the other.
 */
const SWAP_TIMING: KeyframeAnimationOptions = {
  duration: RECORD_SWAP_DURATION_MS,
  easing: MC_IN_OUT_EASING,
  fill: "forwards",
};

/**
 * Builds and starts the record swap: the outgoing record travels from the spindle
 * centre out to the exit point (lifting via a scale ramp) while the incoming record
 * travels from the entry point in to the spindle centre (settling as the scale ramps
 * back). Both share {@link SWAP_TIMING} — same duration, same ease-in-out — so they
 * move synchronously; the shared curve's slow start is the outgoing lift-off, its
 * slow end is the incoming set-down. Call it inside a layout effect so the start
 * transforms apply before the swap commit's first paint.
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

  // Hold the rainbow reflection still under the constant light while each disc
  // rotates (see animateReflectionCounter). Absent on a bare test element.
  const reflectionAnimations = [
    animateReflectionCounter(outgoing, CENTER_ANGLE_DEG, EXIT_ANGLE_DEG),
    animateReflectionCounter(incoming, ENTRY_ANGLE_DEG, CENTER_ANGLE_DEG),
  ].filter((animation): animation is Animation => animation !== null);

  // The incoming record settling marks the swap complete; the outgoing buffer is
  // unmounted by the consumer in onSettle (its final off-deck transform is held by
  // `fill: forwards` until then).
  incomingAnimation.onfinish = () => {
    if (!cancelled) onSettle();
  };

  return {
    cancel() {
      cancelled = true;
      for (const animation of [outgoingAnimation, incomingAnimation, ...reflectionAnimations]) {
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
