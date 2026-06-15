import { AudioPreviewPlayer } from "@/components/audio/AudioPreviewPlayer";
import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { outerEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { ShareButton } from "@/components/share/ShareButton";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

interface MediaSummaryCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
  onPreviewStatusChange?: (status: AudioPreviewStatus) => void;
}

// `animate-zoom-in` stays CSS deliberately (MC-029 Task 2.5 exception): the
// card renders in the share page's SSR stream (bot-visible enter, no
// hydration) — see the matching note in MediaCard.tsx.
function mediaCardClassName(animated: boolean, className?: string) {
  return cn(outerEmbossedCardClassName, animated && "animate-zoom-in", className);
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
    <EmbossedCard className={mediaCardClassName(animated, className)}>
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
    </EmbossedCard>
  );
}
