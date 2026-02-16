import { memo } from "react";
import { PLATFORM_CONFIG, type Platform } from "../lib/utils";
import { SiSpotify, SiApplemusic, SiYoutube, SiYoutubemusic, SiSoundcloud, SiTidal, SiNapster } from "react-icons/si";
import { FaDeezer, FaMusic } from "react-icons/fa6";

interface PlatformIconProps {
  platform: Platform;
  className?: string;
  colored?: boolean;
}

export const PlatformIcon = memo(function PlatformIcon({ platform, className = "w-6 h-6", colored = false }: PlatformIconProps) {
  const color = colored ? PLATFORM_CONFIG[platform].color : "currentColor";

  switch (platform) {
    case "spotify":
      return <SiSpotify className={className} color={color} />;
    case "apple-music":
      return <SiApplemusic className={className} color={color} />;
    case "youtube":
      return <SiYoutube className={className} color={color} />;
    case "youtube-music":
      return <SiYoutubemusic className={className} color={color} />;
    case "soundcloud":
      return <SiSoundcloud className={className} color={color} />;
    case "tidal":
      return <SiTidal className={className} color={color} />;
    case "deezer":
      return <FaDeezer className={className} color={color} />;
    case "audius":
      return <FaMusic className={className} color={color} />;
    case "napster":
      return <SiNapster className={className} color={color} />;
  }
});
