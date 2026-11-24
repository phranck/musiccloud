/**
 * The headless audio preview engine behind `AudioPlayer` and the turntable:
 * the `useAudioController` hook, the props it takes, and the timing constants
 * and time formatting only it uses.
 */
import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { AudioStatus, type AudioStatus as AudioStatusType } from "@/components/audio/AudioStatus";
import { fadeOutForTeardown, muteForStartup, rampUpFromStartup } from "@/components/audio/audioFades";
import { disconnectAudioGraph } from "@/components/audio/audioGraph";
import { registerAudioForKeyboard } from "@/components/audio/audioKeyboardRegistry";
import { resolveSeekTarget, SEEK_END_GUARD_SECONDS } from "@/components/audio/audioSeek";
import {
  AudioContextState,
  MediaSessionAction,
  MediaSessionPlaybackState,
  PlayerActionType,
  PlayerPhase,
  type PlayerState,
  playerReducer,
  resolveAudioDuration,
  resolveAudioProgressRatio,
} from "@/components/audio/playerStateMachine";
import { fetchPreviewUrl } from "@/components/audio/previewSource";
import { clearSpectrumFrame } from "@/components/audio/spectrumStore";
import { useAudioGraph } from "@/components/audio/useAudioGraph";
import { usePlaybackProgress } from "@/components/audio/usePlaybackProgress";
import { useSpectrumLoop, useSpectrumWatchdog } from "@/components/audio/useSpectrumLoop";
import { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";
import { audioCopy } from "@/copy/audio";
import { PreviewSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { prefersReducedMotion, setupMotion } from "@/lib/motion/setup";
import { type MediaKindType, MediaKindValue } from "@/lib/types/media-card";

export interface AudioPlayerProps {
  /** Immediately-playable preview URL. Optional when `refreshShortId` is set. */
  previewUrl?: string;
  /** Short ID used to refresh an expired/missing Deezer preview URL via the
   *  `/api/share-preview/:shortId` proxy. When set without `previewUrl`, the
   *  player mounts in a loading state and fetches on mount. */
  refreshShortId?: string;
  /** Whether the source is a short preview clip (default) or a full track
   *  (CC / Jamendo). Switches the player's wording from "preview" to "song". */
  mediaKind?: MediaKindType;
  trackTitle: string;
  /**
   * Identity of the current record (album-scoped). When it CHANGES across a
   * source switch while playing, playback is NOT auto-continued: the engine
   * reports Ready so the deck coasts to a halt and the record-swap orchestration
   * re-triggers play once the new disc has settled. Unchanged (same album),
   * reduced motion, or omitted (standalone `AudioPlayer`) keeps the seamless
   * continue behaviour.
   */
  recordSwapKey?: string;
  /**
   * Holds the transport while the host is still putting the view together,
   * such as while the artist data loads: the play button is disabled, and the
   * spacebar and media keys do nothing. Calls to `togglePlay` itself still run,
   * because the turntable's restart after a record swap goes through it and is
   * part of the swap rather than an input. Unlike `isDisabled`, it leaves the
   * time display and the analyzer alone, since a record may still be playing.
   */
  playbackLocked?: boolean;
  /** Fires synchronously when the user starts playback via click, media key, or Space. */
  onPlaybackIntent?: () => void;
  onStatusChange?: (status: AudioStatusType) => void;
  /** Fires after a ±step arrow seek so the host can flash a VFD hint. Not fired for cmd jumps. */
  onSeekHint?: (direction: VfdScrollOutDirection) => void;
}

/**
 * Formats a time in seconds as `m:ss` for the player's time display.
 *
 * @param seconds - The time to format. Fractions of a second are dropped.
 * @returns The minutes, a colon and the two-digit seconds, such as `0:30`.
 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Headless audio-preview engine: owns the `<audio>` element lifecycle, the
 * WebAudio spectrum pipeline, the play-state machine, the seek transport, the
 * tab-wide keyboard registry and MediaSession, and returns a flat view-model
 * (play flags, time/progress, transport callbacks) for a host to render.
 *
 * Used directly by the {@link AudioPlayer} component and by the
 * `TurntablePlayerProvider`, which lifts the engine into the turntable hub so
 * the knob/LED/platter share one playback source.
 *
 * @param props - {@link AudioPlayerProps}.
 * @returns The audio view-model: status flags, `timeText`, `progressRatio`,
 *   `ariaLabel`, and the `togglePlay`/`seekBy`/`seekToStart`/`seekToNearEnd`
 *   transport callbacks (all stable across renders).
 */
export function useAudioController({
  previewUrl,
  refreshShortId,
  mediaKind,
  trackTitle,
  recordSwapKey,
  playbackLocked = false,
  onPlaybackIntent,
  onStatusChange,
  onSeekHint,
}: AudioPlayerProps) {
  const initialPhase: PlayerState = previewUrl
    ? { phase: PlayerPhase.Idle, duration: 30 }
    : { phase: PlayerPhase.Loading };
  const [state, dispatch] = useReducer(playerReducer, initialPhase);
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  // effectiveUrl is derived so a same-album track switch (the previewUrl prop
  // changing on the mounted hub) flows straight into the source effect below, which
  // swaps the element's src in place. `fetchedUrl` is the fallback for the refresh
  // path, where the component mounted without a preview URL.
  const effectiveUrl = previewUrl ?? fetchedUrl;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    analysersRef,
    spectrumDataRef,
    spectrumTickRef,
    resetPeakHold,
    stopSpectrumLoop,
    startSpectrumFadeOut,
    startSpectrumLoop,
  } = useSpectrumLoop();
  const { audioContextRef, gainNodeRef, releaseAudioGraph, teardownSpectrum, ensureSpectrumAnalyzer } = useAudioGraph({
    analysersRef,
    spectrumDataRef,
    startSpectrumLoop,
    stopSpectrumLoop,
    resetPeakHold,
  });
  const {
    progressRatio,
    setProgressRatioValue,
    stopProgressLoop,
    startProgressLoop,
    stopProgressRewind,
    startProgressRewind,
  } = usePlaybackProgress();
  const hasStartedRef = useRef(false);
  // Mirrors whether playback is active, read by the source effect on a same-album
  // src swap to decide whether to continue playing the new track on the same element.
  const isPlayingRef = useRef(false);
  // True while a source SWITCH is in flight (a new source effect has mounted), so
  // the previous cleanup's deferred teardown keeps the AudioContext warm instead of
  // closing it. Only a real unmount (no following source effect) leaves it false and
  // closes the context. See the source effect + finishTeardown.
  const switchPendingRef = useRef(false);
  // True once the source effect has mounted a source, so a later run is a switch.
  // `hasStartedRef` turns true only on a first play, and a track that failed to
  // load or was never played still leaves its phase behind for the next track.
  const hasMountedSourceRef = useRef(false);

  // Tune the shared ticker once on mount (lagSmoothing); idempotent.
  useEffect(() => {
    setupMotion();
  }, []);

  // Keep the playing-state mirror current so the source effect can read it without
  // taking state.phase as a dependency (which would re-run the swap on every play/pause).
  useEffect(() => {
    isPlayingRef.current = state.phase === PlayerPhase.Playing;
  }, [state.phase]);

  // Mirrors the album-scoped record identity so the source effect can compare the
  // incoming key against the previous one WITHOUT taking recordSwapKey as a
  // dependency (which would rebuild the audio element on an identity change alone).
  const recordSwapKeyRef = useRef(recordSwapKey);
  useEffect(() => {
    recordSwapKeyRef.current = recordSwapKey;
  }, [recordSwapKey]);
  // The record identity applied at the last source switch — the baseline the next
  // switch compares against to tell a same-album track change from a record swap.
  const lastSwapKeyRef = useRef(recordSwapKey);

  // Lazy fetch the preview URL when the component mounted without one.
  // Aborts on unmount so a slow Deezer call doesn't update a stale tree.
  useEffect(() => {
    if (previewUrl || !refreshShortId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const nextPreviewUrl = await fetchPreviewUrl(refreshShortId, controller.signal);
        if (nextPreviewUrl) {
          setFetchedUrl(nextPreviewUrl);
          dispatch({ type: PlayerActionType.UrlReady });
        } else {
          sendMusicSignal(PreviewSignal.Unavailable);
          notifyStatusChangeFromEvent(AudioStatus.Unavailable);
          dispatch({ type: PlayerActionType.UrlUnavailable });
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        sendMusicSignal(PreviewSignal.Unavailable);
        notifyStatusChangeFromEvent(AudioStatus.Unavailable);
        dispatch({ type: PlayerActionType.UrlUnavailable });
      }
    })();
    return () => controller.abort();
  }, [previewUrl, refreshShortId]);

  const setProgressRatioFromEvent = useEffectEvent(setProgressRatioValue);
  const startProgressRewindFromEvent = useEffectEvent(startProgressRewind);

  const startSpectrumFadeOutFromEvent = useEffectEvent(startSpectrumFadeOut);
  const notifyStatusChange = useCallback(
    (status: AudioStatusType) => {
      onStatusChange?.(status);
    },
    [onStatusChange],
  );
  const notifyStatusChangeFromEvent = useEffectEvent(notifyStatusChange);
  const notifyPlaybackIntent = useCallback(() => {
    onPlaybackIntent?.();
  }, [onPlaybackIntent]);

  useSpectrumWatchdog({
    phase: state.phase,
    audioRef,
    analysersRef,
    audioContextRef,
    spectrumTickRef,
    startSpectrumLoop,
  });

  // Starts playback on the given element: the load-bearing gesture-synchronous
  // AudioContext/gain setup, then audio.play() with the startup fade. Extracted
  // from togglePlay so a same-album source switch can continue playback on the
  // same element (see the source effect below).
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
    ],
  );
  // Decides how a source switch (a previewUrl change on the mounted hub) proceeds.
  // A same-album track change — or no swap identity, or reduced motion — continues
  // playback seamlessly on the fresh element. A record swap to a different album
  // instead hands playback to the swap orchestration: it reports Ready so the deck
  // coasts to a halt and leaves the new element idle until the disc has settled and
  // the deck re-triggers play. `previousSwapKey` is the identity at the prior
  // switch (captured before the ref is advanced), so it is never the incoming one.
  const applySourceSwitch = useEffectEvent((audio: HTMLAudioElement, previousSwapKey: string | undefined) => {
    dispatch({ type: PlayerActionType.SourceChanged });
    setProgressRatioValue(0);
    if (!isPlayingRef.current) return;
    const currentSwapKey = recordSwapKeyRef.current;
    const isRecordSwap = currentSwapKey !== undefined && currentSwapKey !== previousSwapKey && !prefersReducedMotion();
    if (isRecordSwap) {
      notifyStatusChange(AudioStatus.Ready);
      return;
    }
    beginPlayback(audio);
  });

  // The audio element is (re)created whenever the effective URL changes. Both a
  // same-album track switch and a different-album record swap change the URL on the
  // mounted hub (the hub no longer remounts per track, MC-113); the element is
  // rebuilt for the new source, and `applySourceSwitch` decides whether to continue
  // playback on the new element (same album) or defer it to the swap orchestration
  // (different album). Playback-state transitions (play/pause) do NOT re-run this —
  // only the URL does — so a running play() is never torn down mid-promise. The
  // cleanup fades the old element out then disconnects it, but KEEPS the
  // AudioContext warm across the switch (only an unmount closes it): a fresh context
  // cannot be resumed without a user gesture, which the record swap's coast + slide
  // (~3s) outlives — the exact cause of the new track running silently with a dark
  // analyzer after the swap. Reusing the still-running context needs no resume.
  useEffect(() => {
    if (!effectiveUrl) return;

    // A new source is mounting: mark this as a switch so the PREVIOUS cleanup's
    // deferred teardown keeps the context warm instead of closing it.
    switchPendingRef.current = true;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.muted = false;
    audio.volume = 1;
    audio.src = effectiveUrl;

    const handleLoadedMetadata = () => {
      const dur = resolveAudioDuration(audio);
      dispatch({ type: PlayerActionType.MetadataLoaded, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleTimeUpdate = () => {
      const dur = resolveAudioDuration(audio);
      dispatch({ type: PlayerActionType.TimeUpdate, currentTime: audio.currentTime, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleEnded = () => {
      stopProgressLoop();
      setProgressRatioFromEvent(1);
      startProgressRewindFromEvent();
      startSpectrumFadeOutFromEvent();
      sendMusicSignal(PreviewSignal.Finished);
      notifyStatusChangeFromEvent(AudioStatus.Ready);
      dispatch({ type: PlayerActionType.Ended });
    };
    const handleError = () => {
      stopProgressLoop();
      sendMusicSignal(PreviewSignal.Error);
      notifyStatusChangeFromEvent(AudioStatus.Unavailable);
      dispatch({ type: PlayerActionType.Error });
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audioRef.current = audio;

    // Advance the record-swap baseline for every source change (including idle
    // adopts and the initial mount) so it never goes stale, capturing the prior
    // identity first for the switch decision.
    const previousSwapKey = lastSwapKeyRef.current;
    lastSwapKeyRef.current = recordSwapKeyRef.current;

    // A source switch (not the first source): reset the player to a fresh idle
    // track, whatever phase the previous one ended in, and either continue or
    // defer playback per the swap decision.
    if (hasMountedSourceRef.current) {
      applySourceSwitch(audio, previousSwapKey);
    }
    hasMountedSourceRef.current = true;

    return () => {
      // Reset the switch flag; a FOLLOWING source effect (a real switch) sets it
      // back to true before the deferred teardown below reads it. On unmount no such
      // effect runs, so it stays false and the context is closed.
      switchPendingRef.current = false;

      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      stopProgressLoop();
      stopProgressRewind();
      audioRef.current = null;
      // Released synchronously, so a following source effect that continues playback
      // builds a graph for its own element instead of reusing this one.
      const previousGraph = releaseAudioGraph();

      // Pauses + clears the old element. Kept synchronous (or on the fade timer) so
      // it never leaks past a later render tick.
      const detachOldElement = () => {
        audio.pause();
        audio.src = "";
      };
      // Disconnects the old element's graph. On a switch the AudioContext stays warm
      // for the next track, and the spectrum loop is stopped only when the next track
      // has not built a graph yet, because otherwise the running loop is already its
      // own. On a real unmount the full teardown closes the context. Deferred so a
      // following source effect can flip `switchPendingRef` to true first, but
      // pause-free so the deferral cannot inflate teardown pauses.
      const finalizeGraph = () => {
        disconnectAudioGraph(previousGraph);
        if (switchPendingRef.current) {
          if (!analysersRef.current) stopSpectrumLoop();
          return;
        }
        teardownSpectrum();
      };

      const audioContext = audioContextRef.current;
      const gainNode = previousGraph.gain;
      const canFade =
        audioContext !== null &&
        audioContext.state === AudioContextState.Running &&
        gainNode !== null &&
        !audio.paused &&
        !audio.ended;

      if (canFade) {
        fadeOutForTeardown(gainNode, audioContext, () => {
          detachOldElement();
          finalizeGraph();
        });
        return;
      }

      // Not playing: detach synchronously (nothing to fade), but defer the switch-vs-
      // unmount graph decision so a synchronous following source effect can flag the
      // switch first.
      detachOldElement();
      window.setTimeout(finalizeGraph, 0);
    };
  }, [
    effectiveUrl,
    stopProgressLoop,
    stopProgressRewind,
    stopSpectrumLoop,
    releaseAudioGraph,
    teardownSpectrum,
    analysersRef,
    audioContextRef,
  ]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.phase === PlayerPhase.Idle || state.phase === PlayerPhase.Paused) {
      beginPlayback(audio);
    } else if (state.phase === PlayerPhase.Playing) {
      audio.pause();
      stopProgressLoop(audio);
      startSpectrumFadeOut();
      sendMusicSignal(PreviewSignal.Paused);
      notifyStatusChange(AudioStatus.Paused);
      dispatch({ type: PlayerActionType.Pause });
    }
  }, [beginPlayback, notifyStatusChange, startSpectrumFadeOut, state.phase, stopProgressLoop]);

  // The spacebar and the media keys are input like the play button, so they
  // respect the lock the button shows; reading the prop here keeps it current
  // for the long-lived listeners without re-registering them.
  const togglePlayFromInput = useEffectEvent(() => {
    if (!playbackLocked) togglePlay();
  });

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
      if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
      const dur = resolveAudioDuration(audio);
      audio.currentTime = resolveSeekTarget(audio.currentTime, deltaSeconds, dur);
      setProgressRatioValue(resolveAudioProgressRatio(audio));
      notifySeekHint(deltaSeconds < 0 ? VfdScrollOutDirection.Left : VfdScrollOutDirection.Right);
    },
    [state.phase, notifySeekHint, setProgressRatioValue],
  );

  /**
   * Jumps to the track start (cmd+Left). No-op unless active.
   * Does not fire `onSeekHint` — silent jump per product spec.
   */
  const seekToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
    audio.currentTime = 0;
    setProgressRatioValue(resolveAudioProgressRatio(audio));
  }, [state.phase, setProgressRatioValue]);

  /**
   * Jumps to `SEEK_END_GUARD_SECONDS` before the end (cmd+Right). No-op unless
   * active. Does not fire `onSeekHint` — silent jump per product spec.
   */
  const seekToNearEnd = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
    const dur = resolveAudioDuration(audio);
    audio.currentTime = Math.max(0, dur - SEEK_END_GUARD_SECONDS);
    setProgressRatioValue(resolveAudioProgressRatio(audio));
  }, [state.phase, setProgressRatioValue]);

  const seekByFromEvent = useEffectEvent(seekBy);
  const seekToStartFromEvent = useEffectEvent(seekToStart);
  const seekToNearEndFromEvent = useEffectEvent(seekToNearEnd);

  /**
   * Wires up the global MediaSession so the OS can route Media Keys, Bluetooth
   * headset buttons, macOS Touch-Bar / Now-Playing controls and similar
   * transport inputs to the preview player while the tab is the active media
   * source.
   *
   * Only registered while the player is in `Playing` or `Paused` phase: in
   * `Loading`, `Error`, `Unavailable` and `Idle` there is no audio to control
   * yet, so claiming the OS media slot would be misleading. On cleanup the
   * action handlers, metadata and `playbackState` are cleared so the Now-
   * Playing UI does not show a stale entry once the preview is gone.
   *
   * Multiple parallel `AudioPlayer` instances on the same page share
   * the single tab-wide MediaSession: whichever player most recently entered
   * Playing/Paused owns the OS controls. That matches user intuition (the
   * media key controls the preview you last interacted with) and avoids
   * extra coordination machinery.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;

    const mediaSession = navigator.mediaSession;
    mediaSession.metadata = new window.MediaMetadata({ title: trackTitle });
    mediaSession.playbackState =
      state.phase === PlayerPhase.Playing ? MediaSessionPlaybackState.Playing : MediaSessionPlaybackState.Paused;

    const handler = () => togglePlayFromInput();
    try {
      mediaSession.setActionHandler(MediaSessionAction.Play, handler);
      mediaSession.setActionHandler(MediaSessionAction.Pause, handler);
    } catch {
      // Older browsers throw on unsupported actions. Whatever did register
      // stays active until cleanup runs.
    }

    return () => {
      try {
        mediaSession.setActionHandler(MediaSessionAction.Play, null);
        mediaSession.setActionHandler(MediaSessionAction.Pause, null);
      } catch {
        // ignored — see above
      }
      mediaSession.metadata = null;
      mediaSession.playbackState = MediaSessionPlaybackState.None;
    };
  }, [state.phase, trackTitle]);

  const isPlayerActive = state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused;
  const isPlayerActiveRef = useRef(isPlayerActive);
  useEffect(() => {
    isPlayerActiveRef.current = isPlayerActive;
  }, [isPlayerActive]);

  /**
   * Registers this player with the tab-wide keyboard router so the global
   * keydown listener can start, toggle, or seek playback without a player
   * control being focused. Resolves the autoplay-policy gap left by
   * MediaSession: the OS media keys can only take over once playback has
   * started at least once, whereas spacebar/arrow keys in the focused tab
   * count as real user gestures and are therefore allowed to kick off the
   * very first play.
   */
  useEffect(() => {
    return registerAudioForKeyboard({
      togglePlay: () => togglePlayFromInput(),
      isActive: () => isPlayerActiveRef.current,
      seekBy: (delta) => seekByFromEvent(delta),
      seekToStart: () => seekToStartFromEvent(),
      seekToNearEnd: () => seekToNearEndFromEvent(),
    });
  }, []);

  const isLoading = state.phase === PlayerPhase.Loading;
  const isUnavailable = state.phase === PlayerPhase.Error || state.phase === PlayerPhase.Unavailable;
  const isDisabled = isLoading || isUnavailable;
  const isPlaying = state.phase === PlayerPhase.Playing;

  const currentTime = state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused ? state.currentTime : 0;
  const duration =
    state.phase === PlayerPhase.Idle || state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused
      ? state.duration
      : 30;

  const isSong = mediaKind === MediaKindValue.Song;
  const unavailableText = isSong ? audioCopy.songUnavailable : audioCopy.previewUnavailable;

  const timeText = isLoading
    ? audioCopy.previewLoading
    : isUnavailable
      ? unavailableText
      : formatTime(state.phase === PlayerPhase.Idle ? duration : currentTime);

  const ariaLabel = isLoading
    ? audioCopy.previewLoading
    : isUnavailable
      ? unavailableText
      : isPlaying
        ? isSong
          ? audioCopy.pauseSong
          : audioCopy.pausePreview
        : isSong
          ? audioCopy.playSong
          : audioCopy.playPreview;

  return {
    ariaLabel,
    isDisabled,
    isLoading,
    isPlaybackLocked: playbackLocked,
    isPlaying,
    isUnavailable,
    mediaLabel: isSong ? audioCopy.songLabel : audioCopy.previewLabel,
    progressRatio,
    seekBy,
    seekToNearEnd,
    seekToStart,
    timeText,
    title: isLoading ? audioCopy.previewLoading : isUnavailable ? unavailableText : undefined,
    togglePlay,
    trackTitle,
  };
}
