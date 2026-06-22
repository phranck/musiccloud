import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { MediaCardHead } from "@/components/cards/MediaCardHead";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { isShareableContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";

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
  const srAnnouncement = isShareableContent(content) ? content.srAnnouncement : undefined;
  const showPlatforms = content.platforms.length > 0;
  const showPlatformsInfoOnly = content.platforms.length === 0 && !!content.platformsInfo;
  return (
    <MediaCardHead
      content={content}
      animated={animated}
      className={className}
      onPreviewStatusChange={onPreviewStatusChange}
      srAnnouncement={srAnnouncement}
    >
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
    </MediaCardHead>
  );
}
