import { useCallback, useReducer, useRef, useState } from "react";
import { useT } from "@/i18n/context";

type PlayerState = "idle" | "playing" | "paused" | "ended" | "error";
type PlayerAction =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "ENDED" }
  | { type: "ERROR" };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "PLAY": return "playing";
    case "PAUSE": return "paused";
    case "ENDED": return "ended";
    case "ERROR": return "error";
  }
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface AudioPreviewPlayerProps {
  previewUrl: string;
  trackTitle: string;
}

export function AudioPreviewPlayer({ previewUrl, trackTitle }: AudioPreviewPlayerProps) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playerState, dispatch] = useReducer(playerReducer, "idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const progress = duration > 0 ? currentTime / duration : 0;

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playerState === "playing") {
      audio.pause();
      dispatch({ type: "PAUSE" });
    } else if (playerState === "ended") {
      audio.currentTime = 0;
      audio.play().catch(() => dispatch({ type: "ERROR" }));
      dispatch({ type: "PLAY" });
    } else {
      audio.play().catch(() => dispatch({ type: "ERROR" }));
      dispatch({ type: "PLAY" });
    }
  }, [playerState]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setCurrentTime(audio.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio && isFinite(audio.duration)) setDuration(audio.duration);
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  }, []);

  if (playerState === "error") {
    return (
      <p className="text-xs text-text-muted text-center py-1">{t("audio.previewUnavailable")}</p>
    );
  }

  const isPlaying = playerState === "playing";
  const isEnded = playerState === "ended";
  const durationLabel = duration > 0 ? formatTime(duration) : "0:30";
  const ariaLabel = isPlaying
    ? t("audio.pausePreview")
    : isEnded
      ? t("audio.replayPreview")
      : t("audio.playPreview");

  return (
    <>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={previewUrl}
        preload="none"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => dispatch({ type: "ENDED" })}
        onError={() => dispatch({ type: "ERROR" })}
        aria-label={trackTitle}
      />

      <div className="flex items-center gap-3 w-full">
        {/* Play / Pause / Replay button */}
        <button
          type="button"
          onClick={handlePlayPause}
          aria-label={ariaLabel}
          className="flex-none w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 transition-all duration-150"
        >
          {isPlaying ? (
            // Pause icon
            <svg className="w-4 h-4 text-text-primary" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : isEnded ? (
            // Replay icon
            <svg className="w-4 h-4 text-text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            </svg>
          ) : (
            // Play icon
            <svg className="w-4 h-4 text-text-primary translate-x-px" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress bar */}
        <div
          className="flex-1 h-1.5 bg-white/[0.12] rounded-full cursor-pointer group"
          onClick={handleProgressClick}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label={`${formatTime(currentTime)} / ${durationLabel}`}
        >
          <div
            className="h-full bg-accent rounded-full transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* Time display */}
        <span className="flex-none text-xs tabular-nums text-text-muted min-w-[60px] text-right">
          {formatTime(currentTime)} / {durationLabel}
        </span>
      </div>
    </>
  );
}
