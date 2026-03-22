import { useCallback, useEffect, useReducer, useRef } from "react";
import { PlaybackButton } from "@/components/playback/PlaybackButton";
import { ProgressTrack } from "@/components/playback/ProgressTrack";
import { useT } from "@/i18n/context";

interface AudioPreviewPlayerProps {
  previewUrl: string;
  trackTitle: string;
}

/**
 * AudioPreviewPlayer - Audio preview playback component
 *
 * Orchestrates generic playback components (PlaybackButton, ProgressTrack)
 * for audio preview functionality. Handles audio element lifecycle and state management.
 *
 * State machine phases:
 *   idle     — Ready to play. Duration defaults to 30s, updated once metadata loads.
 *   playing  — Playback active.
 *   paused   — Playback paused.
 *   error    — Audio URL unplayable. Component renders unavailable state.
 */
type PlayerState =
  | { phase: "idle"; duration: number }
  | { phase: "playing"; currentTime: number; duration: number }
  | { phase: "paused"; currentTime: number; duration: number }
  | { phase: "error" };

type PlayerAction =
  | { type: "METADATA_LOADED"; duration: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME_UPDATE"; currentTime: number; duration: number }
  | { type: "ENDED" }
  | { type: "ERROR" }
  | { type: "SEEK"; time: number };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
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
    case "SEEK":
      if (state.phase === "playing" || state.phase === "paused") return { ...state, currentTime: action.time };
      return state;
    default:
      return state;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPreviewPlayer({ previewUrl, trackTitle }: AudioPreviewPlayerProps) {
  const t = useT();
  const [state, dispatch] = useReducer(playerReducer, { phase: "idle", duration: 30 });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.src = previewUrl;

    audio.addEventListener("loadedmetadata", () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      dispatch({ type: "METADATA_LOADED", duration: dur });
    });
    audio.addEventListener("timeupdate", () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      dispatch({ type: "TIME_UPDATE", currentTime: audio.currentTime, duration: dur });
    });
    audio.addEventListener("ended", () => dispatch({ type: "ENDED" }));
    audio.addEventListener("error", () => dispatch({ type: "ERROR" }));

    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [previewUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.phase === "idle" || state.phase === "paused") {
      audio
        .play()
        .then(() => dispatch({ type: "PLAY" }))
        .catch(() => dispatch({ type: "ERROR" }));
    } else if (state.phase === "playing") {
      audio.pause();
      dispatch({ type: "PAUSE" });
    }
  }, [state.phase]);

  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    dispatch({ type: "SEEK", time });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const newTime = Math.min(audio.currentTime + 5, audio.duration || 30);
        audio.currentTime = newTime;
        dispatch({ type: "SEEK", time: newTime });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newTime = Math.max(audio.currentTime - 5, 0);
        audio.currentTime = newTime;
        dispatch({ type: "SEEK", time: newTime });
      }
    },
    [togglePlay],
  );

  const isPlaying = state.phase === "playing";
  const currentTime = state.phase === "playing" || state.phase === "paused" ? state.currentTime : 0;
  const duration = state.phase !== "error" ? state.duration : 30;
  const isUnavailable = state.phase === "error";

  return (
    <section aria-label={`Preview: ${trackTitle}`} className="flex items-center gap-3" onKeyDown={handleKeyDown}>
      <PlaybackButton
        isPlaying={isPlaying}
        onClick={togglePlay}
        disabled={isUnavailable}
        ariaLabel={isUnavailable ? t("audio.previewUnavailable") : isPlaying ? "Pause preview" : "Play preview"}
        title={isUnavailable ? t("audio.previewUnavailable") : undefined}
        size="medium"
      />

      <ProgressTrack
        currentTime={currentTime}
        duration={duration}
        isDisabled={state.phase === "idle" || isUnavailable}
        onSeek={handleSeek}
        ariaLabel="Preview position"
        ariaValueText={`${formatTime(currentTime)} of ${formatTime(duration)}`}
      />

      <span
        className={`flex-shrink-0 text-xs min-w-[2.5rem] text-right ${isUnavailable ? "text-white/30" : "tabular-nums text-white/50"}`}
      >
        {isUnavailable ? t("audio.previewUnavailable") : formatTime(state.phase === "idle" ? duration : currentTime)}
      </span>
    </section>
  );
}
