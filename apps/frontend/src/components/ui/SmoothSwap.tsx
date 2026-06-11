import { useGSAP } from "@gsap/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildResizeTimeline, buildSwapTimeline, DEFAULT_SWAP_DURATION_MS } from "@/lib/motion/swap";
import { cn } from "@/lib/utils";

/**
 * Sub-pixel noise threshold for the in-place ResizeObserver path: content
 * height changes below this are rounding artifacts (fractional layout vs.
 * integer `offsetHeight`), not real resizes worth animating.
 */
const RESIZE_EPSILON_PX = 1;

interface SmoothSwapProps {
  /** Identity of the current content; changing it triggers the swap animation. */
  swapKey: string | number;
  /** The content group rendered into the active buffer. */
  children: ReactNode;
  /** Extra classes for the clipping wrapper element. */
  className?: string;
  /**
   * Swap duration in milliseconds. Defaults to
   * {@link DEFAULT_SWAP_DURATION_MS} (680 ms, `MotionDuration.Swap`); the
   * millisecond unit is kept for public-API stability and converted to GSAP
   * seconds inside `lib/motion/swap.ts`.
   */
  durationMs?: number;
}

/**
 * Double-buffer bookkeeping for one swap generation.
 *
 * @property key - The swapKey the buffered content belongs to.
 * @property current - Content of the active (incoming) buffer.
 * @property previous - Content of the outgoing buffer; `null` once settled.
 * @property generation - Monotonic counter; a new value marks a new swap and
 *   keys both buffer elements, so React remounts them per generation.
 */
interface SwapState {
  key: string | number;
  current: ReactNode;
  previous: ReactNode | null;
  generation: number;
}

/**
 * Double-buffer transition for grouped content. On key changes the old
 * subtree slides down out of view as one unit while the new subtree slides in
 * from above (ported 1:1 from the retired `mc-group-slide-in/out` keyframes:
 * transform-only, no crossfade), so longer/shorter copy — especially artist
 * bios — never snaps the RecessedCard.
 *
 * Compositor-only height handling (plan MC-029): the wrapper's height is NOT
 * animated. The previous buffer is `position: absolute`, so the wrapper's
 * layout height jumps to the new content's natural height exactly once at
 * commit; `buildSwapTimeline` then plays the visual size change as a FLIP
 * scale animation with per-frame counter-scaled buffers (zero layout work per
 * frame, zero text distortion — see `lib/motion/swap.ts`). On completion the
 * timeline clears its inline styles and settles the state, which unmounts the
 * previous buffer; the wrapper is back at untouched auto height.
 *
 * Interruption: a new swapKey mid-flight bumps `generation`, which remounts
 * both buffers (fresh, untransformed nodes) and re-runs the `useGSAP` effect;
 * its context cleanup kills the in-flight timeline and the factory strips any
 * transform residue from the persistent wrapper before re-measuring. The
 * superseded content restarts as the new outgoing buffer — same restart
 * semantics the CSS keyframes had (they also re-ran from their start values
 * on remount).
 *
 * In-place resizes (no key change, e.g. an image finishing to load inside the
 * active content) are detected by a ResizeObserver between swaps and play the
 * same scale FLIP via `buildResizeTimeline`.
 *
 * Reduced motion: the factories return `null` without writing styles; the
 * swap then settles immediately (instant content change at natural height).
 */
export function SmoothSwap({ swapKey, children, className, durationMs = DEFAULT_SWAP_DURATION_MS }: SmoothSwapProps) {
  const stateRef = useRef<SwapState>({ key: swapKey, current: children, previous: null, generation: 0 });
  const [state, setState] = useState<SwapState>(() => stateRef.current);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (stateRef.current.key === swapKey) {
      if (stateRef.current.previous === null) {
        stateRef.current = { ...stateRef.current, current: children };
        setState(stateRef.current);
      }
      return;
    }

    const nextState = {
      key: swapKey,
      current: children,
      previous: stateRef.current.current,
      generation: stateRef.current.generation + 1,
    };
    stateRef.current = nextState;
    setState(nextState);
  }, [children, swapKey]);

  useGSAP(
    () => {
      if (!state.previous) return;
      const wrapper = wrapperRef.current;
      const previous = previousRef.current;
      const current = currentRef.current;
      if (!wrapper || !previous || !current) return;

      const settle = () => {
        setState((currentState) => {
          if (currentState.generation !== state.generation) return currentState;
          const settledState = { ...currentState, previous: null };
          stateRef.current = settledState;
          return settledState;
        });
      };

      const timeline = buildSwapTimeline({ wrapper, current, previous, durationMs, onSettle: settle });
      // Reduced motion: no timeline exists and the commit already shows the
      // final layout (wrapper at the new content's natural height), so
      // settling immediately IS the instant end state.
      if (!timeline) settle();
    },
    { scope: wrapperRef, dependencies: [durationMs, state.generation, state.previous] },
  );

  useEffect(() => {
    if (state.previous) return;
    const wrapper = wrapperRef.current;
    const current = currentRef.current;
    if (!wrapper || !current || typeof ResizeObserver === "undefined") return;

    // offsetHeight (layout box) instead of getBoundingClientRect: immune to
    // transform residue, consistent with the observer's contentRect reads.
    let lastSettledHeight = current.offsetHeight;
    let timeline: ReturnType<typeof buildResizeTimeline> = null;

    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = entry?.contentRect.height;
      if (!nextHeight || Math.abs(nextHeight - lastSettledHeight) < RESIZE_EPSILON_PX) return;

      timeline?.kill();
      timeline = buildResizeTimeline({
        wrapper,
        current,
        fromHeight: lastSettledHeight,
        toHeight: nextHeight,
        durationMs,
      });
      lastSettledHeight = nextHeight;
    });

    observer.observe(current);
    return () => {
      observer.disconnect();
      timeline?.kill();
    };
  }, [durationMs, state.previous]);

  const currentChildren = state.previous === null && state.key === swapKey ? children : state.current;

  return (
    <div ref={wrapperRef} className={cn("relative grid overflow-hidden contain-paint", className)}>
      {state.previous && (
        <div
          ref={previousRef}
          key={`previous-${state.generation}`}
          // Out of flow, so the wrapper's layout height is defined by the
          // incoming buffer alone (the FLIP "last" state) from commit on.
          className="absolute inset-x-0 top-0 pointer-events-none transform-gpu"
          aria-hidden="true"
        >
          {state.previous}
        </div>
      )}
      <div ref={currentRef} key={`current-${state.generation}`} className="col-start-1 row-start-1 transform-gpu">
        {currentChildren}
      </div>
    </div>
  );
}
