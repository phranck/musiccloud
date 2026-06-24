import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type RefObject, useCallback, useRef, useState } from "react";
import { type TrackListView, useTrackListView } from "@/hooks/useTrackListView";
import { MotionDuration, MotionEase } from "@/lib/motion/constants";
import { animateFlipFrom, type CapturedFlipState, captureFlipState } from "@/lib/motion/flip";
import { prefersReducedMotion } from "@/lib/motion/setup";

/** Marks the fading ghost of the outgoing view (rendered by ArtistTrackContent). */
const GHOST_SELECTOR = "[data-track-ghost]";

/** The ghost fades faster than the covers travel, so the double-cover overlap is brief. */
const GHOST_FADE_FACTOR = 0.6;

/** Selects the cover elements that carry a flip id within the morph container. */
const FLIP_TARGET_SELECTOR = "[data-flip-id]";

interface UseTrackViewMorphResult {
  /** The currently selected presentation. */
  view: TrackListView;
  /**
   * The view that is animating OUT, or `null` when no morph is in flight. The
   * consumer renders this as a fading "ghost" overlay so the outgoing row text
   * can fade while the covers travel; it clears when the flip completes.
   */
  outgoingView: TrackListView | null;
  /**
   * Switches the presentation with a cover morph: snapshots the current covers
   * (before the commit), persists the new view, and animates the covers from
   * the snapshot to their new layout after the commit. No-op when `next`
   * already equals the current view.
   */
  setView: (next: TrackListView) => void;
  /** Attach to the element wrapping both presentations; scopes the flip + ghost. */
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Drives the list↔grid cover morph for one artist-track section. Wraps
 * {@link useTrackListView} (the persisted-view behavior is unchanged) and adds a
 * GSAP-Flip shared-element transition: every cover carries a stable
 * `data-flip-id` (the track key), so the covers glide from their list positions
 * to their grid positions — and back — across the React unmount/remount.
 *
 * Mechanism (same capture-before-commit / animate-after-commit shape as
 * {@link import("@/hooks/useFlipAnimation").useFlipAnimation}): `setView`
 * captures the covers while the OLD view is still mounted, flips the stored
 * view, and a tick-keyed `useGSAP` effect animates from the snapshot on the
 * next commit. `outgoingView` is held across that window so the consumer can
 * render the fading ghost of the old view (overlapping text fade, variant 2).
 *
 * Reduced motion: {@link animateFlipFrom} returns `null`, so no tween runs and
 * `outgoingView` clears immediately — a hard, instant switch.
 *
 * @param storageKey - localStorage key for the persisted view (per section).
 * @returns The current `view`, the in-flight `outgoingView`, the morphing
 *   `setView`, and the `containerRef` to wrap both presentations with.
 */
export function useTrackViewMorph(storageKey: string): UseTrackViewMorphResult {
  const [view, setStoredView] = useTrackListView(storageKey);
  const containerRef = useRef<HTMLDivElement>(null);
  const [outgoingView, setOutgoingView] = useState<TrackListView | null>(null);
  // Monotonic counter keying the flip effect (not `view`/`outgoingView`): a
  // fresh tick guarantees the effect re-runs and consumes the new snapshot even
  // when rapid switches would otherwise collapse the keyed state to one value.
  const [morphTick, setMorphTick] = useState(0);
  const capturedStateRef = useRef<CapturedFlipState | null>(null);

  const setView = useCallback(
    (next: TrackListView) => {
      if (next === view) return;
      // Reduced motion: hard switch — no ghost, no capture, no flip. Handling it
      // here (not in the effect) avoids a one-frame ghost flash before the tween
      // would have been skipped.
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
      setOutgoingView(view);
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
      if (!container || !state) {
        setOutgoingView(null);
        return;
      }
      const timeline = animateFlipFrom(state, {
        targets: container.querySelectorAll(FLIP_TARGET_SELECTOR),
        duration: MotionDuration.Grid,
      });
      if (!timeline) {
        // Defensive: no tween (reduced motion is already handled in setView).
        setOutgoingView(null);
        return;
      }
      // Fade the outgoing ghost out while the covers travel (variant 2 overlap):
      // its row text disappears as the shared covers glide to the new layout.
      const ghost = container.querySelector<HTMLElement>(GHOST_SELECTOR);
      if (ghost) {
        gsap.to(ghost, { opacity: 0, duration: MotionDuration.Grid * GHOST_FADE_FACTOR, ease: MotionEase.McOut });
      }
      timeline.eventCallback("onComplete", () => setOutgoingView(null));
    },
    { scope: containerRef, dependencies: [morphTick] },
  );

  return { view, outgoingView, setView, containerRef };
}
