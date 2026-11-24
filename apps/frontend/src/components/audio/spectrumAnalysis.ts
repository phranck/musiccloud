/**
 * The signal math behind the player's spectrum analyzer and stereo VU meter:
 * the tuning constants, the band levels derived from FFT bytes, the RMS level
 * derived from time-domain samples, its smoothing and decay, and the peak hold
 * per channel. Nothing here touches Web Audio or React, so every step can be
 * tested with plain buffers and numbers.
 */

/** Number of spectrum bands computed per stereo channel on every analyzer tick. */
export const SPECTRUM_CHANNEL_BAND_COUNT = 13;
/**
 * Minimum time in milliseconds between two spectrum ticks. The ticker runs at
 * frame rate, and a tick that arrives sooner than this returns at once, so the
 * analyzer and the fade-out update at about 20 Hz.
 */
export const SPECTRUM_UPDATE_MS = 50;
/** Factor each band level is multiplied by per fade-out tick after playback stops. */
const SPECTRUM_FADE_FACTOR = 0.68;
/** Band level at or below which a fading band snaps to zero. */
const SPECTRUM_FADE_MIN_LEVEL = 0.03;
/** Number of low bands that receive the steeper dynamic curve in `resolveSpectrumBandsInto`. */
const SPECTRUM_LOW_BAND_COUNT = 4;
/** Interval in milliseconds of the watchdog that restarts a stalled spectrum loop while playing. */
export const SPECTRUM_RECOVERY_CHECK_MS = 700;
/**
 * Per-channel stereo VU normalisation. RMS values for typical music sit in
 * the 0.15..0.45 range; multiplying by 2.4 maps an "average" passage to
 * roughly 0.6..1.0 deflection. Clamped to 1 so brief peaks don't blow out.
 */
const STEREO_LEVEL_INPUT_GAIN = 2.4;
/**
 * Low-pass smoothing for the stereo VU level. Higher = more responsive to
 * peaks, lower = calmer needle. 0.4 hits the classic VU-meter feel: visible
 * transient response without the rapid flicker of raw frame-by-frame RMS.
 */
const STEREO_LEVEL_SMOOTHING = 0.4;
/**
 * Decay factor applied to the stored level when playback pauses or the
 * analyser cannot deliver samples, so the bars ease back to zero instead
 * of snapping off.
 */
export const STEREO_LEVEL_DECAY = 0.5;
/**
 * Time the per-channel peak indicator stays pinned at its last maximum
 * before it starts decaying back toward zero. Classic VU/peak-meter feel:
 * about a second of stand-still so the eye can latch onto transients.
 */
export const STEREO_PEAK_HOLD_MS = 900;
/**
 * Linear decay applied to the held peak (0..1 scale) per spectrum tick
 * once the hold window has elapsed. At a 50ms tick that yields ~0.5/sec,
 * so a full-scale hold falls back to zero in roughly two seconds.
 */
export const STEREO_PEAK_HOLD_DECAY_PER_TICK = 0.025;

/**
 * Per-channel peak hold level (0..1) and the timestamp at which it was last
 * refreshed. The hold value latches at the most recent maximum of the
 * smoothed VU level, stays put for `STEREO_PEAK_HOLD_MS`, then decays back to
 * zero. Drives the standalone "stuck" peak pixel column in the stereo-VU
 * display mode.
 */
export interface StereoPeakHoldState {
  /** Held peak level on the `0 … 1` scale. */
  level: number;
  /** `performance.now()` timestamp in milliseconds at which `level` was last latched. */
  setAt: number;
}

/**
 * The FFT bin range one spectrum band averages. Bands are spaced
 * logarithmically, so low bands cover few bins and high bands cover many. The
 * first two bins are skipped.
 *
 * @param band - Zero-based band index.
 * @param bandCount - Total number of bands.
 * @param usableBins - Number of bins available after the skipped ones.
 * @returns The start bin (inclusive) and end bin (exclusive). The range holds at least one bin.
 */
function resolveSpectrumBandRange(band: number, bandCount: number, usableBins: number): [number, number] {
  const logMax = Math.log(usableBins + 1);
  const start = 2 + Math.floor(Math.exp((band / bandCount) * logMax) - 1);
  const end = 2 + Math.floor(Math.exp(((band + 1) / bandCount) * logMax) - 1);
  return [start, Math.max(start + 1, end)];
}

/**
 * RMS over a time-domain byte buffer (each byte centred at 128 for silence).
 * The result is normalised so a fully silent buffer returns 0 and a
 * full-scale sine wave returns ~0.707.
 *
 * @param timeDomainData - Byte samples from `AnalyserNode.getByteTimeDomainData`.
 * @returns The normalised RMS level, or `0` for an empty buffer.
 */
export function resolveTimeDomainRms(timeDomainData: Uint8Array<ArrayBuffer>): number {
  const sampleCount = timeDomainData.length;
  if (sampleCount === 0) return 0;
  let sumSquares = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = (timeDomainData[index] ?? 128) - 128;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount) / 128;
}

/**
 * The next smoothed VU level for one channel. The RMS is scaled by
 * {@link STEREO_LEVEL_INPUT_GAIN}, clamped to `0 … 1`, and blended into the
 * previous level by {@link STEREO_LEVEL_SMOOTHING}.
 *
 * @param rms - The channel's current RMS from {@link resolveTimeDomainRms}.
 * @param previousLevel - The level written on the previous tick.
 * @returns The smoothed level on the `0 … 1` scale.
 */
export function resolveStereoLevel(rms: number, previousLevel: number): number {
  const normalized = Math.max(0, Math.min(1, rms * STEREO_LEVEL_INPUT_GAIN));
  return previousLevel * (1 - STEREO_LEVEL_SMOOTHING) + normalized * STEREO_LEVEL_SMOOTHING;
}

/**
 * One decay step of a channel's VU level while no samples arrive. The level
 * is multiplied by {@link STEREO_LEVEL_DECAY} and snaps to zero once it falls
 * below `0.005`, so the fade-out loop ends.
 *
 * @param previousLevel - The level written on the previous tick.
 * @returns The decayed level, or `0` once it is below the snap threshold.
 */
export function decayStereoLevel(previousLevel: number): number {
  const next = previousLevel * STEREO_LEVEL_DECAY;
  return next < 0.005 ? 0 : next;
}

/**
 * Advances one channel's peak hold state for the current spectrum tick.
 * The latch snaps to the new level whenever the live signal pushes higher
 * than the held value; otherwise the level stays put until the hold window
 * has elapsed, then decays linearly toward zero.
 *
 * @param state - The channel's hold state from the previous tick.
 * @param currentLevel - The channel's smoothed level on this tick.
 * @param now - The current `performance.now()` timestamp in milliseconds.
 * @returns The next hold state. It is `state` itself while the hold window is still open.
 */
export function advancePeakHold(state: StereoPeakHoldState, currentLevel: number, now: number): StereoPeakHoldState {
  if (currentLevel >= state.level) {
    return { level: currentLevel, setAt: now };
  }
  if (now - state.setAt < STEREO_PEAK_HOLD_MS) {
    return state;
  }
  const decayed = Math.max(currentLevel, state.level - STEREO_PEAK_HOLD_DECAY_PER_TICK);
  return { level: decayed, setAt: state.setAt };
}

/**
 * One decay step of a channel's held peak during the fade-out after playback
 * stops. The level decays like {@link decayStereoLevel}, and the latch
 * timestamp is kept.
 *
 * @param state - The channel's hold state from the previous tick.
 * @returns A new state with the decayed level.
 */
export function decayPeakHoldChannel(state: StereoPeakHoldState): StereoPeakHoldState {
  const next = state.level * STEREO_LEVEL_DECAY;
  return { level: next < 0.005 ? 0 : next, setAt: state.setAt };
}

/**
 * Resolves the per-band levels from raw FFT bytes and writes them in place
 * into `dest`, so a tick allocates nothing. Two passes:
 * fill the raw band levels, then normalise by the frame peak so quiet
 * passages still deflect.
 *
 * @param frequencyData - Raw byte FFT magnitudes for one channel.
 * @param bandCount - Number of bands to fill (must not exceed `dest.length`).
 * @param dest - Pre-allocated band buffer, written in place.
 */
export function resolveSpectrumBandsInto(
  frequencyData: Uint8Array<ArrayBuffer>,
  bandCount: number,
  dest: Float32Array,
): void {
  const usableBins = Math.max(1, frequencyData.length - 2);
  let framePeak = 0;
  for (let band = 0; band < bandCount; band += 1) {
    const [start, end] = resolveSpectrumBandRange(band, bandCount, usableBins);
    let total = 0;
    let count = 0;
    for (let index = start; index < end; index += 1) {
      total += frequencyData[Math.min(frequencyData.length - 1, index)] ?? 0;
      count += 1;
    }

    const position = bandCount <= 1 ? 1 : band / (bandCount - 1);
    const lowBandRatio = Math.max(0, 1 - band / Math.max(1, SPECTRUM_LOW_BAND_COUNT));
    const lowFrequencyDamping = 0.4 + position * 0.82;
    const dynamicCurve = 1.12 + lowBandRatio * 0.38;
    const normalized = Math.max(0, total / Math.max(1, count) / 255 - 0.04) / 0.96;
    const value = normalized ** dynamicCurve * lowFrequencyDamping;
    dest[band] = value;
    if (value > framePeak) framePeak = value;
  }

  const frameGain = framePeak > 0 ? Math.min(1.45, 0.82 / Math.max(framePeak, 0.42)) : 1;
  for (let band = 0; band < bandCount; band += 1) {
    dest[band] = Math.min(1, (dest[band] ?? 0) * frameGain);
  }
}

/**
 * One band's fade-out step. A level at or below {@link SPECTRUM_FADE_MIN_LEVEL}
 * snaps to zero, and any higher level is multiplied by {@link SPECTRUM_FADE_FACTOR}.
 *
 * @param band - The band's current level on the `0 … 1` scale.
 * @returns The faded level.
 */
export function fadeBandValue(band: number): number {
  return band <= SPECTRUM_FADE_MIN_LEVEL ? 0 : band * SPECTRUM_FADE_FACTOR;
}
