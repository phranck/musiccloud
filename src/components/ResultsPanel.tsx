import { cn, type Platform, PLATFORM_CONFIG } from "../lib/utils";
import { GlassCard } from "./GlassCard";
import { PlatformButton } from "./PlatformButton";
import { ShareButton } from "./ShareButton";
import { SongInfo } from "./SongInfo";

export interface PlatformLink {
  platform: Platform;
  url: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "odesli" | "cache";
}

export interface SongResult {
  title: string;
  artist: string;
  album?: string;
  albumArtUrl: string;
  /** Only includes platforms where the song was actually found */
  platforms: PlatformLink[];
  shareUrl: string;
}

interface ResultsPanelProps {
  result: SongResult;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

export function ResultsPanel({ result, onAlbumArtLoad }: ResultsPanelProps) {
  const TOTAL_SERVICES = 3; // Spotify, Apple Music, YouTube
  const foundCount = result.platforms.length;

  let platformsInfo: string | null = null;
  if (foundCount === 1) {
    const serviceName = result.platforms[0].displayName ?? PLATFORM_CONFIG[result.platforms[0].platform]?.label ?? result.platforms[0].platform;
    platformsInfo = `Only available on ${serviceName}.`;
  } else if (foundCount === 2) {
    platformsInfo = "Found on 2 platforms.";
  } else if (foundCount === 0) {
    platformsInfo = "We couldn't find this song on other platforms.";
  }

  return (
    <GlassCard
      elevated
      className={cn(
        "w-full max-w-[480px] mx-auto mt-8",
        "animate-slide-up [animation-fill-mode:both]",
      )}
    >
      {/* Screen reader announcement */}
      <p className="sr-only" aria-live="polite">
        Found {result.title} by {result.artist}
      </p>

      <SongInfo
        title={result.title}
        artist={result.artist}
        album={result.album}
        albumArtUrl={result.albumArtUrl}
        onAlbumArtLoad={onAlbumArtLoad}
      />

      {/* Share action (PRIMARY - most prominent) */}
      <div className="px-5 pb-3">
        <ShareButton
          shareUrl={result.shareUrl}
          songTitle={result.title}
          artistName={result.artist}
        />
      </div>

      {/* Platform buttons - only available platforms shown */}
      {result.platforms.length > 0 && (
        <>
          <div className="px-5 pb-2">
            <p className="text-xs text-text-muted mb-2">
              Open in your favorite app
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 px-5 pb-5">
            {result.platforms.map((p) => (
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
        </>
      )}

      {/* Partial results message */}
      {platformsInfo && (
        <div className="px-5 pb-5 pt-2">
          <p className="text-xs text-text-secondary text-center">
            {platformsInfo}
          </p>
        </div>
      )}
    </GlassCard>
  );
}
