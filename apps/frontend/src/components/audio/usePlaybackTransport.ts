/**
 * The player's transport: starting playback on an element with its
 * gesture-synchronous Web Audio setup and startup fade, toggling between play
 * and pause, and the three seeks.
 */
import { type ActionDispatch, type RefObject, useCallback, useRef } from "react";
import { AudioStatus, type AudioStatus as AudioStatusType } from "@/components/audio/AudioStatus";
import { muteForStartup, rampUpFromStartup } from "@/components/audio/audioFades";
import { resolveSeekTarget, SEEK_END_GUARD_SECONDS } from "@/components/audio/audioSeek";
import {
  type PlayerAction,
  PlayerActionType,
  PlayerPhase,
  type PlayerState,
  resolveAudioDuration,
  resolveAudioProgressRatio,
} from "@/components/audio/playerStateMachine";
import { clearSpectrumFrame } from "@/components/audio/spectrumStore";
import type { AudioGraph } from "@/components/audio/useAudioGraph";
import type { PlaybackProgress } from "@/components/audio/usePlaybackProgress";
import type { SpectrumLoop } from "@/components/audio/useSpectrumLoop";
import { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";
import { PreviewSignal, sendMusicSignal } from "@/lib/analytics/umami";

/**
 * What the transport reads and drives. The graph, loop and progress callbacks
 * are the ones `useAudioGraph`, `useSpectrumLoop` and `usePlaybackProgress`
 * return, documented there.
 */
export interface PlaybackTransportOptions
  extends Pick<AudioGraph, "audioContextRef" | "gainNodeRef" | "ensureSpectrumAnalyzer">,
    Pick<SpectrumLoop, "resetPeakHold" | "startSpectrumLoop" | "stopSpectrumLoop" | "startSpectrumFadeOut">,
    Pick<PlaybackProgress, "setProgressRatioValue" | "startProgressLoop" | "stopProgressLoop" | "stopProgressRewind"> {
  /** The player's current phase. Toggling and seeking depend on it. */
  phase: PlayerState["phase"];
  /** The player reducer's dispatch. */
  dispatch: ActionDispatch<[action: PlayerAction]>;
  /** The current audio element. */
  audioRef: RefObject<HTMLAudioElement | null>;
  /** Reports a status change to the host. */
  notifyStatusChange: (status: AudioStatusType) => void;
  /** Tells the host that the user started playback. */
  notifyPlaybackIntent: () => void;
  /** The host's seek hint callback, fired after an arrow seek. */
  onSeekHint?: (direction: VfdScrollOutDirection) => void;
}

/** The transport's stable callbacks. */
export interface PlaybackTransport {
  /** Starts playback on an element. The source switch calls it to continue on a fresh element. */
  beginPlayback: (audio: HTMLAudioElement) => void;
  /** Plays from idle or paused, and pauses while playing. */
  togglePlay: () => void;
  /** Seeks by a signed number of seconds and fires the seek hint. */
  seekBy: (deltaSeconds: number) => void;
  /** Jumps to the start without a hint. */
  seekToStart: () => void;
  /** Jumps to `SEEK_END_GUARD_SECONDS` before the end without a hint. */
  seekToNearEnd: () => void;
}

/**
 * Owns the transport of one player. Every ref and `dispatch` in a dependency
 * list is stable, so each callback changes only when the phase or a callback
 * it lists changes.
 *
 * @param options - {@link PlaybackTransportOptions}.
 * @returns The transport's stable callbacks.
 */
export function usePlaybackTransport({
  phase,
  dispatch,
  audioRef,
  audioContextRef,
  gainNodeRef,
  ensureSpectrumAnalyzer,
  resetPeakHold,
  startSpectrumLoop,
  stopSpectrumLoop,
  startSpectrumFadeOut,
  setProgressRatioValue,
  startProgressLoop,
  stopProgressLoop,
  stopProgressRewind,
  notifyStatusChange,
  notifyPlaybackIntent,
  onSeekHint,
}: PlaybackTransportOptions): PlaybackTransport {
  const hasStartedRef = useRef(false);

  // Starts playback on the given element: the load-bearing gesture-synchronous
  // AudioContext/gain setup, then audio.play() with the startup fade. Extracted
  // from togglePlay so a same-album source switch can continue playback on the
  // same element (see the source effect in `useAudioSource`).
  const beginPlayback = useCallback(
    (audio: HTMLAudioElement) => {
      stopProgressRewind();
      stopSpectrumLoop({ clearBands: false });
      audio.muted = false;
      audio.volume = 1;

      // Order is load-bearing. `ensureSpectrumAnalyzer` performs all AudioContext
      // setup synchronously and fires `resume()` on the same tick, BEFORE
      // `audio.play()`, so the operations share the play button's user-gesture
      // activation (a resume() racing play()'s resolution can leave the context
      // suspended and the analyser dark while playback continues).
      const spectrumReadyPromise = ensureSpectrumAnalyzer(audio);

      // Mute the WebAudio gain synchronously before play() so the first decoded
      // samples hit the speaker at zero amplitude; the ramp back to unity below
      // fades the audio in over the startup window instead of slamming on. This
      // kills the startup click a brand-new track produces (MP3 decoder warmup +
      // MediaElementSource route engaging). Resuming a paused track is skipped
      // (hasStartedRef) because the audio path is already warm.
      const isFirstPlay = !hasStartedRef.current;
      const startupGainNode = gainNodeRef.current;
      const startupAudioContext = audioContextRef.current;
      if (isFirstPlay && startupGainNode && startupAudioContext) {
        muteForStartup(startupGainNode, startupAudioContext);
      }

      notifyPlaybackIntent();
      // A play() still pending when its element is switched out settles for a
      // source that is gone, because the switch pauses and empties the element
      // and that rejects the promise. The player's phase belongs to the current
      // element, so both outcomes are dropped for any other one.
      audio
        .play()
        .then(() => {
          if (audioRef.current !== audio) return;
          sendMusicSignal(hasStartedRef.current ? PreviewSignal.Resumed : PreviewSignal.Started);
          dispatch({ type: PlayerActionType.Play });
          notifyStatusChange(AudioStatus.Playing);
          hasStartedRef.current = true;
          startProgressLoop(audio);

          // Sample-accurate ramp back up to unity. Re-read the refs in case
          // `ensureSpectrumAnalyzer` rebuilt the pipeline between the mute above
          // and this resolution.
          const rampGainNode = gainNodeRef.current;
          const rampAudioContext = audioContextRef.current;
          if (isFirstPlay && rampGainNode && rampAudioContext) {
            rampUpFromStartup(rampGainNode, rampAudioContext);
          }

          void spectrumReadyPromise
            .then((isAnalyzerReady) => {
              if (isAnalyzerReady && !audio.paused) startSpectrumLoop();
            })
            .catch(() => {
              clearSpectrumFrame();
              resetPeakHold();
            });
        })
        .catch(() => {
          if (audioRef.current !== audio) return;
          sendMusicSignal(PreviewSignal.Error);
          notifyStatusChange(AudioStatus.Unavailable);
          dispatch({ type: PlayerActionType.Error });
        });
    },
    [
      ensureSpectrumAnalyzer,
      notifyPlaybackIntent,
      notifyStatusChange,
      resetPeakHold,
      startProgressLoop,
      startSpectrumLoop,
      stopProgressRewind,
      stopSpectrumLoop,
      audioContextRef,
      gainNodeRef,
      audioRef,
      dispatch,
    ],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (phase === PlayerPhase.Idle || phase === PlayerPhase.Paused) {
      beginPlayback(audio);
    } else if (phase === PlayerPhase.Playing) {
      audio.pause();
      stopProgressLoop(audio);
      startSpectrumFadeOut();
      sendMusicSignal(PreviewSignal.Paused);
      notifyStatusChange(AudioStatus.Paused);
      dispatch({ type: PlayerActionType.Pause });
    }
  }, [beginPlayback, notifyStatusChange, startSpectrumFadeOut, phase, stopProgressLoop, audioRef, dispatch]);

  const notifySeekHint = useCallback(
    (direction: VfdScrollOutDirection) => {
      onSeekHint?.(direction);
    },
    [onSeekHint],
  );

  /**
   * Seeks the audio by a signed delta (arrow-key step). No-op when the player
   * is not in `Playing` or `Paused` phase. Clamps to `0 … duration`. Fires
   * `onSeekHint` so the host can flash a VFD direction hint.
   *
   * @param deltaSeconds - Signed offset in seconds (negative = rewind).
   */
  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (phase !== PlayerPhase.Playing && phase !== PlayerPhase.Paused) return;
      const dur = resolveAudioDuration(audio);
      audio.currentTime = resolveSeekTarget(audio.currentTime, deltaSeconds, dur);
      setProgressRatioValue(resolveAudioProgressRatio(audio));
      notifySeekHint(deltaSeconds < 0 ? VfdScrollOutDirection.Left : VfdScrollOutDirection.Right);
    },
    [phase, notifySeekHint, setProgressRatioValue, audioRef],
  );

  /**
   * Jumps to the track start (cmd+Left). No-op unless active.
   * Does not fire `onSeekHint`, because the jump is silent per product spec.
   */
  const seekToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (phase !== PlayerPhase.Playing && phase !== PlayerPhase.Paused) return;
    audio.currentTime = 0;
    setProgressRatioValue(resolveAudioProgressRatio(audio));
  }, [phase, setProgressRatioValue, audioRef]);

  /**
   * Jumps to `SEEK_END_GUARD_SECONDS` before the end (cmd+Right). No-op unless
   * active. Does not fire `onSeekHint`, because the jump is silent per product spec.
   */
  const seekToNearEnd = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (phase !== PlayerPhase.Playing && phase !== PlayerPhase.Paused) return;
    const dur = resolveAudioDuration(audio);
    audio.currentTime = Math.max(0, dur - SEEK_END_GUARD_SECONDS);
    setProgressRatioValue(resolveAudioProgressRatio(audio));
  }, [phase, setProgressRatioValue, audioRef]);

  return { beginPlayback, togglePlay, seekBy, seekToStart, seekToNearEnd };
}
