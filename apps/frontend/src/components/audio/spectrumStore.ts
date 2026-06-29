/**
 * Module-scope store for the audio preview's per-frame visualisation data
 * (plan MC-029 Task 5.1).
 *
 * The AudioPlayer produces a new spectrum/level frame every
 * `SPECTRUM_UPDATE_MS` (50 ms) while a preview plays. Routing that through
 * React state forced a component re-render on every tick — the dominant
 * 50 ms-cadence commit source on the share page. This store carries the
 * frame INSTEAD: the producer mutates pre-allocated `Float32Array` buffers
 * in place (policy 7 — zero allocation in the frame loop, no GC pressure)
 * and `publishSpectrumFrame()` notifies subscribers so the VFD renderer can
 * repaint imperatively, off the React commit path.
 *
 * The pattern mirrors {@link ../playback/analyzerMode} (module `let` + a
 * `Set` of subscribers), but the payload lives in shared typed arrays rather
 * than a React-friendly value, because it changes 20× per second.
 */

/**
 * Per-channel frequency band count. Mirrors `SPECTRUM_CHANNEL_BAND_COUNT`
 * in {@link AudioPlayer}; the producer fills exactly this many bands
 * per channel.
 */
export const SPECTRUM_STORE_BAND_COUNT = 13;

/**
 * The shared, mutable visualisation frame. All four buffers are allocated
 * once and mutated in place for the lifetime of the module — readers must
 * treat them as a live view, not a snapshot, and copy out anything they need
 * to retain past the current frame.
 */
export interface SpectrumFrame {
  /** Left-channel band levels (0..1), length {@link SPECTRUM_STORE_BAND_COUNT}. */
  readonly leftBands: Float32Array;
  /** Right-channel band levels (0..1), length {@link SPECTRUM_STORE_BAND_COUNT}. */
  readonly rightBands: Float32Array;
  /** Smoothed per-channel VU level `[left, right]` (0..1). */
  readonly levels: Float32Array;
  /** Per-channel peak-hold level `[left, right]` (0..1). */
  readonly peakHold: Float32Array;
}

const frame: SpectrumFrame = {
  leftBands: new Float32Array(SPECTRUM_STORE_BAND_COUNT),
  rightBands: new Float32Array(SPECTRUM_STORE_BAND_COUNT),
  levels: new Float32Array(2),
  peakHold: new Float32Array(2),
};

let active = false;
const subscribers = new Set<() => void>();

/**
 * Returns the live visualisation frame. The returned buffers are mutated in
 * place by the producer — read them inside a draw callback, never cache the
 * values across frames.
 */
export function getSpectrumFrame(): SpectrumFrame {
  return frame;
}

/** True while a published frame is current (set by publish, cleared by clear). */
export function isSpectrumActive(): boolean {
  return active;
}

/**
 * Copies one channel's band levels into a fixed-width destination buffer,
 * never reading past the destination's capacity.
 *
 * @param source - Producer band values (may be longer than the channel width).
 * @param destination - Pre-allocated store buffer to fill in place.
 */
function copyBands(source: readonly number[], destination: Float32Array): void {
  const count = Math.min(source.length, destination.length);
  for (let index = 0; index < count; index += 1) {
    destination[index] = source[index] ?? 0;
  }
}

/**
 * Writes both channels' band levels into the store in place. Excess source
 * entries beyond {@link SPECTRUM_STORE_BAND_COUNT} are ignored; does not
 * notify (call {@link publishSpectrumFrame} once the whole frame is written).
 *
 * @param left - Left-channel band values.
 * @param right - Right-channel band values.
 */
export function writeSpectrumBands(left: readonly number[], right: readonly number[]): void {
  copyBands(left, frame.leftBands);
  copyBands(right, frame.rightBands);
}

/**
 * Writes the smoothed per-channel VU levels in place. Does not notify.
 *
 * @param left - Left-channel level (0..1).
 * @param right - Right-channel level (0..1).
 */
export function writeSpectrumLevels(left: number, right: number): void {
  frame.levels[0] = left;
  frame.levels[1] = right;
}

/**
 * Writes the per-channel peak-hold levels in place. Does not notify.
 *
 * @param left - Left-channel peak hold (0..1).
 * @param right - Right-channel peak hold (0..1).
 */
export function writeSpectrumPeakHold(left: number, right: number): void {
  frame.peakHold[0] = left;
  frame.peakHold[1] = right;
}

/**
 * Marks the store as active and notifies every subscriber that a fresh frame
 * is ready to render. Called once per producer tick after the band/level/
 * peak-hold buffers have been filled.
 */
export function publishSpectrumFrame(): void {
  active = true;
  for (const subscriber of subscribers) subscriber();
}

/**
 * Zeros every buffer, marks the store inactive and notifies subscribers so
 * the renderer can paint the empty state. Called when playback stops or the
 * analyser can no longer deliver samples.
 */
export function clearSpectrumFrame(): void {
  frame.leftBands.fill(0);
  frame.rightBands.fill(0);
  frame.levels.fill(0);
  frame.peakHold.fill(0);
  active = false;
  for (const subscriber of subscribers) subscriber();
}

/**
 * Subscribes to frame publishes and clears. The callback fires after the
 * buffers have been updated, so it can read {@link getSpectrumFrame} directly.
 *
 * @param subscriber - Invoked on every publish/clear (no arguments).
 * @returns An unsubscribe function for effect cleanup.
 */
export function subscribeSpectrum(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
