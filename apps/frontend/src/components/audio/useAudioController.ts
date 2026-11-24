/**
 * The headless audio preview engine behind `AudioPlayer` and the turntable:
 * the `useAudioController` hook, which composes the player's focused hooks,
 * the props it takes, and the time formatting only it uses.
 */
import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { AudioStatus, type AudioStatus as AudioStatusType } from "@/components/audio/AudioStatus";
import { PlayerActionType, PlayerPhase, type PlayerState, playerReducer } from "@/components/audio/playerStateMachine";
import { fetchPreviewUrl } from "@/components/audio/previewSource";
import { useAudioGraph } from "@/components/audio/useAudioGraph";
import { useAudioSource } from "@/components/audio/useAudioSource";
import { usePlaybackInputs } from "@/components/audio/usePlaybackInputs";
import { usePlaybackProgress } from "@/components/audio/usePlaybackProgress";
import { usePlaybackTransport } from "@/components/audio/usePlaybackTransport";
import { useSpectrumLoop, useSpectrumWatchdog } from "@/components/audio/useSpectrumLoop";
import type { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";
import { audioCopy } from "@/copy/audio";
import { PreviewSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { setupMotion } from "@/lib/motion/setup";
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
  // Mirrors whether playback is active, read by the source effect on a same-album
  // src swap to decide whether to continue playing the new track on the same element.
  const isPlayingRef = useRef(false);

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

  const { beginPlayback, togglePlay, seekBy, seekToStart, seekToNearEnd } = usePlaybackTransport({
    phase: state.phase,
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
  });

  useAudioSource({
    effectiveUrl,
    initialSwapKey: recordSwapKey,
    dispatch,
    audioRef,
    isPlayingRef,
    recordSwapKeyRef,
    audioContextRef,
    releaseAudioGraph,
    teardownSpectrum,
    analysersRef,
    stopSpectrumLoop,
    startSpectrumFadeOut,
    setProgressRatioValue,
    startProgressRewind,
    stopProgressLoop,
    stopProgressRewind,
    beginPlayback,
    notifyStatusChange,
  });

  usePlaybackInputs({ phase: state.phase, trackTitle, playbackLocked, togglePlay, seekBy, seekToStart, seekToNearEnd });

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
