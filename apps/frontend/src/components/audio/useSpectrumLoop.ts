/**
 * The spectrum analyzer's animation loop: the tick that reads both analysers
 * into the spectrum store while audio plays, the fade-out that eases bands,
 * levels and peak holds back to zero after playback stops, and the watchdog
 * that restarts a stalled loop.
 */
import gsap from "gsap";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { StereoSpectrumAnalysers, StereoSpectrumData } from "@/components/audio/audioGraph";
import { AudioContextState, PlayerPhase, type PlayerState } from "@/components/audio/playerStateMachine";
import {
  advancePeakHold,
  decayPeakHoldChannel,
  decayStereoLevel,
  fadeBandValue,
  resolveSpectrumBandsInto,
  resolveStereoLevel,
  resolveTimeDomainRms,
  SPECTRUM_CHANNEL_BAND_COUNT,
  SPECTRUM_RECOVERY_CHECK_MS,
  SPECTRUM_UPDATE_MS,
  type StereoPeakHoldState,
} from "@/components/audio/spectrumAnalysis";
import {
  clearSpectrumFrame,
  getSpectrumFrame,
  isSpectrumActive,
  publishSpectrumFrame,
  writeSpectrumLevels,
  writeSpectrumPeakHold,
} from "@/components/audio/spectrumStore";

/** The spectrum loop's refs and its stable control callbacks. */
export interface SpectrumLoop {
  /** The analysers the loop reads. `useAudioGraph` fills it when it builds a graph and nulls it on release. */
  analysersRef: RefObject<StereoSpectrumAnalysers | null>;
  /** The byte buffers the loop reads into. `useAudioGraph` allocates them with the analysers. */
  spectrumDataRef: RefObject<StereoSpectrumData | null>;
  /** The registered ticker callback of the running loop or fade-out, or null when neither runs. */
  spectrumTickRef: RefObject<(() => void) | null>;
  /** Clears both channels' peak hold state. */
  resetPeakHold: () => void;
  /** Stops the loop or fade-out. Unless `clearBands` is false, it also clears the store and the peak holds. */
  stopSpectrumLoop: (options?: { clearBands?: boolean }) => void;
  /** Replaces the loop with a fade-out that decays everything shown to zero, then clears the store. */
  startSpectrumFadeOut: () => void;
  /** Starts the analyser loop unless it already runs or no analysers exist. */
  startSpectrumLoop: () => void;
}

/**
 * Owns the spectrum loop of one player. Frame loops run on the shared
 * `gsap.ticker` (plan MC-029 Task 5.3, policy 3), which means there is no
 * private requestAnimationFrame source. `spectrumTickRef` holds the registered
 * ticker callback so the matching stop can remove it, and null means "not
 * running".
 *
 * @returns The loop's refs and its stable control callbacks.
 */
export function useSpectrumLoop(): SpectrumLoop {
  const analysersRef = useRef<StereoSpectrumAnalysers | null>(null);
  const spectrumTickRef = useRef<(() => void) | null>(null);
  const spectrumDataRef = useRef<StereoSpectrumData | null>(null);
  const spectrumLastUpdateRef = useRef(0);
  // Peak-hold timing state stays local (the store only carries the resulting
  // level, not the per-channel hold timestamp). Bands/levels/peak-hold levels
  // live in the spectrum store and are written in place each tick (Task 5.1).
  const peakHoldLeftRef = useRef<StereoPeakHoldState>({ level: 0, setAt: 0 });
  const peakHoldRightRef = useRef<StereoPeakHoldState>({ level: 0, setAt: 0 });

  const resetPeakHold = useCallback(() => {
    peakHoldLeftRef.current = { level: 0, setAt: 0 };
    peakHoldRightRef.current = { level: 0, setAt: 0 };
  }, []);

  const stopSpectrumLoop = useCallback(
    ({ clearBands = true }: { clearBands?: boolean } = {}) => {
      if (spectrumTickRef.current) gsap.ticker.remove(spectrumTickRef.current);
      spectrumTickRef.current = null;
      spectrumLastUpdateRef.current = 0;
      if (!clearBands) return;
      clearSpectrumFrame();
      resetPeakHold();
    },
    [resetPeakHold],
  );

  const startSpectrumFadeOut = useCallback(() => {
    stopSpectrumLoop({ clearBands: false });
    if (!isSpectrumActive()) return;
    const frame = getSpectrumFrame();

    const tick = () => {
      const now = performance.now();
      if (now - spectrumLastUpdateRef.current < SPECTRUM_UPDATE_MS) return;
      spectrumLastUpdateRef.current = now;

      // Decay every band toward zero in place (no allocation per fade tick).
      let bandsStillVisible = false;
      for (let band = 0; band < frame.leftBands.length; band += 1) {
        const left = fadeBandValue(frame.leftBands[band] ?? 0);
        const right = fadeBandValue(frame.rightBands[band] ?? 0);
        frame.leftBands[band] = left;
        frame.rightBands[band] = right;
        if (left > 0 || right > 0) bandsStillVisible = true;
      }
      const nextLeftLevel = decayStereoLevel(frame.levels[0] ?? 0);
      const nextRightLevel = decayStereoLevel(frame.levels[1] ?? 0);
      writeSpectrumLevels(nextLeftLevel, nextRightLevel);
      const nextLeftHold = decayPeakHoldChannel(peakHoldLeftRef.current);
      const nextRightHold = decayPeakHoldChannel(peakHoldRightRef.current);
      peakHoldLeftRef.current = nextLeftHold;
      peakHoldRightRef.current = nextRightHold;
      writeSpectrumPeakHold(nextLeftHold.level, nextRightHold.level);
      publishSpectrumFrame();

      const levelsStillVisible = nextLeftLevel > 0 || nextRightLevel > 0;
      const peakHoldStillVisible = nextLeftHold.level > 0 || nextRightHold.level > 0;
      if (bandsStillVisible || levelsStillVisible || peakHoldStillVisible) return;
      gsap.ticker.remove(tick);
      spectrumTickRef.current = null;
      clearSpectrumFrame();
      resetPeakHold();
    };

    spectrumTickRef.current = tick;
    gsap.ticker.add(tick);
  }, [resetPeakHold, stopSpectrumLoop]);

  const startSpectrumLoop = useCallback(() => {
    const analysers = analysersRef.current;
    if (!analysers || spectrumTickRef.current !== null) return;

    const data: StereoSpectrumData = spectrumDataRef.current ?? {
      left: new Uint8Array(analysers.left.frequencyBinCount),
      right: new Uint8Array(analysers.right.frequencyBinCount),
      leftTime: new Uint8Array(analysers.left.fftSize),
      rightTime: new Uint8Array(analysers.right.fftSize),
    };
    spectrumDataRef.current = data;
    const frame = getSpectrumFrame();

    const tick = () => {
      const now = performance.now();
      if (now - spectrumLastUpdateRef.current < SPECTRUM_UPDATE_MS) return;
      spectrumLastUpdateRef.current = now;
      analysers.left.getByteFrequencyData(data.left);
      analysers.right.getByteFrequencyData(data.right);
      analysers.left.getByteTimeDomainData(data.leftTime);
      analysers.right.getByteTimeDomainData(data.rightTime);
      // Bands straight into the store buffers (zero allocation per tick).
      resolveSpectrumBandsInto(data.left, SPECTRUM_CHANNEL_BAND_COUNT, frame.leftBands);
      resolveSpectrumBandsInto(data.right, SPECTRUM_CHANNEL_BAND_COUNT, frame.rightBands);
      // Smoothed levels. The previous value is the store's last write.
      const nextLeftLevel = resolveStereoLevel(resolveTimeDomainRms(data.leftTime), frame.levels[0] ?? 0);
      const nextRightLevel = resolveStereoLevel(resolveTimeDomainRms(data.rightTime), frame.levels[1] ?? 0);
      writeSpectrumLevels(nextLeftLevel, nextRightLevel);

      const nextLeftHold = advancePeakHold(peakHoldLeftRef.current, nextLeftLevel, now);
      const nextRightHold = advancePeakHold(peakHoldRightRef.current, nextRightLevel, now);
      peakHoldLeftRef.current = nextLeftHold;
      peakHoldRightRef.current = nextRightHold;
      writeSpectrumPeakHold(nextLeftHold.level, nextRightHold.level);
      publishSpectrumFrame();
    };

    spectrumTickRef.current = tick;
    gsap.ticker.add(tick);
  }, []);

  return {
    analysersRef,
    spectrumDataRef,
    spectrumTickRef,
    resetPeakHold,
    stopSpectrumLoop,
    startSpectrumFadeOut,
    startSpectrumLoop,
  };
}

/** What the spectrum watchdog reads. */
export interface SpectrumWatchdogOptions {
  /** The player's current phase. The watchdog runs only while it is `playing`. */
  phase: PlayerState["phase"];
  /** The current audio element. */
  audioRef: RefObject<HTMLAudioElement | null>;
  /** The analysers of the current graph, from {@link useSpectrumLoop}. */
  analysersRef: RefObject<StereoSpectrumAnalysers | null>;
  /** The shared audio context, from `useAudioGraph`. */
  audioContextRef: RefObject<AudioContext | null>;
  /** The running loop's ticker callback, from {@link useSpectrumLoop}. */
  spectrumTickRef: RefObject<(() => void) | null>;
  /** Starts the spectrum loop, from {@link useSpectrumLoop}. */
  startSpectrumLoop: () => void;
}

/**
 * Watchdog for the spectrum render loop while playback is active. The
 * initial wire-up happens synchronously inside togglePlay (so the user
 * gesture window is honoured), and the AudioContext's `onstatechange`
 * handler restarts the loop whenever the context flips back to `running`.
 * This watchdog only covers the narrower case where the rAF loop stopped
 * without a matching state-change event, such as after `stopSpectrumLoop`
 * was invoked while the player is still in the `playing` phase. Calling
 * `ensureSpectrumAnalyzer` from here would not help: at this point we are
 * far outside the original user gesture, so `audioContext.resume()` would
 * silently leave a suspended context untouched.
 *
 * Every ref in the dependency list is a stable ref object, so the effect
 * reruns only when `phase` or `startSpectrumLoop` changes.
 *
 * @param options - {@link SpectrumWatchdogOptions}.
 */
export function useSpectrumWatchdog({
  phase,
  audioRef,
  analysersRef,
  audioContextRef,
  spectrumTickRef,
  startSpectrumLoop,
}: SpectrumWatchdogOptions): void {
  useEffect(() => {
    if (phase !== PlayerPhase.Playing) return;
    const audio = audioRef.current;
    if (!audio) return;

    const recoverSpectrum = () => {
      if (audio.paused || audio.ended) return;
      if (!analysersRef.current) return;
      if (audioContextRef.current?.state !== AudioContextState.Running) return;
      if (spectrumTickRef.current !== null) return;
      startSpectrumLoop();
    };

    // No immediate call: the spectrum loop is started directly from
    // togglePlay after the user click, before this effect runs. The
    // watchdog only needs to cover after-the-fact rAF stalls, which is
    // exactly what the periodic interval handles. (Triggering a
    // state-mutating helper here at mount also trips React Doctor's
    // no-adjust-state-on-prop-change rule.)
    const recoveryTimer = window.setInterval(recoverSpectrum, SPECTRUM_RECOVERY_CHECK_MS);
    return () => window.clearInterval(recoveryTimer);
  }, [startSpectrumLoop, phase, audioRef, analysersRef, audioContextRef, spectrumTickRef]);
}
