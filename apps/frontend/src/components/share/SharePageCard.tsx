/**
 * SharePageCard – wraps MediaCard for both the share page (/[shortId]) and
 * the landing page result view.
 *
 * For type "share" configs (SSR-rendered from Astro), `platformsLabel` is
 * re-translated via useT() so it updates immediately when the user switches
 * locale. For song/album configs (from LandingPage), platformsLabel is already
 * reactive via the calling component's t() and is passed through unchanged.
 */

import { MediaCard } from "@/components/cards/MediaCard";
import { useT } from "@/i18n/context";
import type { MediaCardContentConfiguration, ShareContentConfiguration } from "@/lib/types/media-card";

interface SharePageCardProps {
  config: MediaCardContentConfiguration;
  animated?: boolean;
}

export function SharePageCard({ config, animated = false }: SharePageCardProps) {
  const t = useT();
  const platformsLabel =
    config.type === "share" ? t((config as ShareContentConfiguration).platformsLabelKey) : config.platformsLabel;
  return <MediaCard content={{ ...config, platformsLabel }} animated={animated} />;
}
