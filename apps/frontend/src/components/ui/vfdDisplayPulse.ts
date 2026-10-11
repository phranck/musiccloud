import type { VfdCanvasRenderState, VfdDisplayLine } from "@/components/ui/VfdDisplayTypes";

/** Length of one pulse cycle in milliseconds: full brightness, down, and back up. */
export const VFD_PULSE_PERIOD_MS = 1600;

/**
 * Share of full brightness the lit pixels fall to at the bottom of a cycle. Low
 * enough that the change catches the eye, high enough that the text stays
 * readable throughout.
 */
export const VFD_PULSE_MIN_ALPHA = 0.35;

/**
 * Brightness of a pulsing row at a point in its cycle.
 *
 * A raised cosine, so the row starts at full brightness, eases down to
 * {@link VFD_PULSE_MIN_ALPHA} half way and eases back up. Starting and ending at
 * full brightness is what lets a pulse begin and end without a visible jump.
 *
 * @param elapsedMs - Time since the pulse started, in milliseconds.
 * @returns The alpha to draw the row's lit pixels with, in `[VFD_PULSE_MIN_ALPHA, 1]`.
 */
export function vfdPulseAlpha(elapsedMs: number): number {
  const phase = (elapsedMs / VFD_PULSE_PERIOD_MS) * 2 * Math.PI;
  return VFD_PULSE_MIN_ALPHA + ((1 - VFD_PULSE_MIN_ALPHA) * (1 + Math.cos(phase))) / 2;
}

/**
 * Starts, keeps, or winds down the pulse of one row to match its line.
 *
 * A row that begins to pulse starts its cycle at `now`. A row that stays pulsing
 * keeps its phase. A row that stops asking to pulse is given the end of its
 * current cycle as its stop time, so it returns to full brightness on its own
 * curve; asking again before then cancels the stop and the cycle carries on.
 * Mirrors `syncOverlayState` in `vfdDisplayOverlay.ts` and is called from the
 * same two places in `VfdDisplay.tsx`.
 *
 * @param state - The mutable canvas render state owning the pulse map.
 * @param line - The normalized line, read for its `pulse` flag.
 * @param rowIndex - Zero-based row index used as the map key.
 * @param now - Current `performance.now()` timestamp.
 * @param prefersReducedMotion - Whether motion is reduced; no pulse starts then.
 */
export function syncPulseState(
  state: VfdCanvasRenderState,
  line: Pick<VfdDisplayLine, "pulse">,
  rowIndex: number,
  now: number,
  prefersReducedMotion: boolean,
): void {
  const running = state.pulses.get(rowIndex);
  if (line.pulse && !prefersReducedMotion) {
    if (!running) state.pulses.set(rowIndex, { startedAt: now, stopAt: null });
    else running.stopAt = null;
    return;
  }
  if (!running || running.stopAt !== null) return;
  const cyclesStarted = Math.ceil((now - running.startedAt) / VFD_PULSE_PERIOD_MS);
  running.stopAt = running.startedAt + cyclesStarted * VFD_PULSE_PERIOD_MS;
}

/**
 * Alpha to draw one row with in the current frame, retiring a pulse that has
 * finished.
 *
 * A row without a pulse, a pulse past its stop time, and any pulse under
 * reduced motion all draw at full brightness, and the finished entry is removed
 * so the frame loop can stop once nothing else is moving.
 *
 * @param state - The mutable canvas render state owning the pulse map.
 * @param rowIndex - Zero-based row index.
 * @param now - Current `performance.now()` timestamp.
 * @returns The alpha for the row's lit pixels, `1` when the row does not pulse.
 */
export function rowPulseAlpha(state: VfdCanvasRenderState, rowIndex: number, now: number): number {
  const pulse = state.pulses.get(rowIndex);
  if (!pulse) return 1;
  if (state.prefersReducedMotion || (pulse.stopAt !== null && now >= pulse.stopAt)) {
    state.pulses.delete(rowIndex);
    return 1;
  }
  return vfdPulseAlpha(now - pulse.startedAt);
}
