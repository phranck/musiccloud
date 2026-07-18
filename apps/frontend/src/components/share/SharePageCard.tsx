/**
 * SharePageCard – wraps MediaCard for both the share page (/[shortId]) and
 * the landing page result view.
 *
 * Every configuration already carries its final English platform label.
 */

import { type AudioStatus, MediaCard } from "@/components/cards/MediaCard";
import type { ShareMediaView } from "@/components/share/ShareMediaView.types";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

export type { AudioStatus } from "@/components/cards/MediaCard";

interface SharePageCardProps {
  config: MediaCardContentConfiguration;
  animated?: boolean;
  mediaViewToggleLabel?: string;
  onMediaViewToggle?: () => void;
  onPreviewStatusChange?: (status: AudioStatus | null) => void;
  previewStatus?: AudioStatus | null;
  shareMediaView?: ShareMediaView;
}

export function SharePageCard({
  config,
  animated = false,
  mediaViewToggleLabel,
  onMediaViewToggle,
  onPreviewStatusChange,
  previewStatus,
  shareMediaView,
}: SharePageCardProps) {
  return (
    <MediaCard
      content={config}
      animated={animated}
      mediaViewToggleLabel={mediaViewToggleLabel}
      onMediaViewToggle={onMediaViewToggle}
      onPreviewStatusChange={onPreviewStatusChange}
      previewStatus={previewStatus}
      shareMediaView={shareMediaView}
    />
  );
}
