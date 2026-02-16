import { cn, type Platform, PLATFORM_CONFIG } from "../lib/utils";
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
export function PlatformButton({
  platform,
  url,
  songTitle,
  displayName,
  matchMethod,
  className,
}: PlatformButtonProps) {
  const config = PLATFORM_CONFIG[platform];
  const label = displayName || config.label;
  const isDev = typeof window !== "undefined" && !window.location.hostname.includes("music.cloud");

  // Map matchMethod to display text
  const sourceLabel = matchMethod === "odesli" ? "via Odesli" : matchMethod === "isrc" ? "direct (ISRC)" : matchMethod === "search" ? "via search" : matchMethod === "cache" ? "cached" : null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${songTitle} on ${label} (opens in new window)`}
      className={cn(
        "flex items-center gap-3 px-5 py-3.5 rounded-xl",
        "transition-all duration-100",
        "min-h-[48px] w-full",
        "bg-surface-elevated/80",
        "glass-fallback",
        "border border-white/[0.08]",
        "hover:scale-105 hover:shadow-lg",
        "active:scale-95",
        className,
      )}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 20px ${config.color}40`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <PlatformIcon platform={platform} className="w-8 h-8 flex-shrink-0" colored={true} />
      <div className="flex-1">
        <span className="font-medium text-base text-text-primary">
          Listen on {label}
        </span>
        {isDev && sourceLabel && (
          <div className="text-xs text-text-muted">
            {sourceLabel}
          </div>
        )}
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
}
