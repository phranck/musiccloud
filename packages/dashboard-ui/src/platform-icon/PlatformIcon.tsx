import { getPlatformLabel, PLATFORM_CONFIG, Service, type ServiceId } from "@musiccloud/shared";
import { memo } from "react";
import type { IconType } from "react-icons";
import { FaBug, FaCompactDisc, FaMusic, FaRadio, FaRecordVinyl } from "react-icons/fa6";
import {
  SiApplemusic,
  SiAudiomack,
  SiBandcamp,
  SiBeatport,
  SiMusicbrainz,
  SiNapster,
  SiPandora,
  SiQq,
  SiTidal,
  SiYoutube,
  SiYoutubemusic,
} from "react-icons/si";

import { PLATFORM_ICON_FILES } from "./platformIconFiles.js";

type FileIconService = keyof typeof PLATFORM_ICON_FILES;

/** The glyph color on a tile filled with a brand color. */
const BRAND_TILE_GLYPH_COLOR = "#ffffff";

export interface PlatformIconProps {
  /** The service whose mark is drawn. */
  platform: ServiceId;
  /** Sizes the icon. The default is 24 pixels square. */
  className?: string;
  /**
   * Draws the mark in its brand color, and on a brand-colored tile for the
   * services whose mark is a white glyph on their color. Off, a glyph takes the
   * text color.
   */
  colored?: boolean;
}

/**
 * The mark of a streaming service, used by the site and the dashboard.
 *
 * A service with an image file draws that file from `/icons/`, which is why
 * {@link PLATFORM_ICON_FILES} lists them. Every other service draws a
 * `react-icons` glyph. The `switch` covers every {@link ServiceId}, so a new
 * service is a compile error here until it has a mark.
 */
export const PlatformIcon = memo(function PlatformIcon({
  platform,
  className = "size-6",
  colored = false,
}: PlatformIconProps) {
  const color = colored ? PLATFORM_CONFIG[platform].color : "currentColor";

  switch (platform) {
    case Service.Spotify:
    case Service.SoundCloud:
    case Service.Deezer:
    case Service.Jamendo:
      return <FileIcon service={platform} className={className} />;
    case Service.AppleMusic:
      return colored ? (
        <BrandTile service={platform} Glyph={SiApplemusic} className={className} />
      ) : (
        <SiApplemusic className={className} color={color} />
      );
    case Service.YouTube:
      return colored ? (
        <BrandTile service={platform} Glyph={SiYoutube} className={className} />
      ) : (
        <SiYoutube className={className} color={color} />
      );
    case Service.YouTubeMusic:
      return colored ? (
        <BrandTile service={platform} Glyph={SiYoutubemusic} className={className} />
      ) : (
        <SiYoutubemusic className={className} color={color} />
      );
    case Service.Tidal:
      return <SiTidal className={className} color={color} />;
    case Service.Audius:
      return <FaMusic className={className} color={color} />;
    case Service.Napster:
      return <SiNapster className={className} color={color} />;
    case Service.Pandora:
      return <SiPandora className={className} color={color} />;
    case Service.Qobuz:
      // The Qobuz mark is drawn for a dark ground, so the colored variant
      // gives it one.
      return colored ? (
        <span className={`inline-flex items-center justify-center rounded-lg bg-black ${className}`}>
          <FileIcon service={platform} className="size-[80%] object-contain" />
        </span>
      ) : (
        <FileIcon service={platform} className={className} />
      );
    case Service.Boomplay:
      return <FileIcon service={platform} className={`${className} rounded-full`} />;
    case Service.KKBox:
      return <FaCompactDisc className={className} color={color} />;
    case Service.BandCamp:
      return <SiBandcamp className={className} color={color} />;
    case Service.AudioMack:
      return <SiAudiomack className={className} color={color} />;
    case Service.NetEase:
      return <FileIcon service={platform} className={`${className} rounded-lg`} />;
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
    case Service.MusicBrainz:
      return <SiMusicbrainz className={className} color={color} />;
    default:
      return withoutMark(platform);
  }
});

/** A service's image file, named after the service for screen readers. */
function FileIcon({ service, className }: { service: FileIconService; className: string }) {
  return <img src={`/icons/${PLATFORM_ICON_FILES[service]}`} alt={getPlatformLabel(service)} className={className} />;
}

/** A white glyph on a tile filled with the service's brand color. */
function BrandTile({ service, Glyph, className }: { service: ServiceId; Glyph: IconType; className: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg ${className}`}
      style={{ backgroundColor: PLATFORM_CONFIG[service].color }}
    >
      <Glyph className="size-[60%]" color={BRAND_TILE_GLYPH_COLOR} />
    </span>
  );
}

/**
 * Ends the `switch` in {@link PlatformIcon}. Its parameter is `never`, so a
 * service without a case does not compile. A service id the build does not
 * know yet, arriving from a newer backend, draws nothing.
 */
function withoutMark(_platform: never): null {
  return null;
}
