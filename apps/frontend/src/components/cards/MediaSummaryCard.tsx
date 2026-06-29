import type { AudioStatus } from "@/components/audio/AudioStatus";
import { MediaCardHead } from "@/components/cards/MediaCardHead";
import type { ShareMediaView } from "@/components/share/ShareMediaView.types";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

interface MediaSummaryCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
  onPreviewStatusChange?: (status: AudioStatus | null) => void;
  previewStatus?: AudioStatus | null;
  shareMediaView?: ShareMediaView;
}

/**
 * Left-column media card for the share page: the shared {@link MediaCardHead}
 * (cover, info, preview, share actions) without the platform sections. The
 * platform links render in a separate `ServicesCard` below, so this card stays
 * a thin head-only composition rather than collapsing into `MediaCard`.
 */
export function MediaSummaryCard({
  content,
  className,
  animated = false,
  onPreviewStatusChange,
  previewStatus,
  shareMediaView,
}: MediaSummaryCardProps) {
  return (
    <MediaCardHead
      content={content}
      animated={animated}
      className={className}
      onPreviewStatusChange={onPreviewStatusChange}
      previewStatus={previewStatus}
      shareMediaView={shareMediaView}
    />
  );
}
