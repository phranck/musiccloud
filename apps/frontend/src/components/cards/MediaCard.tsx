import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { cn } from "@/lib/utils";
import {
  isShareableContent,
  type MediaCardContentConfiguration,
} from "@/lib/types/media-card";
import { AudioPreviewPlayer } from "@/components/audio/AudioPreviewPlayer";
import { GlassCard } from "@/components/cards/GlassCard";
import { PlatformButton } from "@/components/platform/PlatformButton";
import { ShareButton } from "@/components/share/ShareButton";
import { SongInfo } from "@/components/cards/SongInfo";

export type {
  MediaCardContentType,
  MediaCardContentConfiguration,
  SongContentConfiguration,
  AlbumContentConfiguration,
  ShareContentConfiguration,
} from "@/lib/types/media-card";

interface MediaCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  /** Set to false to skip the zoom-in entrance animation (e.g. on the share page) */
  animated?: boolean;
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

      {content.type !== "album" && (
        <div className="border-t border-white/[0.12] px-6 pt-4 pb-4">
          {content.previewUrl ? (
            <AudioPreviewPlayer previewUrl={content.previewUrl} trackTitle={content.title} />
          ) : (
            <p className="text-xs text-text-muted text-center py-1 italic">
              No preview snippet · {content.title}
            </p>
          )}
        </div>
      )}

      {shareUrl && (
        <div className="px-6 pb-5">
          <ShareButton shareUrl={shareUrl} songTitle={content.title} artistName={content.artist} />
        </div>
      )}

      {content.platforms.length > 0 && (
        <div className="border-t border-white/[0.12] px-6 pt-5 pb-6">
          <p className="text-sm uppercase tracking-widest text-text-secondary mb-3">
            {content.platformsLabel}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...content.platforms]
              .sort((a, b) => PLATFORM_CONFIG[a.platform].label.localeCompare(PLATFORM_CONFIG[b.platform].label))
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
