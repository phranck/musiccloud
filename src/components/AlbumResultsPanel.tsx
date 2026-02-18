import { useT } from "../i18n/context";
import { PLATFORM_CONFIG } from "../lib/utils";
import { MediaCard, type AlbumContentConfiguration, type PlatformLink } from "./MediaCard";

export interface AlbumResult {
  title: string;
  artist: string;
  releaseDate?: string;
  totalTracks?: number;
  artworkUrl: string;
  label?: string;
  upc?: string;
  platforms: PlatformLink[];
  shareUrl: string;
}

interface AlbumResultsPanelProps {
  result: AlbumResult;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

export function AlbumResultsPanel({ result, onAlbumArtLoad }: AlbumResultsPanelProps) {
  const t = useT();
  const foundCount = result.platforms.length;
  const year = result.releaseDate?.slice(0, 4);

  const metaParts: string[] = [];
  if (result.totalTracks) metaParts.push(t("results.albumTracks", { count: String(result.totalTracks) }));
  if (year) metaParts.push(year);

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

  const config: AlbumContentConfiguration = {
    type: "album",
    title: result.title,
    artist: result.artist,
    artworkUrl: result.artworkUrl,
    metaLine: metaParts.join(" \u00B7 ") || undefined,
    platforms: result.platforms,
    platformsLabel: t("results.openAlbumOn"),
    platformsInfo,
    shareUrl: result.shareUrl,
    srAnnouncement: t("results.foundAlbum", { title: result.title, artist: result.artist }),
    onAlbumArtLoad,
  };

  return <MediaCard content={config} className="mt-6 sm:mt-8" />;
}
