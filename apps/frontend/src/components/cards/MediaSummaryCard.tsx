import { AudioPreviewPlayer } from "@/components/audio/AudioPreviewPlayer";
import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { animatedOuterEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { ShareButton } from "@/components/share/ShareButton";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";

interface MediaSummaryCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
  onPreviewStatusChange?: (status: AudioPreviewStatus) => void;
}

export function MediaSummaryCard({
  content,
  className,
  animated = false,
  onPreviewStatusChange,
}: MediaSummaryCardProps) {
  const shareable = isShareableContent(content) ? content : null;
  const sharePageContent = isSharePageContent(content) ? content : null;
  const shareActionUrl = sharePageContent?.shortUrl ?? shareable?.shareUrl;
  const audioPreviewKey = [content.shortId ?? "", content.previewUrl ?? "", content.title, content.artist].join("::");
  const showPreview = !!(content.previewUrl || (content.previewRefreshable && content.shortId));
  const showShareActions = !!shareActionUrl;

  return (
    <EmbossedCard className={animatedOuterEmbossedCardClassName(animated, className)}>
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
    </EmbossedCard>
  );
}
