import { AudioPreviewPlayer } from "@/components/audio/AudioPreviewPlayer";
import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { animatedOuterEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
import { ShareButton } from "@/components/share/ShareButton";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";

export type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";

export type {
  AlbumContentConfiguration,
  MediaCardContentConfiguration,
  MediaCardContentType,
  ShareContentConfiguration,
  SongContentConfiguration,
} from "@/lib/types/media-card";

interface MediaCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  /** Set to false to skip the zoom-in entrance animation (e.g. on the share page) */
  animated?: boolean;
  onPreviewStatusChange?: (status: AudioPreviewStatus) => void;
}

export function MediaCard({ content, className, animated = true, onPreviewStatusChange }: MediaCardProps) {
  const shareable = isShareableContent(content) ? content : null;
  const shareUrl = shareable?.shareUrl;
  const srAnnouncement = shareable?.srAnnouncement;
  const sharePageContent = isSharePageContent(content) ? content : null;
  const shareActionUrl = sharePageContent?.shortUrl ?? shareUrl;
  const audioPreviewKey = [content.shortId ?? "", content.previewUrl ?? "", content.title, content.artist].join("::");
  const showPreview = !!(content.previewUrl || (content.previewRefreshable && content.shortId));
  const showShareActions = !!shareActionUrl;
  const showPlatforms = content.platforms.length > 0;
  const showPlatformsInfoOnly = content.platforms.length === 0 && !!content.platformsInfo;
  return (
    <EmbossedCard className={animatedOuterEmbossedCardClassName(animated, className)}>
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
        statusLine={content.statusLine}
      />

      <CollapsibleSection
        visible={showPreview}
        sectionClass="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)]"
      >
        {showPreview && (
          <AudioPreviewPlayer
            key={audioPreviewKey}
            previewUrl={content.previewUrl}
            refreshShortId={content.previewRefreshable ? content.shortId : undefined}
            trackTitle={content.title}
            onStatusChange={onPreviewStatusChange}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        visible={showShareActions}
        sectionClass="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)]"
      >
        {shareActionUrl && (
          <ShareButton shareUrl={shareActionUrl} songTitle={content.title} artistName={content.artist} />
        )}
      </CollapsibleSection>

      <CollapsibleSection visible={showPlatforms} sectionClass="p-[var(--mc-pad-card,0.75rem)]">
        {showPlatforms && (
          <>
            <RecessedCard className={recessedControlInsetClassName}>
              <RecessedCard.Header>
                <RecessedCard.Header.Title>{content.platformsLabel}</RecessedCard.Header.Title>
              </RecessedCard.Header>
              <RecessedCard.Body>
                <AnimatedPlatformGrid platforms={content.platforms} songTitle={content.title} />
              </RecessedCard.Body>
            </RecessedCard>
            {content.platformsInfo && (
              <p className="text-sm text-text-secondary text-center mt-4">{content.platformsInfo}</p>
            )}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection visible={showPlatformsInfoOnly} sectionClass="p-[var(--mc-pad-card,0.75rem)]">
        {showPlatformsInfoOnly && <p className="text-sm text-text-secondary text-center">{content.platformsInfo}</p>}
      </CollapsibleSection>
    </EmbossedCard>
  );
}
