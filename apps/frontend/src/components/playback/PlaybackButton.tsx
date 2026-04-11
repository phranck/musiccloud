/**
 * PlaybackButton - Tape deck style play/pause button
 *
 * SVG filter creates an inner shadow that follows the icon contours,
 * giving a pressed/recessed look matching the ProgressTrack style.
 */

import { EmbossedButton } from "@/components/ui/EmbossedButton";
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
  const accentColor = disabled ? "rgba(255,255,255,0.2)" : "rgb(var(--color-accent-rgb))";

  return (
    <EmbossedButton
      as="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        "relative flex-shrink-0 flex items-center justify-center rounded-lg",
        "px-0 py-0",
        sizeClasses[size],
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <svg
        className={cn(iconSizes[size], !isPlaying && "-translate-x-[1px]")}
        viewBox="0 0 24 24"
        fill={accentColor}
        aria-hidden="true"
        style={{ filter: disabled ? "none" : "url(#icon-inset)" }}
      >
        <defs>
          <filter id="icon-inset">
            <feFlood floodColor="black" floodOpacity="0.7" />
            <feComposite operator="out" in2="SourceGraphic" />
            <feMorphology operator="dilate" radius="0.5" />
            <feGaussianBlur stdDeviation="0.8" />
            <feOffset dx="1" dy="1" />
            <feComposite operator="atop" in2="SourceGraphic" />
          </filter>
        </defs>
        {isPlaying ? (
          <>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </>
        ) : (
          <path d="M8 5.14v14l11-7-11-7z" />
        )}
      </svg>
    </EmbossedButton>
  );
}
