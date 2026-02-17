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
  releaseDate?: string;
  durationMs?: number;
  isrc?: string;
  isExplicit?: boolean;
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
        "w-full max-w-lg mx-auto mt-8 rounded-[36px]",
        "animate-zoom-in",
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
        releaseDate={result.releaseDate}
        durationMs={result.durationMs}
        isrc={result.isrc}
        isExplicit={result.isExplicit}
        albumArtUrl={result.albumArtUrl}
        onAlbumArtLoad={onAlbumArtLoad}
      />

      {/* Share action */}
      <div className="px-6 pb-5">
        <ShareButton
          shareUrl={result.shareUrl}
          songTitle={result.title}
          artistName={result.artist}
        />
      </div>

      {/* Platform buttons */}
      {result.platforms.length > 0 && (
        <div className="border-t border-white/[0.06] px-6 pt-5 pb-6">
          <p className="text-sm uppercase tracking-widest text-text-secondary mb-3">
            Listen on
          </p>
          <div className="grid grid-cols-2 gap-3">
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
          {platformsInfo && (
            <p className="text-sm text-text-secondary text-center mt-4">
              {platformsInfo}
            </p>
          )}
        </div>
      )}

      {/* Partial results (no platforms) */}
      {result.platforms.length === 0 && platformsInfo && (
        <div className="px-6 pb-6 pt-2">
          <p className="text-sm text-text-secondary text-center">
            {platformsInfo}
          </p>
        </div>
      )}
    </GlassCard>
  );
}
