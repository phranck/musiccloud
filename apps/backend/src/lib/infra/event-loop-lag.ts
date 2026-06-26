import { monitorEventLoopDelay } from "node:perf_hooks";

/**
 * Process-wide event-loop delay monitor.
 *
 * Measures how long the libuv event loop is blocked between timer ticks. A
 * high value means the single Node thread was busy and could not service I/O
 * callbacks in time, which on this deployment points at CPU starvation (shared
 * CPU steal), a V8 GC pause, or a synchronous hot spot. It is the discriminator
 * the artist-info slow-path breadcrumb uses to tell "the handler was blocked on
 * the event loop" apart from "the handler was waiting on upstream/DB I/O" (in
 * which case the loop stays responsive and this stays low).
 *
 * The histogram is reset on a fixed cadence so {@link readEventLoopLagMs}
 * reports the worst delay in a recent window rather than the maximum since
 * process boot (which would stay pinned high forever after a single spike).
 */
const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

/** Window over which the lag max/mean is accumulated before it resets. */
const RESET_INTERVAL_MS = 10_000;

const resetTimer = setInterval(() => histogram.reset(), RESET_INTERVAL_MS);
// The lag monitor must never be the reason the process stays alive.
resetTimer.unref();

/**
 * Read the event-loop delay observed since the last periodic reset.
 *
 * `monitorEventLoopDelay` records nanoseconds; the values are converted to
 * milliseconds here so callers (and log readers) work in the same unit as the
 * request timings they sit next to.
 *
 * @returns `mean` and `max` event-loop delay in milliseconds for the current
 *   {@link RESET_INTERVAL_MS} window. Both are `0` before the loop has ticked.
 */
export function readEventLoopLagMs(): { mean: number; max: number } {
  // `mean`/`max` are NaN until the histogram has at least one sample.
  const mean = Number.isFinite(histogram.mean) ? histogram.mean / 1e6 : 0;
  const max = Number.isFinite(histogram.max) ? histogram.max / 1e6 : 0;
  return { mean, max };
}
