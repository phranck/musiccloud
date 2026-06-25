import { useGSAP } from "@gsap/react";
import { type RefObject, useCallback, useRef, useState } from "react";
import { type TrackListView, useTrackListView } from "@/hooks/useTrackListView";
import { MotionDuration } from "@/lib/motion/constants";
import { animateFlipFrom, type CapturedFlipState, captureFlipState } from "@/lib/motion/flip";
import { prefersReducedMotion } from "@/lib/motion/setup";

/** Selects the cover elements that carry a flip id within the morph container. */
const FLIP_TARGET_SELECTOR = "[data-flip-id]";

interface UseTrackViewMorphResult {
  /** The currently selected presentation. */
  view: TrackListView;
  /**
   * Switches the presentation with a cover morph: snapshots the current covers
   * (before the commit), persists the new view, and animates the covers from the
   * snapshot to their new layout after the commit. No-op when `next` already
   * equals the current view.
   */
  setView: (next: TrackListView) => void;
  /** Attach to the element wrapping the presentation; scopes the flip. */
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Drives the list↔grid cover morph for one artist-track section. Wraps
 * {@link useTrackListView} (the persisted-view behavior is unchanged) and adds a
 * GSAP-Flip shared-element transition: every cover carries a stable
 * `data-flip-id` (the track key), so a cover glides from its list position/size
 * to its grid position/size — and back — across the React unmount/remount.
 *
 * Mechanism (same capture-before-commit / animate-after-commit shape as
 * {@link import("@/hooks/useFlipAnimation").useFlipAnimation}): `setView`
 * captures the covers while the OLD view is still mounted, flips the stored
 * view, and a tick-keyed `useGSAP` effect animates from the snapshot on the next
 * commit. `absolute: false` is the key choice — the covers stay in the new
 * layout's flow and only receive a transform offset, so the grid tiles keep
 * their height (no collapse) and the list row text keeps its place (no jump).
 *
 * Reduced motion: switches instantly (no capture, no tween) — handled in
 * `setView` so no flip is even armed.
 *
 * @param storageKey - localStorage key for the persisted view (per section).
 * @returns The current `view`, the morphing `setView`, and the `containerRef`.
 */
export function useTrackViewMorph(storageKey: string): UseTrackViewMorphResult {
  const [view, setStoredView] = useTrackListView(storageKey);
  const containerRef = useRef<HTMLDivElement>(null);
  // Monotonic counter keying the flip effect (not `view`): a fresh tick
  // guarantees the effect re-runs and consumes the new snapshot on every switch.
  const [morphTick, setMorphTick] = useState(0);
  const capturedStateRef = useRef<CapturedFlipState | null>(null);

  const setView = useCallback(
    (next: TrackListView) => {
      if (next === view) return;
      // Reduced motion: hard switch — no capture, no flip.
      if (prefersReducedMotion()) {
        setStoredView(next);
        return;
      }
      const container = containerRef.current;
      if (container) {
        // Capture while the OLD view is still in the DOM — the snapshot is the
        // "before" the next commit replaces. Order is load-bearing (see
        // captureFlipState in lib/motion/flip.ts).
        capturedStateRef.current = captureFlipState(container.querySelectorAll(FLIP_TARGET_SELECTOR));
      }
      setStoredView(next);
      setMorphTick((tick) => tick + 1);
    },
    [view, setStoredView],
  );

  useGSAP(
    () => {
      if (morphTick === 0) return;
      const container = containerRef.current;
      const state = capturedStateRef.current;
      capturedStateRef.current = null;
      if (!container || !state) return;
      // absolute: false keeps the covers in the new layout's flow (only a
      // transform offset animates), so grid tiles keep their height and list
      // rows keep the text in place — the covers morph without collapse or jump.
      animateFlipFrom(state, {
        targets: container.querySelectorAll(FLIP_TARGET_SELECTOR),
        duration: MotionDuration.Grid,
        absolute: false,
      });
    },
    { scope: containerRef, dependencies: [morphTick] },
  );

  return { view, setView, containerRef };
}
