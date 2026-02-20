import { useReducer, useRef, useState, useCallback } from "react";
import { useT } from "@/i18n/context";

interface AudioPreviewPlayerProps {
  previewUrl: string;
  trackTitle: string;
  onUnavailable?: () => void;
}

type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";

type PlayerAction =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "PLAYING" }
  | { type: "RESET" }
  | { type: "ERROR" };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "PLAY":
      return state === "idle" || state === "paused" ? "loading" : state;
    case "PLAYING":
      return state === "loading" || state === "paused" ? "playing" : state;
    case "PAUSE":
      return state === "playing" ? "paused" : state;
    case "RESET":
      return "idle";
    case "ERROR":
      return "error";
    default:
      return state;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPreviewPlayer({ previewUrl, trackTitle, onUnavailable }: AudioPreviewPlayerProps) {
  const t = useT();
  const [state, dispatch] = useReducer(playerReducer, "idle");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const handlePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    dispatch({ type: "PLAY" });
    audio.play().catch(() => dispatch({ type: "ERROR" }));
  }, []);

  const handlePause = useCallback(() => {
    audioRef.current?.pause();
    dispatch({ type: "PAUSE" });
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || audio.duration === 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  }, []);

  const handleProgressKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || audio.duration === 0) return;
    const step = 5; // seconds
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      audio.currentTime = Math.min(audio.duration, audio.currentTime + step);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - step);
    } else if (e.key === "Home") {
      e.preventDefault();
      audio.currentTime = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      audio.currentTime = audio.duration;
    }
  }, []);

  const isPlaying = state === "playing";
  const isLoading = state === "loading";
  const progress = duration > 0 ? (elapsed / duration) * 100 : 0;

  if (state === "error") return null;

  return (
    <div className="flex items-center gap-3 w-full">
      <audio
        ref={audioRef}
        src={previewUrl}
        preload="metadata"
        onPlaying={() => {
          const audio = audioRef.current;
          if (audio && audio.duration > 0) setDuration(Math.round(audio.duration));
          dispatch({ type: "PLAYING" });
        }}
        onDurationChange={() => {
          const audio = audioRef.current;
          if (audio && audio.duration > 0) setDuration(Math.round(audio.duration));
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (audio) setElapsed(Math.floor(audio.currentTime));
        }}
        onEnded={() => {
          const audio = audioRef.current;
          if (audio) audio.currentTime = 0;
          setElapsed(0);
          dispatch({ type: "RESET" });
        }}
        onError={() => {
          dispatch({ type: "ERROR" });
          onUnavailable?.();
        }}
      />

      <button
        type="button"
        onClick={isPlaying ? handlePause : handlePlay}
        aria-label={isPlaying ? t("audio.pausePreview") : t("audio.playPreview")}
        disabled={isLoading}
        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 transition-colors disabled:opacity-50"
      >
        {isLoading ? (
          <svg className="w-4 h-4 animate-spin text-white/70" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : isPlaying ? (
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white translate-x-px" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div
        ref={progressRef}
        role="slider"
        tabIndex={0}
        aria-valuenow={elapsed}
        aria-valuemin={0}
        aria-valuemax={duration || 30}
        aria-label={trackTitle}
        onClick={handleProgressClick}
        onKeyDown={handleProgressKeyDown}
        className="flex-1 h-1 bg-white/20 rounded-full cursor-pointer relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent rounded-full"
      >
        <div
          className="absolute inset-y-0 left-0 bg-accent rounded-full transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {state !== "idle" ? (
        <span className="text-xs tabular-nums flex-shrink-0 text-accent">
          {formatTime(elapsed)}
          {duration > 0 && <span className="opacity-60"> / {formatTime(duration)}</span>}
        </span>
      ) : duration > 0 ? (
        <span className="text-xs tabular-nums flex-shrink-0 text-text-muted/50">
          {formatTime(duration)}
        </span>
      ) : null}
    </div>
  );
}
