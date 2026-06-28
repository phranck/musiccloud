import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { MediaCardHead } from "@/components/cards/MediaCardHead";
import type { ShareMediaView } from "@/components/share/ShareMediaView.types";
import type { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

interface MediaSummaryCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
  onPlaybackIntent?: () => void;
  onPreviewStatusChange?: (status: AudioPreviewStatus | null) => void;
  previewStatus?: AudioPreviewStatus | null;
  shareMediaView?: ShareMediaView;
  vinylSpinState?: VinylSpinState;
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
  onPlaybackIntent,
  onPreviewStatusChange,
  previewStatus,
  shareMediaView,
  vinylSpinState,
}: MediaSummaryCardProps) {
  return (
    <MediaCardHead
      content={content}
      animated={animated}
      className={className}
      onPlaybackIntent={onPlaybackIntent}
      onPreviewStatusChange={onPreviewStatusChange}
      previewStatus={previewStatus}
      shareMediaView={shareMediaView}
      vinylSpinState={vinylSpinState}
    />
  );
}
