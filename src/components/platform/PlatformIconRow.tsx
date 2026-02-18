import { useRef } from "react";
import { PLATFORM_CONFIG, type Platform } from "@/lib/platform/config";
import { PlatformIcon } from "@/components/platform/PlatformIcon";

const platforms: Platform[] = [
  "spotify",
  "apple-music",
  "youtube",
  "youtube-music",
  "soundcloud",
  "deezer",
  "tidal",
  "qobuz",
  "audius",
  "napster",
  "pandora",
  "boomplay",
  "kkbox",
  "bandcamp",
  "audiomack",
  "netease",
  "qqmusic",
  "melon",
  "bugs",
  "jiosaavn",
  "beatport",
];

function MarqueeStrip({ label }: { label?: boolean }) {
  return (
    <div className="flex items-center gap-8 sm:gap-16 shrink-0 pr-8 sm:pr-16" {...(!label && { "aria-hidden": true })}>
      {platforms.map((platform) => (
        <div
          key={platform}
          className="group relative opacity-30 hover:opacity-60 transition-opacity duration-200 flex-shrink-0"
          {...(label && {
            "aria-label": PLATFORM_CONFIG[platform].label,
            role: "img" as const,
          })}
        >
          <PlatformIcon platform={platform} className="w-8 h-8 saturate-0 brightness-200" />
          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 text-[11px] text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {PLATFORM_CONFIG[platform].label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PlatformIconRow() {
  const stripRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    const anim = stripRef.current?.getAnimations()[0];
    if (anim) anim.playbackRate = 0.1;
  };

  const handleMouseLeave = () => {
    const anim = stripRef.current?.getAnimations()[0];
    if (anim) anim.playbackRate = 1;
  };

  return (
    <div className="fixed bottom-10 sm:bottom-12 left-0 right-0 flex justify-center">
      <div
        className="w-[85%] sm:w-3/4 md:w-1/2 pb-6"
        role="presentation"
        aria-hidden="true"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          clipPath: "inset(-30px -60px)",
        }}
      >
        <div ref={stripRef} className="flex w-max will-change-transform animate-marquee-seamless">
          <MarqueeStrip label />
          <MarqueeStrip />
          <MarqueeStrip />
          <MarqueeStrip />
        </div>
      </div>
    </div>
  );
}
