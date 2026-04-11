/**
 * ProgressTrack - Generic audio progress slider
 *
 * Generically reusable component for displaying and controlling audio progress.
 * Can be used in any context that needs playback position control.
 *
 * Props:
 * - currentTime: Current playback position in seconds
 * - duration: Total duration in seconds
 * - isDisabled: Whether slider is disabled
 * - onSeek: Handler when user seeks (receives new time in seconds)
 * - ariaLabel: Accessibility label
 * - ariaValueText: Accessibility value text
 */

interface ProgressTrackProps {
  currentTime: number;
  duration: number;
  isDisabled?: boolean;
  onSeek: (time: number) => void;
  ariaLabel?: string;
  ariaValueText?: string;
}

export function ProgressTrack({
  currentTime,
  duration,
  isDisabled = false,
  onSeek,
  ariaLabel = "Preview position",
  ariaValueText = "",
}: ProgressTrackProps) {
  const progress = duration > 0 ? currentTime / duration : 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    onSeek(time);
  };

  return (
    <div className="relative flex-1 flex items-center h-4">
      {/* Visual track — recessed groove with backlit accent trail */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[8px] rounded-full overflow-hidden">
        {/* Accent fill behind the recessed overlay */}
        <div
          className="absolute inset-0 rounded-full transition-[width] duration-[250ms] ease-linear"
          style={{
            width: `${progress * 100}%`,
            background: "var(--color-accent)",
            boxShadow: "0 0 8px rgba(var(--color-accent-rgb) / 0.5), 0 0 16px rgba(var(--color-accent-rgb) / 0.2)",
          }}
        />
        {/* Recessed overlay — shadow falls on top of the trail */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(255,255,255,0.04)",
            background: "rgba(0,0,0,0.15)",
            borderTop: "1px solid rgba(0,0,0,0.3)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        />
      </div>

      {/* Range input overlaid for interaction; track transparent, thumb visible on hover */}
      <input
        type="range"
        min={0}
        max={duration}
        step={0.1}
        value={currentTime}
        onChange={handleChange}
        disabled={isDisabled}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={ariaValueText}
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
  );
}
