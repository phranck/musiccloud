import { useReducer, useRef, useEffect, useCallback } from "react";

interface AudioPreviewPlayerProps {
  previewUrl: string;
  trackTitle: string;
}

/**
 * State machine phases:
 *   probing  — Audio metadata loading silently. Component renders null.
 *   ready    — Metadata confirmed OK. Player appears, waiting for user.
 *   playing  — Playback active.
 *   paused   — Playback paused.
 *   error    — Audio failed or unplayable. Component renders null.
 */
type PlayerState =
  | { phase: "probing" }
  | { phase: "ready"; duration: number }
  | { phase: "playing"; currentTime: number; duration: number }
  | { phase: "paused"; currentTime: number; duration: number }
  | { phase: "error" };

type PlayerAction =
  | { type: "PROBE_OK"; duration: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME_UPDATE"; currentTime: number; duration: number }
  | { type: "ENDED" }
  | { type: "ERROR" }
  | { type: "SEEK"; time: number };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "PROBE_OK":
      if (state.phase === "probing") return { phase: "ready", duration: action.duration };
      return state;
    case "PLAY":
      if (state.phase === "ready") return { phase: "playing", currentTime: 0, duration: state.duration };
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
      if (state.phase === "playing") return { phase: "ready", duration: state.duration };
      return state;
    case "ERROR":
      return { phase: "error" };
    case "SEEK":
      if (state.phase === "playing" || state.phase === "paused")
        return { ...state, currentTime: action.time };
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
  const [state, dispatch] = useReducer(playerReducer, { phase: "probing" });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    // No crossOrigin attribute: browser loads audio in no-cors mode (default for
    // media elements). This works with any CDN regardless of CORS headers.
    // crossOrigin="anonymous" would require the CDN to send Access-Control-Allow-Origin,
    // which Deezer/Spotify CDN nodes do not do consistently.
    audio.preload = "metadata";
    audio.src = previewUrl;

    audio.addEventListener("loadedmetadata", () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      dispatch({ type: "PROBE_OK", duration: dur });
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

    if (state.phase === "ready" || state.phase === "paused") {
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

  // Hidden during probe and on error — only render when playability is confirmed.
  if (state.phase === "probing" || state.phase === "error") return null;

  const isPlaying = state.phase === "playing";
  const currentTime = state.phase === "playing" || state.phase === "paused" ? state.currentTime : 0;
  const duration = state.phase === "ready" ? state.duration : state.duration;
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
        className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-accent text-[var(--color-accent-contrast)] hover:scale-[1.08] hover:shadow-[0_0_12px_var(--color-accent-glow)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all duration-[250ms]"
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

      <input
        type="range"
        min={0}
        max={duration}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        disabled={state.phase === "ready"}
        aria-label="Preview position"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        className="flex-1 h-1 appearance-none rounded-full cursor-pointer
          disabled:cursor-default
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
        style={{
          background: `linear-gradient(to right, rgba(255,255,255,0.7) ${progress * 100}%, rgba(255,255,255,0.2) ${progress * 100}%)`,
        }}
      />

      <span className="flex-shrink-0 text-xs tabular-nums text-white/50 min-w-[2.5rem] text-right">
        {state.phase === "ready" ? formatTime(duration) : formatTime(currentTime)}
      </span>
    </div>
  );
}
