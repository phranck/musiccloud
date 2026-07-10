/**
 * Quantization of the audio-preview playback progress ratio.
 *
 * The progress ratio (`currentTime / duration`) is sampled on the shared 60 Hz
 * ticker while a preview plays. Feeding every raw sample into React state
 * re-rendered the whole player subtree 60×/s — the dominant main-thread commit
 * source during playback, which starved hover/transition paints (the visible
 * jank). The progress bar itself floors its fill to a couple of pixels, so
 * sub-step ratio wobble is visually invisible: snapping the ratio to a coarse
 * grid collapses the 60 Hz churn into a handful of state changes per second with
 * no perceptible loss of smoothness.
 */

/** Number of discrete progress steps across the full 0..1 sweep. */
const PROGRESS_RATIO_STEPS = 200;

/**
 * The quantization grid size (`1 / {@link PROGRESS_RATIO_STEPS}` = 0.5%). A full
 * 30 s preview sampled at 60 fps produces ~1800 raw samples but at most
 * {@link PROGRESS_RATIO_STEPS} distinct quantized values, so the state-change
 * cadence drops from 60 Hz to well under 10 Hz.
 */
export const PROGRESS_RATIO_QUANTUM = 1 / PROGRESS_RATIO_STEPS;

/**
 * Clamps a raw progress ratio to `[0, 1]` and snaps it to the quantization grid.
 * Feeding the result through the state setter's dedup guard means a re-render
 * fires only when the bar would visibly move, not on every ticker frame.
 *
 * @param ratio - The raw `currentTime / duration` sample (may be out of range or non-finite).
 * @returns The clamped, grid-snapped ratio in `[0, 1]`; `0` for `NaN`.
 */
export function quantizeProgressRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(clamped * PROGRESS_RATIO_STEPS) / PROGRESS_RATIO_STEPS;
}
