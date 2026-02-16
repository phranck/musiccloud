import type { Platform } from "../lib/utils";
import { SiSpotify, SiApplemusic, SiYoutube, SiSoundcloud } from "react-icons/si";

interface PlatformIconProps {
  platform: Platform;
  className?: string;
  colored?: boolean;
}

export function PlatformIcon({ platform, className = "w-6 h-6", colored = false }: PlatformIconProps) {
  // Brand colors for each service (only used if colored=true)
  const colorMap: Record<Platform, string> = {
    spotify: "#1DB954",
    "apple-music": "#FC3C44",
    youtube: "#FF0000",
    soundcloud: "#FF5500",
  };

  const color = colored ? colorMap[platform] : "currentColor";

  switch (platform) {
    case "spotify":
      return <SiSpotify className={className} color={color} />;
    case "apple-music":
      return <SiApplemusic className={className} color={color} />;
    case "youtube":
      return <SiYoutube className={className} color={color} />;
    case "soundcloud":
      return <SiSoundcloud className={className} color={color} />;
  }
}
