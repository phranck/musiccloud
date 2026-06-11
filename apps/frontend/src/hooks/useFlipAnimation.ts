import { useGSAP } from "@gsap/react";
import { type RefObject, useCallback, useRef, useState } from "react";
import { MotionDuration } from "@/lib/motion/constants";
import { animateFlipFrom, type CapturedFlipState, captureFlipState } from "@/lib/motion/flip";

/**
 * CSS individual transform properties that `Flip.getState` sets to inline
 * `none` while snapshotting (GSAP bakes them into its transform matrix so they
 * cannot conflict during a flip). Visually inert for the search field (it
 * authors none of them), but they are stripped again on every terminal path so
 * the hook never leaves residue in the field's style attribute.
 */
const SNAPSHOT_RESIDUE_PROPERTIES = ["translate", "rotate", "scale"] as const;

/**
 * Removes the inline `translate/rotate/scale` normalization that capturing a
 * Flip snapshot writes onto the element (see
 * {@link SNAPSHOT_RESIDUE_PROPERTIES}). Idempotent: a no-op when Flip's own
 * completion cleanup already removed them.
 *
 * @param el - The element a snapshot was captured from.
 */
function stripSnapshotResidue(el: HTMLElement): void {
  for (const property of SNAPSHOT_RESIDUE_PROPERTIES) {
    el.style.removeProperty(property);
  }
}

interface UseFlipAnimationResult {
  /**
   * `true` from the moment {@link UseFlipAnimationResult.triggerReturn} is
   * called until the return flip finishes (or is skipped). Consumers use it to
   * coordinate companion effects, e.g. fading the large logo back in while the
   * field travels.
   */
  isReturning: boolean;
  /**
   * Captures the field's current layout as the "before" state of the next
   * return flip. Must be called while the OLD (pre-clear) layout is still
   * measurable — i.e. in the event handler, BEFORE the state change that
   * re-centers the field commits. No-op when the field is not mounted.
   */
  capturePosition: () => void;
  /**
   * Arms the return flip: after the next React commit the field animates from
   * the captured position to its new (centered) layout position.
   */
  triggerReturn: () => void;
}

/**
 * FLIP return animation for the hero search field when the app transitions
 * back from a results layout to the idle (centered) layout.
 *
 * Mechanism: a thin consumer of the shared GSAP Flip utility
 * (`lib/motion/flip.ts`) — `capturePosition` snapshots the field via
 * `captureFlipState`, and once `triggerReturn` arms the flip, the layout
 * effect animates from that snapshot via `animateFlipFrom` with
 * {@link MotionDuration.FlipReturn} (0.62 s) and the shared `mcOut` ease —
 * the exact timing/curve of the previous hand-rolled CSS-transition FLIP.
 * The utility (not this hook) carries the `setupMotion()` registration and
 * reduced-motion contracts, so the hook never imports gsap/Flip directly.
 *
 * `absolute: false` is deliberate: the field is a single in-flow element
 * inside a flex column whose siblings/parent do not flip along. Taking it
 * `position: absolute` during the flip (the utility default) would collapse
 * the parent and make siblings jump. The field's width does not change across
 * the return (`w-full` wrapper in a stable-width container), so this is a
 * pure position flip — the utility's `scale: true` default stays inert.
 *
 * `useGSAP` (rather than a hand-rolled `useLayoutEffect`) is the simplest
 * correct shape here: its context auto-revert kills an in-flight flip and
 * strips its inline transforms when the hook unmounts or a new return is
 * armed — the safety net the old implementation hand-rolled with
 * `transitionend` listeners. On natural completion Flip removes its own
 * inline writes, and every terminal path additionally strips the snapshot's
 * transform normalization, so no path leaves stale inline styles.
 *
 * Reduced motion: `animateFlipFrom` performs a one-shot
 * `prefersReducedMotion()` read and returns `null` without creating a tween;
 * the element already sits at its natural position after the commit, so the
 * hook just releases `isReturning` immediately (equivalent to the old CSS
 * `prefers-reduced-motion` neutralization — an instant jump).
 *
 * State timing: `isReturning` resets via the timeline's `onComplete`, i.e.
 * AFTER the transition has finished — the same boundary the old
 * `transitionend` listener used. No React commit is triggered while the
 * tween is running (performance policy of plan MC-029).
 *
 * @param searchFieldRef - Ref to the search field wrapper that travels
 *   between the compact (top) and idle (centered) layout positions.
 * @returns The `isReturning` flag plus the `capturePosition`/`triggerReturn`
 *   pair; call them in that order from the same event handler.
 */
export function useFlipAnimation(searchFieldRef: RefObject<HTMLDivElement | null>): UseFlipAnimationResult {
  const [isReturning, setIsReturning] = useState(false);
  // Monotonic arming counter: 0 = never triggered. The flip effect is keyed on
  // this counter (not on `isReturning`) so that re-arming while a flip is
  // still running restarts the effect: `capturePosition` force-completes the
  // in-flight flip (GSAP snapshot semantics), whose onComplete queues
  // `isReturning: false` into the same batch as the trigger's `true` — a
  // boolean-keyed effect would see true→true and never consume the fresh
  // snapshot, stranding the flag.
  const [returnTick, setReturnTick] = useState(0);
  const capturedStateRef = useRef<CapturedFlipState | null>(null);

  const capturePosition = useCallback(() => {
    if (searchFieldRef.current) {
      capturedStateRef.current = captureFlipState(searchFieldRef.current);
    }
  }, [searchFieldRef]);

  const triggerReturn = useCallback(() => {
    setIsReturning(true);
    setReturnTick((tick) => tick + 1);
  }, []);

  useGSAP(
    () => {
      if (returnTick === 0) return;
      const el = searchFieldRef.current;
      const state = capturedStateRef.current;
      capturedStateRef.current = null;
      if (!el || !state) {
        // Armed without a usable snapshot (or the field left the DOM in the
        // same commit): nothing to animate — release the flag so it cannot
        // stay stuck on `true`.
        setIsReturning(false);
        return;
      }
      const timeline = animateFlipFrom(state, {
        targets: el,
        duration: MotionDuration.FlipReturn,
        absolute: false,
      });
      if (!timeline) {
        // Reduced motion: no tween exists; the commit already placed the
        // field at its final position.
        stripSnapshotResidue(el);
        setIsReturning(false);
        return;
      }
      timeline.eventCallback("onComplete", () => {
        stripSnapshotResidue(el);
        setIsReturning(false);
      });
    },
    { dependencies: [returnTick, searchFieldRef] },
  );

  return { isReturning, capturePosition, triggerReturn };
}
