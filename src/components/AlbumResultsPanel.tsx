import { useT } from "../i18n/context";
import { compareByDisplayOrder } from "../lib/constants";
import { cn, PLATFORM_CONFIG, type Platform } from "../lib/utils";
import { GlassCard } from "./GlassCard";
import { PlatformButton } from "./PlatformButton";
import { ShareButton } from "./ShareButton";
import type { PlatformLink } from "./ResultsPanel";

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

  let platformsInfo: string | null = null;
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

  return (
    <GlassCard
      elevated
      className={cn(
        "w-full max-w-full sm:max-w-lg mx-auto mt-6 sm:mt-8 rounded-2xl sm:rounded-[36px]",
        "animate-zoom-in",
      )}
    >
      {/* Screen reader announcement */}
      <p className="sr-only" aria-live="polite">
        {t("results.foundAlbum", { title: result.title, artist: result.artist })}
      </p>

      {/* Album info header */}
      <div className="flex gap-4 p-5 sm:p-6">
        {result.artworkUrl && (
          <img
            src={result.artworkUrl}
            alt={`${result.title} by ${result.artist}`}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover flex-shrink-0 bg-surface-elevated"
            width="96"
            height="96"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            onLoad={(e) => onAlbumArtLoad?.(e.currentTarget as HTMLImageElement)}
          />
        )}
        <div className="flex flex-col justify-center min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-text-secondary mb-1">{t("results.albumBy")}</p>
          <h2 className="text-base sm:text-lg font-semibold text-text-primary leading-tight truncate" title={result.title}>
            {result.title}
          </h2>
          <p className="text-sm text-text-secondary mt-0.5 truncate">{result.artist}</p>
          {metaParts.length > 0 && (
            <p className="text-xs text-text-muted/60 mt-1 font-mono tracking-wide">
              {metaParts.join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Share action */}
      <div className="px-6 pb-5">
        <ShareButton shareUrl={result.shareUrl} songTitle={result.title} artistName={result.artist} />
      </div>

      {/* Platform buttons */}
      {result.platforms.length > 0 && (
        <div className="border-t border-white/[0.06] px-6 pt-5 pb-6">
          <p className="text-sm uppercase tracking-widest text-text-secondary mb-3">{t("results.openAlbumOn")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...result.platforms]
              .sort((a, b) => compareByDisplayOrder(a.platform, b.platform))
              .map((p) => (
                <PlatformButton
                  key={p.platform}
                  platform={p.platform}
                  url={p.url}
                  songTitle={result.title}
                  displayName={p.displayName}
                  matchMethod={p.matchMethod}
                />
              ))}
          </div>
          {platformsInfo && <p className="text-sm text-text-secondary text-center mt-4">{platformsInfo}</p>}
        </div>
      )}

      {result.platforms.length === 0 && platformsInfo && (
        <div className="px-6 pb-6 pt-2">
          <p className="text-sm text-text-secondary text-center">{platformsInfo}</p>
        </div>
      )}
    </GlassCard>
  );
}
