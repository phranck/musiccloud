import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSpectrumFrame,
  getSpectrumFrame,
  isSpectrumActive,
  publishSpectrumFrame,
  SPECTRUM_STORE_BAND_COUNT,
  subscribeSpectrum,
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

  it("exposes the same band buffers across reads so the producer can mutate in place", () => {
    const before = getSpectrumFrame();
    const leftRef = before.leftBands;
    const rightRef = before.rightBands;

    // The producer (resolveSpectrumBandsInto in AudioPlayer) writes straight
    // into these exposed buffers; the store never swaps the reference, so a
    // later read sees the mutation on the same backing array.
    before.leftBands[0] = 1;
    before.leftBands[1] = 0.5;
    before.rightBands[0] = 0.25;
    before.rightBands[1] = 0.75;
    const after = getSpectrumFrame();

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
    const populated = getSpectrumFrame();
    populated.leftBands.fill(1);
    populated.rightBands.fill(1);
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
});
