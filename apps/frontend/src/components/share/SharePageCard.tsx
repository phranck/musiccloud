/**
 * SharePageCard – React island for the share page (/[shortId]).
 *
 * Wraps MediaCard with a ShareContentConfiguration. The config is passed
 * as a plain JSON-serializable prop from the Astro SSR page so no
 * client-side data fetching is needed.
 *
 * `platformsLabelKey` from config is resolved via useT() so the label
 * updates immediately when the user switches locale, without a full reload.
 * The SSR-baked `platformsLabel` serves as the initial fallback.
 */
import { useT } from "@/i18n/context";
import { MediaCard } from "@/components/cards/MediaCard";
import type { ShareContentConfiguration } from "@/lib/types/media-card";

interface SharePageCardProps {
  config: ShareContentConfiguration;
}

export function SharePageCard({ config }: SharePageCardProps) {
  const t = useT();
  return (
    <MediaCard
      content={{ ...config, platformsLabel: t(config.platformsLabelKey) }}
      animated={false}
    />
  );
}
