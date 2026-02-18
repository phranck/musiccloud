import { useT } from "../i18n/context";
import { buildMetaLine, PLATFORM_CONFIG } from "../lib/utils";
import { MediaCard, type SongContentConfiguration } from "./MediaCard";

// Re-export PlatformLink so existing imports from ResultsPanel keep working
export type { PlatformLink } from "./MediaCard";

export interface SongResult {
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  durationMs?: number;
  isrc?: string;
  isExplicit?: boolean;
  albumArtUrl: string;
  /** Only includes platforms where the song was actually found */
  platforms: import("./MediaCard").PlatformLink[];
  shareUrl: string;
}

interface ResultsPanelProps {
  result: SongResult;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

export function ResultsPanel({ result, onAlbumArtLoad }: ResultsPanelProps) {
  const t = useT();
  const foundCount = result.platforms.length;

  let platformsInfo: string | undefined;
  if (foundCount === 1) {
    const serviceName =
      result.platforms[0].displayName ??
      PLATFORM_CONFIG[result.platforms[0].platform]?.label ??
      result.platforms[0].platform;
    platformsInfo = t("results.onlyAvailable", { service: serviceName });
  } else if (foundCount === 2) {
    platformsInfo = t("results.foundOn2");
  } else if (foundCount === 0) {
    platformsInfo = t("results.notFound");
  }

  const config: SongContentConfiguration = {
    type: "song",
    title: result.title,
    artist: result.artist,
    album: result.album,
    artworkUrl: result.albumArtUrl,
    isExplicit: result.isExplicit,
    metaLine: buildMetaLine({ durationMs: result.durationMs, isrc: result.isrc, releaseDate: result.releaseDate }) || undefined,
    platforms: result.platforms,
    platformsLabel: t("results.listenOn"),
    platformsInfo,
    shareUrl: result.shareUrl,
    srAnnouncement: t("results.found", { title: result.title, artist: result.artist }),
    onAlbumArtLoad,
  };

  return <MediaCard content={config} className="mt-6 sm:mt-8" />;
}
