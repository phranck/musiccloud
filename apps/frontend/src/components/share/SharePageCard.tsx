/**
 * SharePageCard – wraps MediaCard for both the share page (/[shortId]) and
 * the landing page result view.
 *
 * For type "share" configs (SSR-rendered from Astro), `platformsLabel` is
 * re-translated via useT() so it updates immediately when the user switches
 * locale. For song/album configs (from LandingPage), platformsLabel is already
 * reactive via the calling component's t() and is passed through unchanged.
 */

import { type AudioStatus, MediaCard } from "@/components/cards/MediaCard";
import type { ShareMediaView } from "@/components/share/ShareMediaView.types";
import type { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { useT } from "@/i18n/localeContext";
import {
  type MediaCardContentConfiguration,
  MediaCardContentTypeValue,
  type ShareContentConfiguration,
} from "@/lib/types/media-card";

export type { AudioStatus } from "@/components/cards/MediaCard";

interface SharePageCardProps {
  config: MediaCardContentConfiguration;
  animated?: boolean;
  onPlaybackIntent?: () => void;
  onPreviewStatusChange?: (status: AudioStatus | null) => void;
  previewStatus?: AudioStatus | null;
  shareMediaView?: ShareMediaView;
  vinylSpinState?: VinylSpinState;
}

export function SharePageCard({
  config,
  animated = false,
  onPlaybackIntent,
  onPreviewStatusChange,
  previewStatus,
  shareMediaView,
  vinylSpinState,
}: SharePageCardProps) {
  const t = useT();
  const platformsLabel =
    config.type === MediaCardContentTypeValue.Share
      ? t((config as ShareContentConfiguration).platformsLabelKey)
      : config.platformsLabel;
  return (
    <MediaCard
      content={{ ...config, platformsLabel }}
      animated={animated}
      onPlaybackIntent={onPlaybackIntent}
      onPreviewStatusChange={onPreviewStatusChange}
      previewStatus={previewStatus}
      shareMediaView={shareMediaView}
      vinylSpinState={vinylSpinState}
    />
  );
}
