import { memo } from "react";
import { cn, PLATFORM_CONFIG, type Platform } from "../lib/utils";
import { PlatformIcon } from "./PlatformIcon";

interface PlatformButtonProps {
  platform: Platform;
  url: string;
  songTitle: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "odesli" | "cache";
  className?: string;
}

/**
 * Platform button for available services only.
 * Unavailable platforms are not rendered (see ResultsPanel).
 */
export const PlatformButton = memo(function PlatformButton({
  platform,
  url,
  songTitle,
  displayName,
  matchMethod,
  className,
}: PlatformButtonProps) {
  const config = PLATFORM_CONFIG[platform];
  const label = displayName || config.label;
  const isDev = import.meta.env.DEV;

  // Map matchMethod to display text
  const sourceLabel =
    matchMethod === "odesli"
      ? "via Odesli"
      : matchMethod === "isrc"
        ? "direct (ISRC)"
        : matchMethod === "search"
          ? "via search"
          : matchMethod === "cache"
            ? "cached"
            : null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${songTitle} on ${label} (opens in new window)`}
      className={cn(
        "flex items-center gap-3 px-5 py-2.5 rounded-xl",
        "transition-all duration-150",
        "min-h-[48px] w-full",
        "bg-white/[0.06]",
        "glass-fallback",
        "border border-white/[0.10]",
        "hover:bg-white/[0.10] hover:scale-[1.03] hover:shadow-[0_0_16px_var(--platform-color)]",
        "focus-visible:bg-white/[0.10] focus-visible:scale-[1.03] focus-visible:shadow-[0_0_16px_var(--platform-color)]",
        "active:scale-[0.97]",
        className,
      )}
      style={{ "--platform-color": `${config.color}60` } as React.CSSProperties}
    >
      <PlatformIcon platform={platform} className="w-8 h-8 flex-shrink-0" colored={true} />
      <div className="flex-1">
        <span className="font-medium text-base text-text-primary tracking-[0]" style={{ fontFamily: "var(--font-condensed)" }}>{label}</span>
        {isDev && sourceLabel && <div className="text-xs text-text-muted">{sourceLabel}</div>}
      </div>
      <svg
        className="w-4 h-4 text-text-muted flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
});
