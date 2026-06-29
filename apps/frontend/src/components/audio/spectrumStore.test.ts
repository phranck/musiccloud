import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSpectrumFrame,
  getSpectrumFrame,
  isSpectrumActive,
  publishSpectrumFrame,
  SPECTRUM_STORE_BAND_COUNT,
  subscribeSpectrum,
  writeSpectrumBands,
  writeSpectrumLevels,
  writeSpectrumPeakHold,
} from "./spectrumStore";

/**
 * Contract of the module-scope spectrum store (plan MC-029 Task 5.1) — the
 * single channel that carries 50 ms audio-visualisation frames from the
 * AudioPlayer to the VFD renderer WITHOUT React state. Two properties
 * matter: every frame mutates the SAME pre-allocated Float32Array buffers
 * (no per-tick allocation → no GC pressure, policy 7), and a publish/clear
 * notifies subscribers so the renderer can repaint without a React commit.
 */

afterEach(() => {
  // Reset shared module state so tests don't leak frames into one another.
  clearSpectrumFrame();
});

describe("spectrumStore", () => {
  it("exposes pre-allocated stereo band buffers of the fixed channel width", () => {
    const frame = getSpectrumFrame();
    expect(frame.leftBands).toBeInstanceOf(Float32Array);
    expect(frame.rightBands).toBeInstanceOf(Float32Array);
    expect(frame.leftBands).toHaveLength(SPECTRUM_STORE_BAND_COUNT);
    expect(frame.rightBands).toHaveLength(SPECTRUM_STORE_BAND_COUNT);
    expect(frame.levels).toHaveLength(2);
    expect(frame.peakHold).toHaveLength(2);
  });

  it("writes bands in place without ever swapping the buffer reference", () => {
    const before = getSpectrumFrame();
    const leftRef = before.leftBands;
    const rightRef = before.rightBands;

    writeSpectrumBands([1, 0.5], [0.25, 0.75]);
    const after = getSpectrumFrame();

    // Same backing arrays — the producer mutated, it did not allocate.
    expect(after.leftBands).toBe(leftRef);
    expect(after.rightBands).toBe(rightRef);
    expect(after.leftBands[0]).toBe(1);
    expect(after.leftBands[1]).toBe(0.5);
    expect(after.rightBands[0]).toBe(0.25);
    expect(after.rightBands[1]).toBe(0.75);
  });

  it("writes levels and peak hold in place", () => {
    const frame = getSpectrumFrame();
    const levelsRef = frame.levels;
    const peakRef = frame.peakHold;

    // Float32-exact values (negative powers of two) so the assertion checks
    // the in-place write, not float64→float32 rounding.
    writeSpectrumLevels(0.5, 0.25);
    writeSpectrumPeakHold(0.75, 0.125);

    expect(frame.levels).toBe(levelsRef);
    expect(frame.peakHold).toBe(peakRef);
    expect([frame.levels[0], frame.levels[1]]).toEqual([0.5, 0.25]);
    expect([frame.peakHold[0], frame.peakHold[1]]).toEqual([0.75, 0.125]);
  });

  it("notifies subscribers on publish and reports the store as active", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSpectrum(listener);

    expect(isSpectrumActive()).toBe(false);
    writeSpectrumLevels(0.5, 0.5);
    publishSpectrumFrame();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(isSpectrumActive()).toBe(true);
    unsubscribe();
  });

  it("zeros every buffer and deactivates on clear, notifying once", () => {
    writeSpectrumBands([1, 1], [1, 1]);
    writeSpectrumLevels(1, 1);
    writeSpectrumPeakHold(1, 1);
    publishSpectrumFrame();

    const listener = vi.fn();
    const unsubscribe = subscribeSpectrum(listener);
    clearSpectrumFrame();

    const frame = getSpectrumFrame();
    expect(Array.from(frame.leftBands).every((value) => value === 0)).toBe(true);
    expect(Array.from(frame.rightBands).every((value) => value === 0)).toBe(true);
    expect([frame.levels[0], frame.levels[1]]).toEqual([0, 0]);
    expect([frame.peakHold[0], frame.peakHold[1]]).toEqual([0, 0]);
    expect(isSpectrumActive()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSpectrum(listener);
    unsubscribe();

    publishSpectrumFrame();
    expect(listener).not.toHaveBeenCalled();
  });

  it("copies at most the channel width when given an oversized source", () => {
    const oversized = Array.from({ length: SPECTRUM_STORE_BAND_COUNT + 5 }, (_, i) => i);
    writeSpectrumBands(oversized, oversized);
    const frame = getSpectrumFrame();
    expect(frame.leftBands).toHaveLength(SPECTRUM_STORE_BAND_COUNT);
    // Last in-range value made it; the overflow tail was ignored.
    expect(frame.leftBands[SPECTRUM_STORE_BAND_COUNT - 1]).toBe(SPECTRUM_STORE_BAND_COUNT - 1);
  });
});
