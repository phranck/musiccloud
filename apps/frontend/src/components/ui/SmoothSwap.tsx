import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SmoothSwapProps {
  swapKey: string | number;
  children: ReactNode;
  className?: string;
  durationMs?: number;
}

interface SwapState {
  key: string | number;
  current: ReactNode;
  previous: ReactNode | null;
  generation: number;
}

/**
 * Double-buffer transition for grouped content. On key changes the old subtree
 * slides down as one unit while the new subtree slides in from above. The
 * wrapper height is measured and animated from old -> new at the same time so
 * longer/shorter copy, especially artist bios, never snaps the RecessedCard.
 */
export function SmoothSwap({ swapKey, children, className, durationMs = 680 }: SmoothSwapProps) {
  const stateRef = useRef<SwapState>({ key: swapKey, current: children, previous: null, generation: 0 });
  const [state, setState] = useState<SwapState>(() => stateRef.current);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const lastSettledHeight = useRef<number | null>(null);
  const heightResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useLayoutEffect(() => {
    if (!state.previous) return;
    const wrapper = wrapperRef.current;
    const previous = previousRef.current;
    const current = currentRef.current;
    if (!wrapper || !previous || !current) return;

    if (heightResetTimer.current) clearTimeout(heightResetTimer.current);

    const fromHeight = previous.getBoundingClientRect().height;
    const toHeight = current.getBoundingClientRect().height;

    Object.assign(wrapper.style, {
      height: `${fromHeight}px`,
      transition: "none",
    });
    void wrapper.offsetHeight;
    Object.assign(wrapper.style, {
      height: `${toHeight}px`,
      transition: `height ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    });

    heightResetTimer.current = setTimeout(() => {
      setState((currentState) => {
        if (currentState.generation !== state.generation) return currentState;
        const settledState = { ...currentState, previous: null };
        stateRef.current = settledState;
        return settledState;
      });
      Object.assign(wrapper.style, { height: "auto", transition: "" });
      lastSettledHeight.current = toHeight;
    }, durationMs + 80);

    return () => {
      if (heightResetTimer.current) clearTimeout(heightResetTimer.current);
    };
  }, [durationMs, state.generation, state.previous]);

  useEffect(() => {
    if (state.previous) return;
    const wrapper = wrapperRef.current;
    const current = currentRef.current;
    if (!wrapper || !current || typeof ResizeObserver === "undefined") return;

    lastSettledHeight.current = current.getBoundingClientRect().height;

    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = entry?.contentRect.height;
      const previousHeight = lastSettledHeight.current;
      if (!nextHeight || previousHeight == null || Math.abs(nextHeight - previousHeight) < 1) return;

      if (heightResetTimer.current) clearTimeout(heightResetTimer.current);
      Object.assign(wrapper.style, {
        height: `${previousHeight}px`,
        transition: "none",
      });
      void wrapper.offsetHeight;
      Object.assign(wrapper.style, {
        height: `${nextHeight}px`,
        transition: `height ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
      });

      heightResetTimer.current = setTimeout(() => {
        Object.assign(wrapper.style, { height: "auto", transition: "" });
      }, durationMs + 80);
      lastSettledHeight.current = nextHeight;
    });

    observer.observe(current);
    return () => observer.disconnect();
  }, [durationMs, state.previous]);

  const currentChildren = state.previous === null && state.key === swapKey ? children : state.current;
  const animationVars = { "--mc-swap-duration": `${durationMs}ms` } as React.CSSProperties;

  return (
    <div ref={wrapperRef} className={cn("grid overflow-hidden contain-paint", className)} style={animationVars}>
      {state.previous && (
        <div
          ref={previousRef}
          key={`previous-${state.generation}`}
          className="col-start-1 row-start-1 pointer-events-none mc-group-slide-out transform-gpu"
          aria-hidden="true"
        >
          {state.previous}
        </div>
      )}
      <div
        ref={currentRef}
        key={`current-${state.generation}`}
        className={cn("col-start-1 row-start-1 transform-gpu", state.previous && "mc-group-slide-in")}
      >
        {currentChildren}
      </div>
    </div>
  );
}
