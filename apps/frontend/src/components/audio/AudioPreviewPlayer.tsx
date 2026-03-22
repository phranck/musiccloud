import { useCallback, useEffect, useReducer, useRef } from "react";
import { useT } from "@/i18n/context";

interface AudioPreviewPlayerProps {
  previewUrl: string;
  trackTitle: string;
}

/**
 * State machine phases:
 *   idle     — Ready to play. Duration defaults to 30s, updated once metadata loads.
 *   playing  — Playback active.
 *   paused   — Playback paused.
 *   error    — Audio URL unplayable. Component renders null.
 *
 * No probing phase: the player renders immediately. previewUrl is already
 * validated server-side (Deezer ISRC lookup). Probing via loadedmetadata is
 * unreliable — iOS Safari never fires it without user interaction.
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
      // Update duration in any non-error phase without changing play state
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
    // No crossOrigin: browser loads audio in no-cors mode, works with any CDN
    // regardless of CORS headers (Deezer/Spotify CDN nodes are inconsistent).
    audio.preload = "none"; // Don't load until user presses play
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

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
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
  const progress = duration > 0 ? currentTime / duration : 0;
  const isUnavailable = state.phase === "error";

  return (
    <section aria-label={`Preview: ${trackTitle}`} className="flex items-center gap-3" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isUnavailable ? t("audio.previewUnavailable") : isPlaying ? "Pause preview" : "Play preview"}
        disabled={isUnavailable}
        title={isUnavailable ? t("audio.previewUnavailable") : undefined}
        className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all duration-[250ms] active:scale-[0.97] ${
          isUnavailable
            ? "bg-white/[0.06] text-white/30 cursor-not-allowed"
            : isPlaying
              ? "hover:scale-[1.08] hover:shadow-[0_0_12px_var(--color-accent-glow)]"
              : "hover:scale-[1.05]"
        }`}
        style={
          isUnavailable
            ? undefined
            : isPlaying
              ? { backgroundColor: "rgb(var(--color-accent-rgb))", color: "var(--color-accent-contrast)" }
              : { backgroundColor: "rgb(var(--color-accent-rgb) / 0.12)", color: "rgba(255, 255, 255, 0.6)" }
        }
      >
        {isPlaying ? (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-4 h-4 translate-x-px" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.14v14l11-7-11-7z" />
          </svg>
        )}
      </button>

      <div className="relative flex-1 flex items-center h-4">
        {/* Visual track — width transition smooths out the ~4 Hz timeupdate jumps */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-white/12 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-[250ms] ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {/* Range input overlaid for interaction; track transparent, thumb visible on hover */}
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          disabled={state.phase === "idle" || isUnavailable}
          aria-label="Preview position"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer
            disabled:cursor-default
            [&::-webkit-slider-runnable-track]:appearance-none
            [&::-webkit-slider-runnable-track]:bg-transparent
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:opacity-0
            hover:[&::-webkit-slider-thumb]:opacity-100
            focus-visible:[&::-webkit-slider-thumb]:opacity-100
            [&::-moz-range-track]:bg-transparent
            [&::-moz-range-thumb]:w-3
            [&::-moz-range-thumb]:h-3
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:opacity-0
            hover:[&::-moz-range-thumb]:opacity-100
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-white/40"
        />
      </div>

      <span
        className={`flex-shrink-0 text-xs min-w-[2.5rem] text-right ${isUnavailable ? "text-white/30" : "tabular-nums text-white/50"}`}
      >
        {isUnavailable ? t("audio.previewUnavailable") : formatTime(state.phase === "idle" ? duration : currentTime)}
      </span>
    </section>
  );
}
