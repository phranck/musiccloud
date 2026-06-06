import { PLATFORM_CONFIG, Service, type ServiceId } from "@musiccloud/shared";
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
  platform: ServiceId;
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
    case Service.Spotify:
      return <img src="/icons/spotify.svg" alt="Spotify" className={className} />;
    case Service.AppleMusic:
      if (colored)
        return (
          <span
            className={`inline-flex items-center justify-center rounded-lg ${className}`}
            style={{ backgroundColor: PLATFORM_CONFIG[Service.AppleMusic].color }}
          >
            <SiApplemusic className="w-[60%] h-[60%]" color="#fff" />
          </span>
        );
      return <SiApplemusic className={className} color={color} />;
    case Service.YouTube:
      if (colored)
        return (
          <span
            className={`inline-flex items-center justify-center rounded-lg ${className}`}
            style={{ backgroundColor: PLATFORM_CONFIG[Service.YouTube].color }}
          >
            <SiYoutube className="w-[60%] h-[60%]" color="#fff" />
          </span>
        );
      return <SiYoutube className={className} color={color} />;
    case Service.YouTubeMusic:
      if (colored)
        return (
          <span
            className={`inline-flex items-center justify-center rounded-lg ${className}`}
            style={{ backgroundColor: PLATFORM_CONFIG[Service.YouTubeMusic].color }}
          >
            <SiYoutubemusic className="w-[60%] h-[60%]" color="#fff" />
          </span>
        );
      return <SiYoutubemusic className={className} color={color} />;
    case Service.SoundCloud:
      return <img src="/icons/soundcloud.svg" alt="SoundCloud" className={className} />;
    case Service.Tidal:
      return <SiTidal className={className} color={color} />;
    case Service.Deezer:
      return <img src="/icons/deezer.svg" alt="Deezer" className={className} />;
    case Service.Audius:
      return <FaMusic className={className} color={color} />;
    case Service.Napster:
      return <SiNapster className={className} color={color} />;
    case Service.Pandora:
      return <SiPandora className={className} color={color} />;
    case Service.Qobuz:
      if (colored)
        return (
          <span className={`inline-flex items-center justify-center rounded-lg bg-black ${className}`}>
            <img src="/icons/qobuz.svg" alt="Qobuz" className="w-[80%] h-[80%] object-contain" />
          </span>
        );
      return <img src="/icons/qobuz.svg" alt="Qobuz" className={className} />;
    case Service.Boomplay:
      return <img src="/icons/boomplay.png" alt="Boomplay" className={`${className} rounded-full`} />;
    case Service.KKBox:
      return <FaCompactDisc className={className} color={color} />;
    case Service.BandCamp:
      return <SiBandcamp className={className} color={color} />;
    case Service.AudioMack:
      return <SiAudiomack className={className} color={color} />;
    case Service.NetEase:
      return <img src="/icons/netease.png" alt="NetEase Cloud Music" className={`${className} rounded-lg`} />;
    case Service.QQMusic:
      return <SiQq className={className} color={color} />;
    case Service.Melon:
      return <FaRecordVinyl className={className} color={color} />;
    case Service.Bugs:
      return <FaBug className={className} color={color} />;
    case Service.JioSaavn:
      return <FaRadio className={className} color={color} />;
    case Service.Beatport:
      return <SiBeatport className={className} color={color} />;
  }
});
