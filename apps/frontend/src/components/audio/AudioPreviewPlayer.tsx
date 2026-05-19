import { ENDPOINTS } from "@musiccloud/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Player, type PlayerProgressGranularity, type PlayerProgressVariant } from "@/components/playback/Player";
import { useT } from "@/i18n/context";

export type AudioPreviewStatus = "loading" | "ready" | "playing" | "paused" | "ended" | "unavailable";

interface AudioPreviewPlayerProps {
  /** Immediately-playable preview URL. Optional when `refreshShortId` is set. */
  previewUrl?: string;
  /** Short ID used to refresh an expired/missing Deezer preview URL via the
   *  `/api/share-preview/:shortId` proxy. When set without `previewUrl`, the
   *  player mounts in a loading state and fetches on mount. */
  refreshShortId?: string;
  trackTitle: string;
  onStatusChange?: (status: AudioPreviewStatus) => void;
  /** Settings-ready visual mode for the VFD progress section. */
  progressVariant?: PlayerProgressVariant;
  /** Settings-ready progress stepping mode for the VFD progress section. */
  progressGranularity?: PlayerProgressGranularity;
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

const SPECTRUM_BAND_COUNT = 25;
const SPECTRUM_UPDATE_MS = 50;

type BrowserAudioContextConstructor = typeof AudioContext;

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
  return rawBands.map((band) => Math.min(1, band * frameGain));
}

export function AudioPreviewPlayer({
  previewUrl,
  refreshShortId,
  trackTitle,
  onStatusChange,
  progressVariant = "marker",
  progressGranularity = "pixels",
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
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const spectrumFrameRef = useRef<number | null>(null);
  const spectrumDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const spectrumLastUpdateRef = useRef(0);
  const [spectrumBands, setSpectrumBands] = useState<number[] | null>(null);

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
          dispatch({ type: "URL_UNAVAILABLE" });
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        dispatch({ type: "URL_UNAVAILABLE" });
      }
    })();
    return () => controller.abort();
  }, [previewUrl, refreshShortId]);

  const stopSpectrumLoop = useCallback(() => {
    if (spectrumFrameRef.current !== null) cancelAnimationFrame(spectrumFrameRef.current);
    spectrumFrameRef.current = null;
    spectrumLastUpdateRef.current = 0;
    setSpectrumBands(null);
  }, []);

  const teardownSpectrum = useCallback(() => {
    stopSpectrumLoop();
    mediaSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    mediaSourceRef.current = null;
    analyserRef.current = null;
    spectrumDataRef.current = null;
  }, [stopSpectrumLoop]);

  const startSpectrumLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || spectrumFrameRef.current !== null) return;

    const data = spectrumDataRef.current ?? new Uint8Array(analyser.frequencyBinCount);
    spectrumDataRef.current = data;

    const tick = (now: number) => {
      spectrumFrameRef.current = requestAnimationFrame(tick);
      if (now - spectrumLastUpdateRef.current < SPECTRUM_UPDATE_MS) return;
      spectrumLastUpdateRef.current = now;
      analyser.getByteFrequencyData(data);
      setSpectrumBands(resolveSpectrumBands(data, SPECTRUM_BAND_COUNT));
    };

    spectrumFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureSpectrumAnalyzer = useCallback(async (audio: HTMLAudioElement) => {
    if (analyserRef.current) {
      if (audioContextRef.current?.state === "suspended") await audioContextRef.current.resume();
      return;
    }

    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) return;

    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    if (audioContext.state === "suspended") await audioContext.resume();

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.74;

    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    mediaSourceRef.current = source;
    analyserRef.current = analyser;
    spectrumDataRef.current = new Uint8Array(analyser.frequencyBinCount);
  }, []);

  // Bind the <audio> element when a URL becomes available. The only
  // dependency is the URL itself — playback state transitions (play/pause)
  // must NOT retear the audio element down, or the play() promise starting
  // the transition gets aborted and surfaces as a spurious "unavailable".
  useEffect(() => {
    if (!effectiveUrl) return;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.src = effectiveUrl;

    const handleLoadedMetadata = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      dispatch({ type: "METADATA_LOADED", duration: dur });
    };
    const handleTimeUpdate = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      dispatch({ type: "TIME_UPDATE", currentTime: audio.currentTime, duration: dur });
    };
    const handleEnded = () => {
      stopSpectrumLoop();
      dispatch({ type: "ENDED" });
    };
    const handleError = () => dispatch({ type: "ERROR" });

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
      teardownSpectrum();
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [effectiveUrl, stopSpectrumLoop, teardownSpectrum]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.phase === "idle" || state.phase === "paused") {
      void ensureSpectrumAnalyzer(audio)
        .then(() => {
          if (!audio.paused) startSpectrumLoop();
        })
        .catch(() => setSpectrumBands(null));
      audio
        .play()
        .then(() => {
          dispatch({ type: "PLAY" });
          startSpectrumLoop();
        })
        .catch(() => dispatch({ type: "ERROR" }));
    } else if (state.phase === "playing") {
      audio.pause();
      stopSpectrumLoop();
      dispatch({ type: "PAUSE" });
    }
  }, [ensureSpectrumAnalyzer, startSpectrumLoop, state.phase, stopSpectrumLoop]);

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
        currentTime={currentTime}
        duration={duration}
        timeText={timeText}
        ariaLabel={ariaLabel}
        title={isLoading ? t("audio.previewLoading") : isUnavailable ? t("audio.previewUnavailable") : undefined}
        progressVariant={progressVariant}
        progressGranularity={progressGranularity}
        spectrumBands={spectrumBands}
        phosphorColor="rgb(var(--color-accent-rgb-resolved, 127 234 255))"
        onTogglePlay={togglePlay}
      />
    </section>
  );
}
