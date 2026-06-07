import { ENDPOINTS } from "@musiccloud/shared";
import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import {
  AudioPreviewStatus,
  type AudioPreviewStatus as AudioPreviewStatusType,
} from "@/components/audio/AudioPreviewStatus";
import { Player } from "@/components/playback/Player";
import { useT } from "@/i18n/context";
import { sendMusicSignal } from "@/lib/analytics/umami";
import type { MediaCardContentType } from "@/lib/types/media-card";

interface AudioPreviewPlayerProps {
  /** Immediately-playable preview URL. Optional when `refreshShortId` is set. */
  previewUrl?: string;
  /** Short ID used to refresh an expired/missing Deezer preview URL via the
   *  `/api/share-preview/:shortId` proxy. When set without `previewUrl`, the
   *  player mounts in a loading state and fetches on mount. */
  refreshShortId?: string;
  trackTitle: string;
  contentType?: MediaCardContentType;
  onStatusChange?: (status: AudioPreviewStatusType) => void;
}

/**
 * AudioPreviewPlayer - Audio preview playback component
 *
 * Orchestrates the compound Player component for audio preview functionality.
 * Handles audio element lifecycle and state management.
 *
 * State machine phases:
 *   loading  — Waiting for a lazy fetch to deliver a preview URL.
 *   idle     — Ready to play. Duration defaults to 30s, updated once metadata loads.
 *   playing  — Playback active.
 *   paused   — Playback paused.
 *   error    — Audio URL unplayable. Component renders unavailable state.
 *   unavailable — Backend confirmed no preview can be produced for this track.
 */
const PlayerPhase = {
  Loading: "loading",
  Idle: "idle",
  Playing: "playing",
  Paused: "paused",
  Error: "error",
  Unavailable: "unavailable",
} as const;

const PlayerActionType = {
  UrlReady: "URL_READY",
  UrlUnavailable: "URL_UNAVAILABLE",
  MetadataLoaded: "METADATA_LOADED",
  Play: "PLAY",
  Pause: "PAUSE",
  TimeUpdate: "TIME_UPDATE",
  Ended: "ENDED",
  Error: "ERROR",
} as const;

const PreviewAnalyticsAction = {
  Unavailable: "unavailable",
  Ended: "ended",
  Error: "error",
  Resume: "resume",
  Play: "play",
  Pause: "pause",
} as const;

const PreviewAnalyticsSource = {
  Refresh: "refresh",
} as const;

const AudioContextState = {
  Closed: "closed",
  Running: "running",
  Suspended: "suspended",
} as const;

type PlayerState =
  | { phase: typeof PlayerPhase.Loading }
  | { phase: typeof PlayerPhase.Idle; duration: number }
  | { phase: typeof PlayerPhase.Playing; currentTime: number; duration: number }
  | { phase: typeof PlayerPhase.Paused; currentTime: number; duration: number }
  | { phase: typeof PlayerPhase.Error }
  | { phase: typeof PlayerPhase.Unavailable };

type PlayerAction =
  | { type: typeof PlayerActionType.UrlReady }
  | { type: typeof PlayerActionType.UrlUnavailable }
  | { type: typeof PlayerActionType.MetadataLoaded; duration: number }
  | { type: typeof PlayerActionType.Play }
  | { type: typeof PlayerActionType.Pause }
  | { type: typeof PlayerActionType.TimeUpdate; currentTime: number; duration: number }
  | { type: typeof PlayerActionType.Ended }
  | { type: typeof PlayerActionType.Error };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case PlayerActionType.UrlReady:
      if (state.phase === PlayerPhase.Loading) return { phase: PlayerPhase.Idle, duration: 30 };
      return state;
    case PlayerActionType.UrlUnavailable:
      if (state.phase === PlayerPhase.Loading) return { phase: PlayerPhase.Unavailable };
      return state;
    case PlayerActionType.MetadataLoaded:
      if (state.phase === PlayerPhase.Idle) return { ...state, duration: action.duration };
      if (state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused)
        return { ...state, duration: action.duration };
      return state;
    case PlayerActionType.Play:
      if (state.phase === PlayerPhase.Idle)
        return { phase: PlayerPhase.Playing, currentTime: 0, duration: state.duration };
      if (state.phase === PlayerPhase.Paused) return { ...state, phase: PlayerPhase.Playing };
      return state;
    case PlayerActionType.Pause:
      if (state.phase === PlayerPhase.Playing) return { ...state, phase: PlayerPhase.Paused };
      return state;
    case PlayerActionType.TimeUpdate:
      if (state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused)
        return { ...state, currentTime: action.currentTime, duration: action.duration };
      return state;
    case PlayerActionType.Ended:
      if (state.phase === PlayerPhase.Playing) return { phase: PlayerPhase.Idle, duration: state.duration };
      return state;
    case PlayerActionType.Error:
      return { phase: PlayerPhase.Error };
    default:
      return state;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resolveAudioProgressRatio(audio: HTMLAudioElement): number {
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
  const ratio = audio.currentTime / duration;
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

const SPECTRUM_CHANNEL_BAND_COUNT = 12;
const SPECTRUM_UPDATE_MS = 50;
const SPECTRUM_FADE_FACTOR = 0.68;
const SPECTRUM_FADE_MIN_LEVEL = 0.03;
const SPECTRUM_LOW_BAND_COUNT = 4;
const SPECTRUM_RECOVERY_CHECK_MS = 700;
const PLAYER_PROGRESS_REWIND_MS = 420;

type BrowserAudioContextConstructor = typeof AudioContext;

interface StereoSpectrumBands {
  left: number[];
  right: number[];
}

interface StereoSpectrumData {
  left: Uint8Array<ArrayBuffer>;
  right: Uint8Array<ArrayBuffer>;
}

interface StereoSpectrumAnalysers {
  left: AnalyserNode;
  right: AnalyserNode;
}

async function fetchPreviewUrl(refreshShortId: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(ENDPOINTS.frontend.sharePreview(refreshShortId), { signal });
  if (!res.ok) return null;
  const body = (await res.json()) as { previewUrl: string | null };
  return body.previewUrl;
}

function getAudioContextConstructor(): BrowserAudioContextConstructor | undefined {
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: BrowserAudioContextConstructor }).webkitAudioContext
  );
}

function resolveSpectrumBandRange(band: number, bandCount: number, usableBins: number): [number, number] {
  const logMax = Math.log(usableBins + 1);
  const start = 2 + Math.floor(Math.exp((band / bandCount) * logMax) - 1);
  const end = 2 + Math.floor(Math.exp(((band + 1) / bandCount) * logMax) - 1);
  return [start, Math.max(start + 1, end)];
}

function sameSpectrumBands(a: readonly number[] | null, b: readonly number[]): boolean {
  return a !== null && a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameStereoSpectrumBands(a: StereoSpectrumBands | null, b: StereoSpectrumBands): boolean {
  return a !== null && sameSpectrumBands(a.left, b.left) && sameSpectrumBands(a.right, b.right);
}

function fadeSpectrumBands(bands: StereoSpectrumBands): StereoSpectrumBands {
  const fadeBand = (band: number) => (band <= SPECTRUM_FADE_MIN_LEVEL ? 0 : band * SPECTRUM_FADE_FACTOR);
  return {
    left: bands.left.map(fadeBand),
    right: bands.right.map(fadeBand),
  };
}

function hasVisibleSpectrumBands(bands: StereoSpectrumBands): boolean {
  return bands.left.some((band) => band > 0) || bands.right.some((band) => band > 0);
}

function resolveSpectrumBands(frequencyData: Uint8Array<ArrayBuffer>, bandCount: number): number[] {
  const usableBins = Math.max(1, frequencyData.length - 2);
  const rawBands = Array.from({ length: bandCount }, (_, band) => {
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
    return normalized ** dynamicCurve * lowFrequencyDamping;
  });

  const framePeak = Math.max(...rawBands, 0);
  const frameGain = framePeak > 0 ? Math.min(1.45, 0.82 / Math.max(framePeak, 0.42)) : 1;
  return rawBands.map((band) => Math.min(1, band * frameGain));
}

function useAudioPreviewController({
  previewUrl,
  refreshShortId,
  trackTitle,
  contentType,
  onStatusChange,
}: AudioPreviewPlayerProps) {
  const t = useT();
  const initialPhase: PlayerState = previewUrl
    ? { phase: PlayerPhase.Idle, duration: 30 }
    : { phase: PlayerPhase.Loading };
  const [state, dispatch] = useReducer(playerReducer, initialPhase);
  const [effectiveUrl, setEffectiveUrl] = useReducer(
    (_: string | null, next: string | null) => next,
    previewUrl ?? null,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<StereoSpectrumAnalysers | null>(null);
  const channelSplitterRef = useRef<ChannelSplitterNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const spectrumFrameRef = useRef<number | null>(null);
  const spectrumDataRef = useRef<StereoSpectrumData | null>(null);
  const spectrumLastUpdateRef = useRef(0);
  const spectrumBandsRef = useRef<StereoSpectrumBands | null>(null);
  const spectrumRecoveryInFlightRef = useRef(false);
  const progressFrameRef = useRef<number | null>(null);
  const progressRewindFrameRef = useRef<number | null>(null);
  const progressRatioRef = useRef(0);
  const hasStartedRef = useRef(false);
  const [spectrumBands, setSpectrumBands] = useState<StereoSpectrumBands | null>(null);
  const [progressRatio, setProgressRatio] = useState(0);

  // Lazy fetch the preview URL when the component mounted without one.
  // Aborts on unmount so a slow Deezer call doesn't update a stale tree.
  useEffect(() => {
    if (previewUrl || !refreshShortId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const nextPreviewUrl = await fetchPreviewUrl(refreshShortId, controller.signal);
        if (nextPreviewUrl) {
          setEffectiveUrl(nextPreviewUrl);
          dispatch({ type: PlayerActionType.UrlReady });
        } else {
          sendMusicSignal("music_preview_interaction", {
            action: PreviewAnalyticsAction.Unavailable,
            content_type: contentType,
            source: PreviewAnalyticsSource.Refresh,
          });
          notifyStatusChangeFromEvent(AudioPreviewStatus.Unavailable);
          dispatch({ type: PlayerActionType.UrlUnavailable });
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        sendMusicSignal("music_preview_interaction", {
          action: PreviewAnalyticsAction.Unavailable,
          content_type: contentType,
          source: PreviewAnalyticsSource.Refresh,
        });
        notifyStatusChangeFromEvent(AudioPreviewStatus.Unavailable);
        dispatch({ type: PlayerActionType.UrlUnavailable });
      }
    })();
    return () => controller.abort();
  }, [contentType, previewUrl, refreshShortId]);

  const stopSpectrumLoop = useCallback(({ clearBands = true }: { clearBands?: boolean } = {}) => {
    if (spectrumFrameRef.current !== null) cancelAnimationFrame(spectrumFrameRef.current);
    spectrumFrameRef.current = null;
    spectrumLastUpdateRef.current = 0;
    if (!clearBands) return;
    spectrumBandsRef.current = null;
    setSpectrumBands(null);
  }, []);

  const setProgressRatioValue = useCallback((ratio: number) => {
    const nextRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
    if (progressRatioRef.current === nextRatio) return;
    progressRatioRef.current = nextRatio;
    setProgressRatio(nextRatio);
  }, []);
  const setProgressRatioFromEvent = useEffectEvent(setProgressRatioValue);

  const stopProgressRewind = useCallback(() => {
    if (progressRewindFrameRef.current !== null) cancelAnimationFrame(progressRewindFrameRef.current);
    progressRewindFrameRef.current = null;
  }, []);

  const stopProgressLoop = useCallback(
    (audio?: HTMLAudioElement | null) => {
      if (progressFrameRef.current !== null) cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
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
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now;
      const elapsedRatio = Math.min(1, (now - startedAt) / PLAYER_PROGRESS_REWIND_MS);
      setProgressRatioValue(startRatio * (1 - elapsedRatio));
      if (elapsedRatio < 1) {
        progressRewindFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      progressRewindFrameRef.current = null;
      setProgressRatioValue(0);
    };

    progressRewindFrameRef.current = requestAnimationFrame(tick);
  }, [setProgressRatioValue, stopProgressRewind]);
  const startProgressRewindFromEvent = useEffectEvent(startProgressRewind);

  const startProgressLoop = useCallback(
    (audio: HTMLAudioElement) => {
      stopProgressLoop();
      const tick = () => {
        setProgressRatioValue(resolveAudioProgressRatio(audio));
        if (!audio.paused && !audio.ended) progressFrameRef.current = requestAnimationFrame(tick);
      };
      progressFrameRef.current = requestAnimationFrame(tick);
    },
    [setProgressRatioValue, stopProgressLoop],
  );

  const startSpectrumFadeOut = useCallback(() => {
    stopSpectrumLoop({ clearBands: false });
    const currentBands = spectrumBandsRef.current;
    if (!currentBands) return;

    const tick = (now: number) => {
      spectrumFrameRef.current = null;
      if (now - spectrumLastUpdateRef.current < SPECTRUM_UPDATE_MS) {
        spectrumFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      spectrumLastUpdateRef.current = now;

      const nextBands = fadeSpectrumBands(spectrumBandsRef.current ?? currentBands);
      spectrumBandsRef.current = nextBands;
      setSpectrumBands(nextBands);
      if (hasVisibleSpectrumBands(nextBands)) {
        spectrumFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      spectrumBandsRef.current = null;
      setSpectrumBands(null);
    };

    spectrumFrameRef.current = requestAnimationFrame(tick);
  }, [stopSpectrumLoop]);
  const startSpectrumFadeOutFromEvent = useEffectEvent(startSpectrumFadeOut);
  const notifyStatusChange = useCallback(
    (status: AudioPreviewStatusType) => {
      onStatusChange?.(status);
    },
    [onStatusChange],
  );
  const notifyStatusChangeFromEvent = useEffectEvent(notifyStatusChange);

  const teardownSpectrum = useCallback(() => {
    stopSpectrumLoop();
    mediaSourceRef.current?.disconnect();
    channelSplitterRef.current?.disconnect();
    analysersRef.current?.left.disconnect();
    analysersRef.current?.right.disconnect();
    mediaSourceRef.current = null;
    channelSplitterRef.current = null;
    analysersRef.current = null;
    spectrumDataRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== AudioContextState.Closed) {
      audioContext.onstatechange = null;
      void audioContext.close().catch(() => {
        // Closing can fail in interrupted browser audio sessions. The audio
        // element is disposed independently, so there is nothing else to do.
      });
    }
  }, [stopSpectrumLoop]);

  const startSpectrumLoop = useCallback(() => {
    const analysers = analysersRef.current;
    if (!analysers || spectrumFrameRef.current !== null) return;

    const data = spectrumDataRef.current ?? {
      left: new Uint8Array(analysers.left.frequencyBinCount),
      right: new Uint8Array(analysers.right.frequencyBinCount),
    };
    spectrumDataRef.current = data;

    const tick = (now: number) => {
      spectrumFrameRef.current = requestAnimationFrame(tick);
      if (now - spectrumLastUpdateRef.current < SPECTRUM_UPDATE_MS) return;
      spectrumLastUpdateRef.current = now;
      analysers.left.getByteFrequencyData(data.left);
      analysers.right.getByteFrequencyData(data.right);
      const nextBands: StereoSpectrumBands = {
        left: resolveSpectrumBands(data.left, SPECTRUM_CHANNEL_BAND_COUNT),
        right: resolveSpectrumBands(data.right, SPECTRUM_CHANNEL_BAND_COUNT),
      };
      if (sameStereoSpectrumBands(spectrumBandsRef.current, nextBands)) return;
      spectrumBandsRef.current = nextBands;
      setSpectrumBands(nextBands);
    };

    spectrumFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureSpectrumAnalyzer = useCallback(
    async (audio: HTMLAudioElement) => {
      if (analysersRef.current) {
        if (audioContextRef.current?.state === AudioContextState.Suspended) await audioContextRef.current.resume();
        return audioContextRef.current?.state === AudioContextState.Running;
      }

      const AudioContextConstructor = getAudioContextConstructor();
      if (!AudioContextConstructor) return false;

      const audioContext = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;
      if (audioContext.state === AudioContextState.Suspended) await audioContext.resume();
      if (audioContext.state !== AudioContextState.Running) return false;

      audioContext.onstatechange = () => {
        if (audioContext.state === AudioContextState.Running) {
          if (!audio.paused && !audio.ended) startSpectrumLoop();
          return;
        }
        stopSpectrumLoop({ clearBands: false });
        if (!audio.paused && !audio.ended && audioContext.state === AudioContextState.Suspended) {
          void audioContext
            .resume()
            .then(() => {
              if (audioContext.state === AudioContextState.Running && !audio.paused && !audio.ended)
                startSpectrumLoop();
            })
            .catch(() => setSpectrumBands(null));
        }
      };

      try {
        const splitter = audioContext.createChannelSplitter(2);
        const leftAnalyser = audioContext.createAnalyser();
        const rightAnalyser = audioContext.createAnalyser();
        for (const analyser of [leftAnalyser, rightAnalyser]) {
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.66;
        }

        const source = audioContext.createMediaElementSource(audio);
        source.connect(audioContext.destination);
        source.connect(splitter);
        splitter.connect(leftAnalyser, 0);
        splitter.connect(rightAnalyser, 1);

        mediaSourceRef.current = source;
        channelSplitterRef.current = splitter;
        analysersRef.current = { left: leftAnalyser, right: rightAnalyser };
        spectrumDataRef.current = {
          left: new Uint8Array(leftAnalyser.frequencyBinCount),
          right: new Uint8Array(rightAnalyser.frequencyBinCount),
        };
        return true;
      } catch {
        mediaSourceRef.current?.disconnect();
        channelSplitterRef.current?.disconnect();
        analysersRef.current?.left.disconnect();
        analysersRef.current?.right.disconnect();
        mediaSourceRef.current = null;
        channelSplitterRef.current = null;
        analysersRef.current = null;
        spectrumDataRef.current = null;
        setSpectrumBands(null);
        return false;
      }
    },
    [startSpectrumLoop, stopSpectrumLoop],
  );

  useEffect(() => {
    if (state.phase !== PlayerPhase.Playing) return;
    const audio = audioRef.current;
    if (!audio) return;

    const recoverSpectrum = () => {
      if (spectrumRecoveryInFlightRef.current || audio.paused || audio.ended) return;
      const audioContext = audioContextRef.current;
      const needsRecovery =
        !analysersRef.current || audioContext?.state !== AudioContextState.Running || spectrumFrameRef.current === null;
      if (!needsRecovery) return;

      spectrumRecoveryInFlightRef.current = true;
      void ensureSpectrumAnalyzer(audio)
        .then((isAnalyzerReady) => {
          if (isAnalyzerReady && !audio.paused && !audio.ended) startSpectrumLoop();
        })
        .catch(() => undefined)
        .finally(() => {
          spectrumRecoveryInFlightRef.current = false;
        });
    };

    const recoveryTimer = window.setInterval(recoverSpectrum, SPECTRUM_RECOVERY_CHECK_MS);
    return () => window.clearInterval(recoveryTimer);
  }, [ensureSpectrumAnalyzer, startSpectrumLoop, state.phase]);

  // Bind the <audio> element when a URL becomes available. The only
  // dependency is the URL itself — playback state transitions (play/pause)
  // must NOT retear the audio element down, or the play() promise starting
  // the transition gets aborted and surfaces as a spurious "unavailable".
  useEffect(() => {
    if (!effectiveUrl) return;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.muted = false;
    audio.volume = 1;
    audio.src = effectiveUrl;

    const handleLoadedMetadata = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      dispatch({ type: PlayerActionType.MetadataLoaded, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleTimeUpdate = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      dispatch({ type: PlayerActionType.TimeUpdate, currentTime: audio.currentTime, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleEnded = () => {
      stopProgressLoop();
      setProgressRatioFromEvent(1);
      startProgressRewindFromEvent();
      startSpectrumFadeOutFromEvent();
      sendMusicSignal("music_preview_interaction", {
        action: PreviewAnalyticsAction.Ended,
        content_type: contentType,
      });
      notifyStatusChangeFromEvent(AudioPreviewStatus.Ready);
      dispatch({ type: PlayerActionType.Ended });
    };
    const handleError = () => {
      stopProgressLoop();
      sendMusicSignal("music_preview_interaction", {
        action: PreviewAnalyticsAction.Error,
        content_type: contentType,
      });
      notifyStatusChangeFromEvent(AudioPreviewStatus.Unavailable);
      dispatch({ type: PlayerActionType.Error });
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audioRef.current = audio;

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      stopProgressLoop();
      stopProgressRewind();
      teardownSpectrum();
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [effectiveUrl, contentType, stopProgressLoop, stopProgressRewind, teardownSpectrum]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.phase === PlayerPhase.Idle || state.phase === PlayerPhase.Paused) {
      stopProgressRewind();
      stopSpectrumLoop({ clearBands: false });
      audio.muted = false;
      audio.volume = 1;
      audio
        .play()
        .then(() => {
          sendMusicSignal("music_preview_interaction", {
            action: hasStartedRef.current ? PreviewAnalyticsAction.Resume : PreviewAnalyticsAction.Play,
            content_type: contentType,
          });
          dispatch({ type: PlayerActionType.Play });
          notifyStatusChange(AudioPreviewStatus.Playing);
          hasStartedRef.current = true;
          startProgressLoop(audio);
          void ensureSpectrumAnalyzer(audio)
            .then((isAnalyzerReady) => {
              if (isAnalyzerReady && !audio.paused) startSpectrumLoop();
            })
            .catch(() => setSpectrumBands(null));
        })
        .catch(() => {
          sendMusicSignal("music_preview_interaction", {
            action: PreviewAnalyticsAction.Error,
            content_type: contentType,
          });
          notifyStatusChange(AudioPreviewStatus.Unavailable);
          dispatch({ type: PlayerActionType.Error });
        });
    } else if (state.phase === PlayerPhase.Playing) {
      audio.pause();
      stopProgressLoop(audio);
      startSpectrumFadeOut();
      sendMusicSignal("music_preview_interaction", {
        action: PreviewAnalyticsAction.Pause,
        content_type: contentType,
      });
      notifyStatusChange(AudioPreviewStatus.Paused);
      dispatch({ type: PlayerActionType.Pause });
    }
  }, [
    contentType,
    ensureSpectrumAnalyzer,
    startProgressLoop,
    startSpectrumFadeOut,
    startSpectrumLoop,
    state.phase,
    stopProgressLoop,
    stopProgressRewind,
    stopSpectrumLoop,
    notifyStatusChange,
  ]);

  const isLoading = state.phase === PlayerPhase.Loading;
  const isUnavailable = state.phase === PlayerPhase.Error || state.phase === PlayerPhase.Unavailable;
  const isDisabled = isLoading || isUnavailable;
  const isPlaying = state.phase === PlayerPhase.Playing;

  const currentTime = state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused ? state.currentTime : 0;
  const duration =
    state.phase === PlayerPhase.Idle || state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused
      ? state.duration
      : 30;

  const timeText = isLoading
    ? t("audio.previewLoading")
    : isUnavailable
      ? t("audio.previewUnavailable")
      : formatTime(state.phase === PlayerPhase.Idle ? duration : currentTime);

  const ariaLabel = isLoading
    ? t("audio.previewLoading")
    : isUnavailable
      ? t("audio.previewUnavailable")
      : isPlaying
        ? "Pause preview"
        : "Play preview";

  return {
    ariaLabel,
    isDisabled,
    isLoading,
    isPlaying,
    isUnavailable,
    progressRatio,
    spectrumBands,
    timeText,
    title: isLoading ? t("audio.previewLoading") : isUnavailable ? t("audio.previewUnavailable") : undefined,
    togglePlay,
    trackTitle,
  };
}

export function AudioPreviewPlayer(props: AudioPreviewPlayerProps) {
  const player = useAudioPreviewController(props);

  return (
    <section aria-label={`Preview: ${player.trackTitle}`}>
      <Player
        isPlaying={player.isPlaying}
        isDisabled={player.isDisabled}
        timeText={player.timeText}
        progressRatio={player.progressRatio}
        ariaLabel={player.ariaLabel}
        title={player.title}
        spectrumBands={player.spectrumBands}
        onTogglePlay={player.togglePlay}
      />
    </section>
  );
}
