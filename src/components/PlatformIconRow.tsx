import { type Platform, PLATFORM_CONFIG } from "../lib/utils";
import { PlatformIcon } from "./PlatformIcon";

const platforms: Platform[] = [
  "spotify",
  "apple-music",
  "youtube",
  "youtube-music",
  "soundcloud",
  "deezer",
  "tidal",
  "audius",
  "napster",
];

function MarqueeStrip({ label }: { label?: boolean }) {
  return (
    <div
      className="flex items-center gap-16 shrink-0 pr-16"
      {...(!label && { "aria-hidden": true })}
    >
      {platforms.map((platform) => (
        <div
          key={platform}
          className="group relative opacity-25 hover:opacity-60 transition-opacity duration-200 flex-shrink-0"
          {...(label && {
            "aria-label": PLATFORM_CONFIG[platform].label,
            role: "img" as const,
          })}
        >
          <PlatformIcon platform={platform} className="w-8 h-8" />
          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 text-[11px] text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {PLATFORM_CONFIG[platform].label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PlatformIconRow() {
  return (
    <div className="fixed bottom-12 left-0 right-0 flex justify-center">
      <div
        className="w-1/2 overflow-x-clip overflow-y-visible pb-6"
        aria-label="Supported platforms"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        }}
      >
        {/*
          Seamless loop: 4 identical strips, each with trailing pr-12.
          Total width = 4 * strip. translateX(-25%) = exactly 1 strip.
          When reset, strip 2 is exactly where strip 1 was. No gap, no stutter.
        */}
        <div className="flex w-max will-change-transform animate-marquee-seamless">
          <MarqueeStrip label />
          <MarqueeStrip />
          <MarqueeStrip />
          <MarqueeStrip />
        </div>
      </div>
    </div>
  );
}
