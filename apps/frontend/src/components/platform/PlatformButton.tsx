import { PLATFORM_CONFIG, type ServiceId } from "@musiccloud/shared";
import { memo } from "react";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { trackServiceLinkClick } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type PlatformButtonSize = "sm" | "md" | "lg";

interface PlatformButtonProps {
  platform: ServiceId;
  url: string;
  songTitle: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "odesli" | "cache" | "upc" | "isrc-inference";
  size?: PlatformButtonSize;
  className?: string;
}

const sizeConfig: Record<PlatformButtonSize, { minH: string; icon: string; text: string; gap: string }> = {
  sm: { minH: "min-h-[36px]", icon: "w-5 h-5", text: "text-xs", gap: "gap-2" },
  md: { minH: "min-h-[42px]", icon: "w-6 h-6", text: "text-sm", gap: "gap-2.5" },
  lg: { minH: "min-h-[48px]", icon: "w-8 h-8", text: "text-base", gap: "gap-3" },
};

/**
 * Platform button for available services only.
 */
export const PlatformButton = memo(function PlatformButton({
  platform,
  url,
  songTitle,
  displayName,
  matchMethod,
  size = "lg",
  className,
}: PlatformButtonProps) {
  const config = PLATFORM_CONFIG[platform];
  const label = displayName || config.label;
  const isDev = import.meta.env.DEV;
  const s = sizeConfig[size];

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
        "flex items-center px-3 rounded-lg no-underline w-full",
        "hover:shadow-[0_0_8px_var(--embossed-glow)] focus-visible:shadow-[0_0_8px_var(--embossed-glow)]",
        s.minH,
        s.gap,
        className,
      )}
      style={{ "--embossed-glow": `${config.color}60` } as React.CSSProperties}
    >
      <PlatformIcon platform={platform} className={cn(s.icon, "flex-shrink-0")} colored={true} />
      <div className="flex-1">
        <span
          className={cn("font-medium text-text-primary tracking-[0]", s.text)}
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {label}
        </span>
        {isDev && sourceLabel && <div className="text-xs text-text-muted">{sourceLabel}</div>}
      </div>
    </EmbossedButton>
  );
});
