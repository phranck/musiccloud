import { AudioPreviewPlayer, type AudioPreviewStatus } from "@/components/audio/AudioPreviewPlayer";
import { outerEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";
import { solidEmbossedCardStyle } from "@/styles/neumorphic";

interface MediaSummaryCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
  onPreviewStatusChange?: (status: AudioPreviewStatus) => void;
}

function mediaCardClassName(animated: boolean, className?: string) {
  return cn(outerEmbossedCardClassName, animated && "animate-zoom-in", className);
}

export function MediaSummaryCard({
  content,
  className,
  animated = false,
  onPreviewStatusChange,
}: MediaSummaryCardProps) {
  const audioPreviewKey = [content.shortId ?? "", content.previewUrl ?? "", content.title, content.artist].join("::");
  const showPreview = !!(content.previewUrl || (content.previewRefreshable && content.shortId));

  return (
    <EmbossedCard className={mediaCardClassName(animated, className)} style={solidEmbossedCardStyle}>
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
            shortId={content.shortId}
            trackTitle={content.title}
            onStatusChange={onPreviewStatusChange}
          />
        )}
      </CollapsibleSection>
    </EmbossedCard>
  );
}
