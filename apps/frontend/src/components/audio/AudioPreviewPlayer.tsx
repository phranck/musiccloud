import { useReducer, useRef, useEffect, useCallback } from "react";

interface AudioPreviewPlayerProps {
  previewUrl: string;
  trackTitle: string;
}

type PlayerState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "playing"; currentTime: number; duration: number }
  | { phase: "paused"; currentTime: number; duration: number }
  | { phase: "error" };

type PlayerAction =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "LOADED"; duration: number }
  | { type: "TIME_UPDATE"; currentTime: number; duration: number }
  | { type: "ENDED" }
  | { type: "ERROR" }
  | { type: "SEEK"; time: number };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "PLAY":
      if (state.phase === "idle") return { phase: "loading" };
      if (state.phase === "paused") return { phase: "playing", currentTime: state.currentTime, duration: state.duration };
      return state;
    case "LOADED":
      if (state.phase === "loading") return { phase: "playing", currentTime: 0, duration: action.duration };
      return state;
    case "PAUSE":
      if (state.phase === "playing") return { phase: "paused", currentTime: state.currentTime, duration: state.duration };
      return state;
    case "TIME_UPDATE":
      if (state.phase === "playing" || state.phase === "paused")
        return { ...state, currentTime: action.currentTime, duration: action.duration };
      return state;
    case "ENDED":
      return { phase: "idle" };
    case "ERROR":
      return { phase: "error" };
    case "SEEK":
      if (state.phase === "playing") return { ...state, currentTime: action.time };
      if (state.phase === "paused") return { ...state, currentTime: action.time };
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
  const [state, dispatch] = useReducer(playerReducer, { phase: "idle" });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "none";
    audio.src = previewUrl;

    audio.addEventListener("canplay", () => {
      dispatch({ type: "LOADED", duration: audio.duration || 30 });
    });
    audio.addEventListener("timeupdate", () => {
      dispatch({ type: "TIME_UPDATE", currentTime: audio.currentTime, duration: audio.duration || 30 });
    });
    audio.addEventListener("ended", () => {
      dispatch({ type: "ENDED" });
    });
    audio.addEventListener("error", () => {
      dispatch({ type: "ERROR" });
    });

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
      dispatch({ type: "PLAY" });
      audio.play().catch(() => dispatch({ type: "ERROR" }));
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

  if (state.phase === "error") return null;

  const isPlaying = state.phase === "playing";
  const isLoading = state.phase === "loading";
  const currentTime = state.phase === "playing" || state.phase === "paused" ? state.currentTime : 0;
  const duration = state.phase === "playing" || state.phase === "paused" ? state.duration : 30;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      role="region"
      aria-label={`Preview: ${trackTitle}`}
      className="flex items-center gap-3"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause preview" : "Play preview"}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors"
      >
        {isLoading ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : isPlaying ? (
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

      <input
        type="range"
        min={0}
        max={duration}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        aria-label="Preview position"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        className="flex-1 h-1 appearance-none rounded-full cursor-pointer
          bg-white/20
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:opacity-0
          hover:[&::-webkit-slider-thumb]:opacity-100
          focus-visible:[&::-webkit-slider-thumb]:opacity-100
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
        style={{ background: `linear-gradient(to right, rgba(255,255,255,0.7) ${progress * 100}%, rgba(255,255,255,0.2) ${progress * 100}%)` }}
      />

      <span className="flex-shrink-0 text-xs tabular-nums text-white/50 min-w-[2.5rem] text-right">
        {state.phase === "idle" || state.phase === "loading"
          ? "0:30"
          : `${formatTime(currentTime)}`}
      </span>
    </div>
  );
}
