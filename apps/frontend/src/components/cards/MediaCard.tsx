import { AudioPreviewPlayer, type AudioPreviewStatus } from "@/components/audio/AudioPreviewPlayer";
import { outerEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
import { ShareButton } from "@/components/share/ShareButton";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";
import { solidEmbossedCardStyle } from "@/styles/neumorphic";

export type { AudioPreviewStatus } from "@/components/audio/AudioPreviewPlayer";

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

function mediaCardClassName(animated: boolean, className?: string) {
  return cn(outerEmbossedCardClassName, animated && "animate-zoom-in", className);
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
    <EmbossedCard className={mediaCardClassName(animated, className)} style={solidEmbossedCardStyle}>
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

      <CollapsibleSection visible={showPreview} sectionClass="px-3 pt-0 pb-3">
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

      <CollapsibleSection visible={showShareActions} sectionClass="px-3 pt-0 pb-3">
        {shareActionUrl && (
          <ShareButton shareUrl={shareActionUrl} songTitle={content.title} artistName={content.artist} />
        )}
      </CollapsibleSection>

      <CollapsibleSection visible={showPlatforms} sectionClass="p-3">
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

      <CollapsibleSection visible={showPlatformsInfoOnly} sectionClass="p-3">
        {showPlatformsInfoOnly && <p className="text-sm text-text-secondary text-center">{content.platformsInfo}</p>}
      </CollapsibleSection>
    </EmbossedCard>
  );
}
