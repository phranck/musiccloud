/**
 * The player's progress bar state: the quantized progress ratio, the loop
 * that samples it from the audio element while playing, and the animated
 * rewind to zero after a track ends.
 */
import gsap from "gsap";
import { useCallback, useRef, useState } from "react";
import { resolveAudioProgressRatio } from "@/components/audio/playerStateMachine";
import { quantizeProgressRatio } from "@/components/audio/progressQuantize";

/** Duration in milliseconds of the progress bar's animated rewind to zero after a track ends. */
const PLAYER_PROGRESS_REWIND_MS = 420;

/** The progress state and the callbacks that drive it. Every callback is stable across renders. */
export interface PlaybackProgress {
  /** The quantized playback position on the `0 … 1` scale, the only React state progress feeds. */
  progressRatio: number;
  /** Quantizes a ratio and writes it to `progressRatio` when the quantized value changed. */
  setProgressRatioValue: (ratio: number) => void;
  /** Stops the sampling loop and, when given an element, writes its final ratio. */
  stopProgressLoop: (audio?: HTMLAudioElement | null) => void;
  /** Samples the element's ratio on every ticker frame until it pauses or ends. */
  startProgressLoop: (audio: HTMLAudioElement) => void;
  /** Stops a running rewind animation. */
  stopProgressRewind: () => void;
  /** Animates the ratio from its current value back to zero over `PLAYER_PROGRESS_REWIND_MS`. */
  startProgressRewind: () => void;
}

/**
 * Owns the progress bar state of one player. Both loops run on the shared
 * `gsap.ticker`, and each ref holds its registered ticker callback so the
 * matching stop can remove it. A null ref means the loop is not running.
 *
 * @returns The progress ratio and its stable control callbacks.
 */
export function usePlaybackProgress(): PlaybackProgress {
  const progressTickRef = useRef<(() => void) | null>(null);
  const progressRewindTickRef = useRef<(() => void) | null>(null);
  const progressRatioRef = useRef(0);
  // REGRESSION GUARD: do not defeat the quantize. This is the only React state the
  // playback progress feeds, and it is sampled on the shared 60 Hz ticker
  // (startProgressLoop). It MUST only ever be written through setProgressRatioValue,
  // which snaps the ratio to a coarse grid (quantizeProgressRatio) and dedups it.
  // Writing raw per-frame values here re-renders the ENTIRE player subtree 60 times a
  // second and starves hover/transition paints, which makes everything lag and stutter
  // while a song plays. The analyzer stays smooth through it all because it bypasses
  // React via the imperative spectrumStore. Finer progress belongs in an imperative
  // store like spectrumStore, and the quantize stays.
  const [progressRatio, setProgressRatio] = useState(0);

  const setProgressRatioValue = useCallback((ratio: number) => {
    // Snap to the progress grid so the shared 60 Hz ticker only flips React state
    // when the bar visibly moves (~a few Hz), not every frame. The raw 60 Hz churn
    // re-rendered the whole player subtree and starved hover/transition paints.
    const nextRatio = quantizeProgressRatio(ratio);
    if (progressRatioRef.current === nextRatio) return;
    progressRatioRef.current = nextRatio;
    setProgressRatio(nextRatio);
  }, []);

  const stopProgressRewind = useCallback(() => {
    if (progressRewindTickRef.current) gsap.ticker.remove(progressRewindTickRef.current);
    progressRewindTickRef.current = null;
  }, []);

  const stopProgressLoop = useCallback(
    (audio?: HTMLAudioElement | null) => {
      if (progressTickRef.current) gsap.ticker.remove(progressTickRef.current);
      progressTickRef.current = null;
      if (audio) setProgressRatioValue(resolveAudioProgressRatio(audio));
    },
    [setProgressRatioValue],
  );

  const startProgressRewind = useCallback(() => {
    stopProgressRewind();
    const startRatio = progressRatioRef.current;
    if (startRatio <= 0) {
      setProgressRatioValue(0);
      return;
    }

    let startedAt: number | null = null;
    const tick = () => {
      const now = performance.now();
      if (startedAt === null) startedAt = now;
      const elapsedRatio = Math.min(1, (now - startedAt) / PLAYER_PROGRESS_REWIND_MS);
      setProgressRatioValue(startRatio * (1 - elapsedRatio));
      if (elapsedRatio < 1) return;
      gsap.ticker.remove(tick);
      progressRewindTickRef.current = null;
      setProgressRatioValue(0);
    };

    progressRewindTickRef.current = tick;
    gsap.ticker.add(tick);
  }, [setProgressRatioValue, stopProgressRewind]);

  const startProgressLoop = useCallback(
    (audio: HTMLAudioElement) => {
      stopProgressLoop();
      // Runs on the shared 60 Hz ticker. Sampling every frame is fine ONLY because
      // setProgressRatioValue quantizes + dedups before touching React state (see the
      // regression guard on the progressRatio state); it re-renders on a visible step,
      // not per frame.
      const tick = () => {
        setProgressRatioValue(resolveAudioProgressRatio(audio));
        if (audio.paused || audio.ended) {
          gsap.ticker.remove(tick);
          progressTickRef.current = null;
        }
      };
      progressTickRef.current = tick;
      gsap.ticker.add(tick);
    },
    [setProgressRatioValue, stopProgressLoop],
  );

  return {
    progressRatio,
    setProgressRatioValue,
    stopProgressLoop,
    startProgressLoop,
    stopProgressRewind,
    startProgressRewind,
  };
}
