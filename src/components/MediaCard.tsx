import { compareByDisplayOrder } from "../lib/constants";
import { cn, type Platform } from "../lib/utils";
import { GlassCard } from "./GlassCard";
import { PlatformButton } from "./PlatformButton";
import { ShareButton } from "./ShareButton";
import { SongInfo } from "./SongInfo";

// ---------------------------------------------------------------------------
// Platform link (shared by all content types)
// ---------------------------------------------------------------------------

export interface PlatformLink {
  platform: Platform;
  url: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "odesli" | "cache" | "upc" | "isrc-inference";
}

// ---------------------------------------------------------------------------
// Content configuration protocol
// ---------------------------------------------------------------------------

export type MediaCardContentType = "song" | "album" | "share";

/**
 * Base configuration shared by all three content types.
 * All translatable strings must be pre-computed by the caller.
 */
export interface MediaCardContentConfiguration {
  type: MediaCardContentType;
  title: string;
  artist: string;
  artworkUrl: string;
  /** Optional: album name shown as third line below artist (song-only) */
  album?: string;
  /** Optional: renders the "E" explicit badge in the meta line (song-only) */
  isExplicit?: boolean;
  /** Pre-computed meta line (e.g. "3:45 · USRC1234" or "12 Tracks · 2024") */
  metaLine?: string;
  platforms: PlatformLink[];
  /** Pre-translated label above the platform grid */
  platformsLabel: string;
  /** Optional pre-translated availability note below the platform grid */
  platformsInfo?: string;
}

/**
 * Track result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface SongContentConfiguration extends MediaCardContentConfiguration {
  type: "song";
  shareUrl: string;
  srAnnouncement?: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

/**
 * Album result on the landing page.
 * Shows ShareButton and sr-announcement.
 */
export interface AlbumContentConfiguration extends MediaCardContentConfiguration {
  type: "album";
  shareUrl: string;
  srAnnouncement?: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

/**
 * Share page (`/[shortId]`).
 * No ShareButton, no sr-announcement, no onAlbumArtLoad callback.
 * All fields are plain data so the config is fully JSON-serializable.
 */
export interface ShareContentConfiguration extends MediaCardContentConfiguration {
  type: "share";
}

// ---------------------------------------------------------------------------
// MediaCard component
// ---------------------------------------------------------------------------

interface MediaCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  /** Set to false to skip the zoom-in entrance animation (e.g. on the share page) */
  animated?: boolean;
}

/** Type guard: true for song and album configs (both have shareUrl / srAnnouncement) */
function isShareableContent(
  content: MediaCardContentConfiguration,
): content is SongContentConfiguration | AlbumContentConfiguration {
  return content.type === "song" || content.type === "album";
}

export function MediaCard({ content, className, animated = true }: MediaCardProps) {
  const shareable = isShareableContent(content) ? content : null;
  const shareUrl = shareable?.shareUrl;
  const srAnnouncement = shareable?.srAnnouncement;
  const onAlbumArtLoad = shareable?.onAlbumArtLoad;

  return (
    <GlassCard
      elevated
      className={cn(
        "w-full max-w-full sm:max-w-lg mx-auto rounded-2xl sm:rounded-[36px]",
        animated && "animate-zoom-in",
        className,
      )}
    >
      {srAnnouncement && (
        <p className="sr-only" aria-live="polite">
          {srAnnouncement}
        </p>
      )}

      <SongInfo
        title={content.title}
        artist={content.artist}
        album={content.album}
        albumArtUrl={content.artworkUrl}
        isExplicit={content.isExplicit}
        metaOverride={content.metaLine}
        onAlbumArtLoad={onAlbumArtLoad}
      />

      {shareUrl && (
        <div className="px-6 pb-5">
          <ShareButton shareUrl={shareUrl} songTitle={content.title} artistName={content.artist} />
        </div>
      )}

      {content.platforms.length > 0 && (
        <div className="border-t border-white/[0.06] px-6 pt-5 pb-6">
          <p className="text-sm uppercase tracking-widest text-text-secondary mb-3">
            {content.platformsLabel}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...content.platforms]
              .sort((a, b) => compareByDisplayOrder(a.platform, b.platform))
              .map((p) => (
                <PlatformButton
                  key={p.platform}
                  platform={p.platform}
                  url={p.url}
                  songTitle={content.title}
                  displayName={p.displayName}
                  matchMethod={p.matchMethod}
                />
              ))}
          </div>
          {content.platformsInfo && (
            <p className="text-sm text-text-secondary text-center mt-4">{content.platformsInfo}</p>
          )}
        </div>
      )}

      {content.platforms.length === 0 && content.platformsInfo && (
        <div className="px-6 pb-6 pt-2">
          <p className="text-sm text-text-secondary text-center">{content.platformsInfo}</p>
        </div>
      )}
    </GlassCard>
  );
}
