import { cn, type Platform, PLATFORM_CONFIG } from "../lib/utils";
import { PlatformIcon } from "./PlatformIcon";

interface PlatformIconRowProps {
  highlightedPlatforms?: Platform[];
  searching?: boolean;
}

// MVP platforms only (SoundCloud deferred to Phase 2)
const platforms: Platform[] = [
  "spotify",
  "apple-music",
  "youtube",
];

export function PlatformIconRow({
  highlightedPlatforms = [],
  searching = false,
}: PlatformIconRowProps) {
  return (
    <div
      className="flex items-center justify-center gap-4 mt-6"
      aria-label="Supported platforms"
    >
      {platforms.map((platform, i) => {
        const highlighted = highlightedPlatforms.includes(platform);
        const config = PLATFORM_CONFIG[platform];

        return (
          <div
            key={platform}
            className={cn(
              "transition-opacity duration-200",
              highlighted ? "opacity-100" : "opacity-40",
              !highlighted && "hover:opacity-70",
            )}
            style={{
              color: highlighted ? config.color : undefined,
            }}
            title={config.label}
            aria-label={config.label}
            role="img"
          >
            <PlatformIcon platform={platform} className="w-6 h-6" />
          </div>
        );
      })}
    </div>
  );
}
