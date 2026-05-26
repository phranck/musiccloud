import { ENDPOINTS } from "@musiccloud/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Player } from "@/components/playback/Player";
import { useT } from "@/i18n/context";
import { trackPlayerEvent } from "@/lib/analytics";

export type AudioPreviewStatus = "loading" | "ready" | "playing" | "paused" | "ended" | "unavailable";

interface AudioPreviewPlayerProps {
  /** Immediately-playable preview URL. Optional when `refreshShortId` is set. */
  previewUrl?: string;
  /** Short ID used to refresh an expired/missing Deezer preview URL via the
   *  `/api/share-preview/:shortId` proxy. When set without `previewUrl`, the
   *  player mounts in a loading state and fetches on mount. */
  refreshShortId?: string;
  shortId?: string;
  trackTitle: string;
  onStatusChange?: (status: AudioPreviewStatus) => void;
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
type PlayerState =
  | { phase: "loading" }
  | { phase: "idle"; duration: number }
  | { phase: "playing"; currentTime: number; duration: number }
  | { phase: "paused"; currentTime: number; duration: number }
  | { phase: "error" }
  | { phase: "unavailable" };

type PlayerAction =
  | { type: "URL_READY" }
  | { type: "URL_UNAVAILABLE" }
  | { type: "METADATA_LOADED"; duration: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME_UPDATE"; currentTime: number; duration: number }
  | { type: "ENDED" }
  | { type: "ERROR" };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "URL_READY":
      if (state.phase === "loading") return { phase: "idle", duration: 30 };
      return state;
    case "URL_UNAVAILABLE":
      if (state.phase === "loading") return { phase: "unavailable" };
      return state;
    case "METADATA_LOADED":
      if (state.phase === "idle") return { ...state, duration: action.duration };
      if (state.phase === "playing" || state.phase === "paused") return { ...state, duration: action.duration };
      return state;
    case "PLAY":
      if (state.phase === "idle") return { phase: "playing", currentTime: 0, duration: state.duration };
      if (state.phase === "paused") return { ...state, phase: "playing" };
      return state;
    case "PAUSE":
      if (state.phase === "playing") return { ...state, phase: "paused" };
      return state;
    case "TIME_UPDATE":
      if (state.phase === "playing" || state.phase === "paused")
        return { ...state, currentTime: action.currentTime, duration: action.duration };
      return state;
    case "ENDED":
      if (state.phase === "playing") return { phase: "idle", duration: state.duration };
      return state;
    case "ERROR":
      return { phase: "error" };
    default:
      return state;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function quantizeProgressRatio(ratio: number): number {
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return Math.round(safeRatio * PLAYER_PROGRESS_PIXEL_STEPS) / PLAYER_PROGRESS_PIXEL_STEPS;
}

function resolveAudioProgressRatio(audio: HTMLAudioElement): number {
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
  return quantizeProgressRatio(audio.currentTime / duration);
}

const SPECTRUM_CHANNEL_BAND_COUNT = 12;
const SPECTRUM_LEVEL_COUNT = 7;
const SPECTRUM_UPDATE_MS = 50;
const SPECTRUM_FADE_FACTOR = 0.68;
const SPECTRUM_FADE_MIN_LEVEL = 0.03;
const PLAYER_PROGRESS_PIXEL_STEPS = 360;
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
    const lowFrequencyDamping = 0.48 + position * 0.72;
    const normalized = Math.max(0, total / Math.max(1, count) / 255 - 0.035) / 0.965;
    return normalized ** 1.18 * lowFrequencyDamping;
  });

  const framePeak = Math.max(...rawBands, 0);
  const frameGain = framePeak > 0 ? Math.min(1.35, 0.82 / Math.max(framePeak, 0.38)) : 1;
  return rawBands.map(
    (band) => Math.round(Math.min(1, band * frameGain) * SPECTRUM_LEVEL_COUNT) / SPECTRUM_LEVEL_COUNT,
  );
}

export function AudioPreviewPlayer({
  previewUrl,
  refreshShortId,
  shortId,
  trackTitle,
  onStatusChange,
}: AudioPreviewPlayerProps) {
  const t = useT();
  const initialPhase: PlayerState = previewUrl ? { phase: "idle", duration: 30 } : { phase: "loading" };
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
          dispatch({ type: "URL_READY" });
        } else {
          trackPlayerEvent("player_unavailable", shortId ?? refreshShortId);
          dispatch({ type: "URL_UNAVAILABLE" });
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        trackPlayerEvent("player_unavailable", shortId ?? refreshShortId);
        dispatch({ type: "URL_UNAVAILABLE" });
      }
    })();
    return () => controller.abort();
  }, [previewUrl, refreshShortId, shortId]);

  const stopSpectrumLoop = useCallback(({ clearBands = true }: { clearBands?: boolean } = {}) => {
    if (spectrumFrameRef.current !== null) cancelAnimationFrame(spectrumFrameRef.current);
    spectrumFrameRef.current = null;
    spectrumLastUpdateRef.current = 0;
    if (!clearBands) return;
    spectrumBandsRef.current = null;
    setSpectrumBands(null);
  }, []);

  const setQuantizedProgressRatio = useCallback((ratio: number) => {
    const nextRatio = quantizeProgressRatio(ratio);
    if (progressRatioRef.current === nextRatio) return;
    progressRatioRef.current = nextRatio;
    setProgressRatio(nextRatio);
  }, []);

  const stopProgressRewind = useCallback(() => {
    if (progressRewindFrameRef.current !== null) cancelAnimationFrame(progressRewindFrameRef.current);
    progressRewindFrameRef.current = null;
  }, []);

  const stopProgressLoop = useCallback(
    (audio?: HTMLAudioElement | null) => {
      if (progressFrameRef.current !== null) cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
      if (audio) setQuantizedProgressRatio(resolveAudioProgressRatio(audio));
    },
    [setQuantizedProgressRatio],
  );

  const startProgressRewind = useCallback(() => {
    stopProgressRewind();
    const startRatio = progressRatioRef.current;
    if (startRatio <= 0) {
      setQuantizedProgressRatio(0);
      return;
    }

    let startedAt: number | null = null;
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now;
      const elapsedRatio = Math.min(1, (now - startedAt) / PLAYER_PROGRESS_REWIND_MS);
      setQuantizedProgressRatio(startRatio * (1 - elapsedRatio));
      if (elapsedRatio < 1) {
        progressRewindFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      progressRewindFrameRef.current = null;
      setQuantizedProgressRatio(0);
    };

    progressRewindFrameRef.current = requestAnimationFrame(tick);
  }, [setQuantizedProgressRatio, stopProgressRewind]);

  const startProgressLoop = useCallback(
    (audio: HTMLAudioElement) => {
      stopProgressLoop();
      const tick = () => {
        setQuantizedProgressRatio(resolveAudioProgressRatio(audio));
        if (!audio.paused && !audio.ended) progressFrameRef.current = requestAnimationFrame(tick);
      };
      progressFrameRef.current = requestAnimationFrame(tick);
    },
    [setQuantizedProgressRatio, stopProgressLoop],
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
    if (audioContext && audioContext.state !== "closed") {
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
        if (audioContextRef.current?.state === "suspended") await audioContextRef.current.resume();
        return audioContextRef.current?.state === "running";
      }

      const AudioContextConstructor = getAudioContextConstructor();
      if (!AudioContextConstructor) return false;

      const audioContext = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      if (audioContext.state !== "running") return false;

      audioContext.onstatechange = () => {
        if (audioContext.state === "running") return;
        stopSpectrumLoop({ clearBands: false });
        if (!audio.paused && audioContext.state === "suspended") {
          void audioContext.resume().catch(() => setSpectrumBands(null));
        }
      };

      try {
        const splitter = audioContext.createChannelSplitter(2);
        const leftAnalyser = audioContext.createAnalyser();
        const rightAnalyser = audioContext.createAnalyser();
        for (const analyser of [leftAnalyser, rightAnalyser]) {
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.74;
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
    [stopSpectrumLoop],
  );

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
      dispatch({ type: "METADATA_LOADED", duration: dur });
      setQuantizedProgressRatio(resolveAudioProgressRatio(audio));
    };
    const handleTimeUpdate = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      dispatch({ type: "TIME_UPDATE", currentTime: audio.currentTime, duration: dur });
      setQuantizedProgressRatio(resolveAudioProgressRatio(audio));
    };
    const handleEnded = () => {
      stopProgressLoop();
      setQuantizedProgressRatio(1);
      startProgressRewind();
      startSpectrumFadeOut();
      trackPlayerEvent("player_completed", shortId ?? refreshShortId);
      dispatch({ type: "ENDED" });
    };
    const handleError = () => {
      stopProgressLoop();
      trackPlayerEvent("player_unavailable", shortId ?? refreshShortId);
      dispatch({ type: "ERROR" });
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
  }, [
    effectiveUrl,
    refreshShortId,
    setQuantizedProgressRatio,
    shortId,
    startProgressRewind,
    startSpectrumFadeOut,
    stopProgressLoop,
    stopProgressRewind,
    teardownSpectrum,
  ]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.phase === "idle" || state.phase === "paused") {
      stopProgressRewind();
      stopSpectrumLoop({ clearBands: false });
      audio.muted = false;
      audio.volume = 1;
      audio
        .play()
        .then(() => {
          dispatch({ type: "PLAY" });
          trackPlayerEvent(hasStartedRef.current ? "player_resumed" : "player_started", shortId ?? refreshShortId);
          hasStartedRef.current = true;
          startProgressLoop(audio);
          void ensureSpectrumAnalyzer(audio)
            .then((isAnalyzerReady) => {
              if (isAnalyzerReady && !audio.paused) startSpectrumLoop();
            })
            .catch(() => setSpectrumBands(null));
        })
        .catch(() => dispatch({ type: "ERROR" }));
    } else if (state.phase === "playing") {
      audio.pause();
      stopProgressLoop(audio);
      startSpectrumFadeOut();
      trackPlayerEvent("player_paused", shortId ?? refreshShortId);
      dispatch({ type: "PAUSE" });
    }
  }, [
    ensureSpectrumAnalyzer,
    refreshShortId,
    shortId,
    startProgressLoop,
    startSpectrumFadeOut,
    startSpectrumLoop,
    state.phase,
    stopProgressLoop,
    stopProgressRewind,
    stopSpectrumLoop,
  ]);

  const isLoading = state.phase === "loading";
  const isUnavailable = state.phase === "error" || state.phase === "unavailable";
  const isDisabled = isLoading || isUnavailable;
  const isPlaying = state.phase === "playing";

  useEffect(() => {
    const status: AudioPreviewStatus = isLoading
      ? "loading"
      : isUnavailable
        ? "unavailable"
        : state.phase === "playing"
          ? "playing"
          : state.phase === "paused"
            ? "paused"
            : "ready";
    onStatusChange?.(status);
  }, [isLoading, isUnavailable, onStatusChange, state.phase]);
  const currentTime = state.phase === "playing" || state.phase === "paused" ? state.currentTime : 0;
  const duration =
    state.phase === "idle" || state.phase === "playing" || state.phase === "paused" ? state.duration : 30;

  const timeText = isLoading
    ? t("audio.previewLoading")
    : isUnavailable
      ? t("audio.previewUnavailable")
      : formatTime(state.phase === "idle" ? duration : currentTime);

  const ariaLabel = isLoading
    ? t("audio.previewLoading")
    : isUnavailable
      ? t("audio.previewUnavailable")
      : isPlaying
        ? "Pause preview"
        : "Play preview";

  return (
    <section aria-label={`Preview: ${trackTitle}`}>
      <Player
        isPlaying={isPlaying}
        isDisabled={isDisabled}
        timeText={timeText}
        progressRatio={progressRatio}
        ariaLabel={ariaLabel}
        title={isLoading ? t("audio.previewLoading") : isUnavailable ? t("audio.previewUnavailable") : undefined}
        spectrumBands={spectrumBands}
        onTogglePlay={togglePlay}
      />
    </section>
  );
}
