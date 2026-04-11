import { PLATFORM_CONFIG, type Platform } from "@musiccloud/shared";
import { memo } from "react";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { trackServiceLinkClick } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface PlatformButtonProps {
  platform: Platform;
  url: string;
  songTitle: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "odesli" | "cache" | "upc" | "isrc-inference";
  className?: string;
}

/**
 * Platform button for available services only.
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

  const sourceLabel =
    matchMethod === "odesli"
      ? "via Odesli"
      : matchMethod === "isrc"
        ? "direct (ISRC)"
        : matchMethod === "upc"
          ? "direct (UPC)"
          : matchMethod === "isrc-inference"
            ? "via track ISRCs"
            : matchMethod === "search"
              ? "via search"
              : matchMethod === "cache"
                ? "cached"
                : null;

  return (
    <EmbossedButton
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${songTitle} on ${label} (opens in new window)`}
      onClick={() => trackServiceLinkClick(platform)}
      className={cn(
        "flex items-center gap-3 px-3 rounded-lg no-underline",
        "min-h-[48px] w-full",
        "hover:shadow-[0_0_16px_var(--platform-color)]",
        "focus-visible:shadow-[0_0_16px_var(--platform-color)]",
        className,
      )}
      style={{ "--platform-color": `${config.color}60` } as React.CSSProperties}
    >
      <PlatformIcon platform={platform} className="w-8 h-8 flex-shrink-0" colored={true} />
      <div className="flex-1">
        <span
          className="font-medium text-base text-text-primary tracking-[0]"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {label}
        </span>
        {isDev && sourceLabel && <div className="text-xs text-text-muted">{sourceLabel}</div>}
      </div>
    </EmbossedButton>
  );
});
