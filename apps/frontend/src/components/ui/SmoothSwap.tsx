import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
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
 * GPU-only double-buffer transition for grouped content. On key changes the
 * old subtree slides down as one unit while the new subtree slides in from
 * above. No crossfade, no height/position animation.
 */
export function SmoothSwap({ swapKey, children, className, durationMs = 680 }: SmoothSwapProps) {
  const stateRef = useRef<SwapState>({ key: swapKey, current: children, previous: null, generation: 0 });
  const [state, setState] = useState<SwapState>(() => stateRef.current);

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

    const timeout = setTimeout(() => {
      setState((current) => {
        if (current.key !== swapKey) return current;
        const settledState = { ...current, previous: null };
        stateRef.current = settledState;
        return settledState;
      });
    }, durationMs + 80);

    return () => clearTimeout(timeout);
  }, [children, durationMs, swapKey]);

  const currentChildren = state.previous === null && state.key === swapKey ? children : state.current;
  const animationVars = { "--mc-swap-duration": `${durationMs}ms` } as React.CSSProperties;

  return (
    <div className={cn("grid overflow-hidden contain-paint", className)} style={animationVars}>
      {state.previous && (
        <div
          key={`previous-${state.generation}`}
          className="col-start-1 row-start-1 pointer-events-none mc-group-slide-out transform-gpu will-change-transform"
          aria-hidden="true"
        >
          {state.previous}
        </div>
      )}
      <div
        key={`current-${state.generation}`}
        className={cn(
          "col-start-1 row-start-1 transform-gpu will-change-transform",
          state.previous && "mc-group-slide-in",
        )}
      >
        {currentChildren}
      </div>
    </div>
  );
}
