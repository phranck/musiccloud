/**
 * PlaybackButton - Generic play/pause button
 *
 * Generically reusable component for triggering audio playback.
 * Can be used in any context that needs play/pause functionality.
 *
 * Props:
 * - isPlaying: Whether audio is currently playing
 * - onClick: Handler when button is clicked
 * - disabled: Whether button is disabled
 * - ariaLabel: Accessibility label
 * - title: Tooltip text
 * - size: Button size (default: "medium")
 */

interface PlaybackButtonProps {
  isPlaying: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  size?: "small" | "medium" | "large";
}

const sizeClasses = {
  small: "w-7 h-7",
  medium: "w-9 h-9",
  large: "w-12 h-12",
};

const iconSizes = {
  small: "w-3 h-3",
  medium: "w-4 h-4",
  large: "w-5 h-5",
};

export function PlaybackButton({
  isPlaying,
  onClick,
  disabled = false,
  ariaLabel = isPlaying ? "Pause" : "Play",
  title,
  size = "medium",
}: PlaybackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={`flex-shrink-0 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all duration-[250ms] active:scale-[0.97] ${sizeClasses[size]} ${
        disabled
          ? "bg-white/[0.06] text-white/30 cursor-not-allowed"
          : isPlaying
            ? "hover:scale-[1.08] hover:shadow-[0_0_12px_var(--color-accent-glow)]"
            : "hover:scale-[1.05]"
      }`}
      style={
        disabled
          ? undefined
          : isPlaying
            ? { backgroundColor: "rgb(var(--color-accent-rgb))", color: "var(--color-accent-contrast)" }
            : { backgroundColor: "rgb(var(--color-accent-rgb) / 0.12)", color: "rgba(255, 255, 255, 0.6)" }
      }
    >
      {isPlaying ? (
        <svg className={iconSizes[size]} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg className={`${iconSizes[size]} translate-x-px`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5.14v14l11-7-11-7z" />
        </svg>
      )}
    </button>
  );
}
