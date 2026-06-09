import type { ReactNode } from "react";
import type { VfdCanvasRenderState, VfdMarqueeMode, VfdMarqueeRuntimeState } from "@/components/ui/VfdDisplayTypes";
import { stringLength } from "@/components/ui/vfdDisplayNormalize";

/** Milliseconds between marquee column-step advances. */
const VFD_MARQUEE_COLUMN_STEP_MS = 67;

/** Number of column-step ticks the marquee dwells at each edge before reversing. */
const VFD_MARQUEE_EDGE_HOLD_STEPS = 4;

/**
 * Marquee scroll direction expressed as signed column-offset deltas.
 *
 * Used by {@link nextMarqueeState} so the state-machine can flip orientation
 * by replacing the direction with its opposite without branching on a
 * separate `"forward" | "backward"` discriminator.
 */
const MarqueeDirection = {
  Forward: 1,
  Backward: -1,
} as const;

/**
 * Decides whether a string-typed section's content is too wide for its
 * allocated cell range and should therefore be scrolled.
 *
 * Returns `false` immediately when marquee is disabled or undefined. Both
 * the explicit-true and `"overflow"` modes apply the same overflow test
 * today; the modes exist so callers can opt in to a future
 * always-scroll-anyway behavior without changing call sites.
 */
export function shouldMarquee(content: ReactNode, mode: VfdMarqueeMode | undefined, visibleCells: number): boolean {
  if (!mode) return false;
  if (mode === true) return stringLength(content) > visibleCells;
  return stringLength(content) > visibleCells;
}

/**
 * Resolves an explicit marquee mode, defaulting to `"overflow"` for plain
 * string content and leaving non-string content (already rendered as React
 * nodes) alone. This is the place that decides "without an explicit caller
 * opinion, scroll long text but never animate JSX".
 */
export function defaultMarqueeMode(
  content: ReactNode,
  marquee: VfdMarqueeMode | undefined,
): VfdMarqueeMode | undefined {
  if (marquee !== undefined) return marquee;
  return typeof content === "string" ? "overflow" : undefined;
}

/**
 * Pure state transition for one marquee animation tick.
 *
 * Holds the offset still while `holdSteps` is positive (edge dwell), then
 * advances by the current direction. Reverses at either end of the overflow
 * range and re-enters the edge-hold dwell. Symmetric so the bounce-scroll
 * appearance is independent of the starting direction.
 */
function nextMarqueeState(
  state: { offset: number; direction: number; holdSteps: number },
  overflowColumns: number,
): { offset: number; direction: number; holdSteps: number } {
  if (state.holdSteps > 0) return { ...state, holdSteps: state.holdSteps - 1 };

  const nextOffset = state.offset + state.direction;
  if (nextOffset >= overflowColumns) {
    return { offset: overflowColumns, direction: MarqueeDirection.Backward, holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS };
  }
  if (nextOffset <= 0) {
    return { offset: 0, direction: MarqueeDirection.Forward, holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS };
  }
  return { offset: nextOffset, direction: state.direction, holdSteps: 0 };
}

/**
 * Resolves the marquee state for one keyed section on the current frame.
 *
 * The render state stores a long-lived per-key state object; this helper
 * either fetches the existing one, creates a fresh one on first sight, or
 * advances it by however many column steps have elapsed since the last
 * frame. Frame deltas are accumulated in milliseconds and only advance the
 * column offset when they cross {@link VFD_MARQUEE_COLUMN_STEP_MS}.
 *
 * Returns the mutated entry so the caller can read `offset` without a
 * second `Map.get`. Mutating is deliberate: keeping the same object
 * identity avoids garbage during animation frames.
 *
 * @param state Shared canvas render state owning the marquee map.
 * @param key Stable identity for this section's marquee, used as the map key.
 * @param now Current performance timestamp from the animation frame.
 * @param overflowColumns How many columns the text overflows past its cell range.
 */
export function marqueeStateFor(
  state: VfdCanvasRenderState,
  key: string,
  now: number,
  overflowColumns: number,
): VfdMarqueeRuntimeState {
  const current = state.marqueeStates.get(key);
  if (!current) {
    const next = {
      offset: 0,
      direction: 1,
      holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS,
      elapsedMs: 0,
      previousFrameTime: now,
    };
    state.marqueeStates.set(key, next);
    return next;
  }

  if (current.previousFrameTime !== null) current.elapsedMs += now - current.previousFrameTime;
  current.previousFrameTime = now;

  const steps = Math.floor(current.elapsedMs / VFD_MARQUEE_COLUMN_STEP_MS);
  if (steps > 0) {
    current.elapsedMs -= steps * VFD_MARQUEE_COLUMN_STEP_MS;
    for (let step = 0; step < steps; step += 1) {
      const next = nextMarqueeState(current, overflowColumns);
      current.offset = next.offset;
      current.direction = next.direction;
      current.holdSteps = next.holdSteps;
    }
  }

  current.offset = Math.min(current.offset, overflowColumns);
  return current;
}
