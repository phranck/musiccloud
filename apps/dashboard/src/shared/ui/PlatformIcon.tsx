import { PLATFORM_CONFIG, type Platform } from "@musiccloud/shared";
import { memo } from "react";
import { FaBug, FaCompactDisc, FaMusic, FaRadio, FaRecordVinyl } from "react-icons/fa6";
import {
  SiApplemusic,
  SiAudiomack,
  SiBandcamp,
  SiBeatport,
  SiNapster,
  SiPandora,
  SiQq,
  SiTidal,
  SiYoutube,
  SiYoutubemusic,
} from "react-icons/si";

interface PlatformIconProps {
  platform: Platform;
  className?: string;
  colored?: boolean;
}

export const PlatformIcon = memo(function PlatformIcon({
  platform,
  className = "w-6 h-6",
  colored = false,
}: PlatformIconProps) {
  const color = colored ? PLATFORM_CONFIG[platform].color : "currentColor";

  switch (platform) {
    case "spotify":
      return <img src="/icons/spotify.svg" alt="Spotify" className={className} />;
    case "apple-music":
      if (colored)
        return (
          <span
            className={`inline-flex items-center justify-center rounded-lg ${className}`}
            style={{ backgroundColor: PLATFORM_CONFIG["apple-music"].color }}
          >
            <SiApplemusic className="w-[60%] h-[60%]" color="#fff" />
          </span>
        );
      return <SiApplemusic className={className} color={color} />;
    case "youtube":
      if (colored)
        return (
          <span
            className={`inline-flex items-center justify-center rounded-lg ${className}`}
            style={{ backgroundColor: PLATFORM_CONFIG.youtube.color }}
          >
            <SiYoutube className="w-[60%] h-[60%]" color="#fff" />
          </span>
        );
      return <SiYoutube className={className} color={color} />;
    case "youtube-music":
      if (colored)
        return (
          <span
            className={`inline-flex items-center justify-center rounded-lg ${className}`}
            style={{ backgroundColor: PLATFORM_CONFIG["youtube-music"].color }}
          >
            <SiYoutubemusic className="w-[60%] h-[60%]" color="#fff" />
          </span>
        );
      return <SiYoutubemusic className={className} color={color} />;
    case "soundcloud":
      return <img src="/icons/soundcloud.svg" alt="SoundCloud" className={className} />;
    case "tidal":
      return <SiTidal className={className} color={color} />;
    case "deezer":
      return <img src="/icons/deezer.svg" alt="Deezer" className={className} />;
    case "audius":
      return <FaMusic className={className} color={color} />;
    case "napster":
      return <SiNapster className={className} color={color} />;
    case "pandora":
      return <SiPandora className={className} color={color} />;
    case "qobuz":
      if (colored)
        return (
          <span className={`inline-flex items-center justify-center rounded-lg bg-black ${className}`}>
            <img src="/icons/qobuz.svg" alt="Qobuz" className="w-[80%] h-[80%] object-contain" />
          </span>
        );
      return <img src="/icons/qobuz.svg" alt="Qobuz" className={className} />;
    case "boomplay":
      return <img src="/icons/boomplay.png" alt="Boomplay" className={`${className} rounded-full`} />;
    case "kkbox":
      return <FaCompactDisc className={className} color={color} />;
    case "bandcamp":
      return <SiBandcamp className={className} color={color} />;
    case "audiomack":
      return <SiAudiomack className={className} color={color} />;
    case "netease":
      return <img src="/icons/netease.png" alt="NetEase Cloud Music" className={`${className} rounded-lg`} />;
    case "qqmusic":
      return <SiQq className={className} color={color} />;
    case "melon":
      return <FaRecordVinyl className={className} color={color} />;
    case "bugs":
      return <FaBug className={className} color={color} />;
    case "jiosaavn":
      return <FaRadio className={className} color={color} />;
    case "beatport":
      return <SiBeatport className={className} color={color} />;
  }
});
