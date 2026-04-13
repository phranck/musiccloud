/**
 * PlaybackButton - Tape deck style play/pause button
 *
 * Uses EmbossedButton with hasInnerShadow for a contour-following
 * inner shadow on the play/pause icons.
 */

import { EmbossedButton, iconInnerShadow } from "@/components/ui/EmbossedButton";
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
      aria-pressed={isPlaying}
      title={title}
      hasInnerShadow={!disabled}
      pressed={isPlaying && !disabled}
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
        style={{ filter: disabled ? "none" : iconInnerShadow }}
      >
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
