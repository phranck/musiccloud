/**
 * PlaybackButton - Tape deck style play/pause button
 *
 * Square EmbossedButton with a backlit icon that glows in the accent color.
 */

import { EmbossedButton, embossedStyle } from "@/components/ui/EmbossedButton";
import { cn } from "@/lib/utils";

interface PlaybackButtonProps {
  isPlaying: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  size?: "small" | "medium" | "large";
}

const sizeClasses = {
  small: "w-8 h-8",
  medium: "w-10 h-10",
  large: "w-12 h-12",
};

const iconSizes = {
  small: "w-5 h-5",
  medium: "w-6 h-6",
  large: "w-7 h-7",
};

export function PlaybackButton({
  isPlaying,
  onClick,
  disabled = false,
  ariaLabel = isPlaying ? "Pause" : "Play",
  title,
  size = "medium",
}: PlaybackButtonProps) {
  const accentColor = "rgb(var(--color-accent-rgb))";
  const iconColor = disabled ? "rgba(255,255,255,0.2)" : accentColor;
  const glowFilter = disabled ? "none" : isPlaying ? `drop-shadow(0 0 6px ${accentColor}) drop-shadow(0 0 12px rgba(var(--color-accent-rgb) / 0.3))` : `drop-shadow(0 0 4px rgba(var(--color-accent-rgb) / 0.3))`;

  return (
    <EmbossedButton
      as="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        "flex-shrink-0 flex items-center justify-center rounded-lg",
        "px-0 py-0",
        sizeClasses[size],
        disabled && "cursor-not-allowed opacity-50",
      )}
      style={embossedStyle}
    >
      {isPlaying ? (
        <svg
          className={iconSizes[size]}
          viewBox="0 0 24 24"
          fill={iconColor}
          aria-hidden="true"
          style={{ filter: glowFilter }}
        >
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg
          className={cn(iconSizes[size], "translate-x-px")}
          viewBox="0 0 24 24"
          fill={iconColor}
          aria-hidden="true"
          style={{ filter: glowFilter }}
        >
          <path d="M8 5.14v14l11-7-11-7z" />
        </svg>
      )}
    </EmbossedButton>
  );
}
