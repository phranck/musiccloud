import { type Platform, PLATFORM_CONFIG } from "../lib/utils";
import { PlatformIcon } from "./PlatformIcon";

const platforms: Platform[] = [
  "spotify",
  "apple-music",
  "youtube",
  "soundcloud",
  "deezer",
  "tidal",
];

function MarqueeStrip({ label }: { label?: boolean }) {
  return (
    <div
      className="flex items-center gap-12 shrink-0 pr-12"
      {...(!label && { "aria-hidden": true })}
    >
      {platforms.map((platform) => (
        <div
          key={platform}
          className="opacity-25 flex-shrink-0"
          title={PLATFORM_CONFIG[platform].label}
          {...(label && {
            "aria-label": PLATFORM_CONFIG[platform].label,
            role: "img" as const,
          })}
        >
          <PlatformIcon platform={platform} className="w-8 h-8" />
        </div>
      ))}
    </div>
  );
}

export function PlatformIconRow() {
  return (
    <div className="fixed bottom-12 left-0 right-0 flex justify-center">
      <div
        className="w-1/2 overflow-hidden"
        aria-label="Supported platforms"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        }}
      >
        <div className="flex w-max will-change-transform animate-marquee">
          <MarqueeStrip label />
          <MarqueeStrip />
        </div>
      </div>
    </div>
  );
}
