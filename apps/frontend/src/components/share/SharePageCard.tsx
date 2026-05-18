/**
 * SharePageCard – wraps MediaCard for both the share page (/[shortId]) and
 * the landing page result view.
 *
 * For type "share" configs (SSR-rendered from Astro), `platformsLabel` is
 * re-translated via useT() so it updates immediately when the user switches
 * locale. For song/album configs (from LandingPage), platformsLabel is already
 * reactive via the calling component's t() and is passed through unchanged.
 */

import { type AudioPreviewStatus, MediaCard } from "@/components/cards/MediaCard";
import { useT } from "@/i18n/context";
import type { MediaCardContentConfiguration, ShareContentConfiguration } from "@/lib/types/media-card";

export type { AudioPreviewStatus } from "@/components/cards/MediaCard";

interface SharePageCardProps {
  config: MediaCardContentConfiguration;
  animated?: boolean;
  onPreviewStatusChange?: (status: AudioPreviewStatus) => void;
}

export function SharePageCard({ config, animated = false, onPreviewStatusChange }: SharePageCardProps) {
  const t = useT();
  const platformsLabel =
    config.type === "share" ? t((config as ShareContentConfiguration).platformsLabelKey) : config.platformsLabel;
  return (
    <MediaCard
      content={{ ...config, platformsLabel }}
      animated={animated}
      onPreviewStatusChange={onPreviewStatusChange}
    />
  );
}
