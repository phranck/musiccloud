import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { MediaCardHead } from "@/components/cards/MediaCardHead";
import { PlatformsWell } from "@/components/cards/PlatformsWell";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import {
  derivePlatformsVisibility,
  isShareableContent,
  type MediaCardContentConfiguration,
} from "@/lib/types/media-card";

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
  const { showGrid, showInfoOnly } = derivePlatformsVisibility(content);
  return (
    <MediaCardHead
      content={content}
      animated={animated}
      className={className}
      onPreviewStatusChange={onPreviewStatusChange}
      srAnnouncement={srAnnouncement}
    >
      <CollapsibleSection visible={showGrid} sectionClass="p-[var(--mc-pad-card,0.75rem)]">
        {showGrid && <PlatformsWell content={content} label={content.platformsLabel} />}
      </CollapsibleSection>

      <CollapsibleSection visible={showInfoOnly} sectionClass="p-[var(--mc-pad-card,0.75rem)]">
        {showInfoOnly && <p className="text-sm text-text-secondary text-center">{content.platformsInfo}</p>}
      </CollapsibleSection>
    </MediaCardHead>
  );
}
