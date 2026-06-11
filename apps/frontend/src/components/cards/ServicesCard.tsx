import { outerEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { sectionCardHeaderClassName, sectionCardTitleClassName } from "@/components/cards/sectionCardChromeStyles";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";
import { solidEmbossedCardStyle } from "@/styles/neumorphic";

interface ServicesCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
}

// `animate-zoom-in` stays CSS deliberately (MC-029 Task 2.5 exception): the
// card renders in the share page's SSR stream (bot-visible enter, no
// hydration) — see the matching note in MediaCard.tsx.
function mediaCardClassName(animated: boolean, className?: string) {
  return cn(outerEmbossedCardClassName, animated && "animate-zoom-in", className);
}

export function ServicesCard({ content, className, animated = false }: ServicesCardProps) {
  const showPlatforms = content.platforms.length > 0;
  const showPlatformsInfoOnly = content.platforms.length === 0 && !!content.platformsInfo;

  if (!showPlatforms && !showPlatformsInfoOnly) return null;

  return (
    <EmbossedCard className={mediaCardClassName(animated, className)} style={solidEmbossedCardStyle}>
      <EmbossedCard.Header className={sectionCardHeaderClassName}>
        <EmbossedCard.Header.Title className={sectionCardTitleClassName}>
          {content.platformsLabel}
        </EmbossedCard.Header.Title>
      </EmbossedCard.Header>
      <EmbossedCard.Body>
        {showPlatforms && (
          <div className="p-3">
            <RecessedCard className={recessedControlInsetClassName}>
              <RecessedCard.Body>
                <AnimatedPlatformGrid platforms={content.platforms} songTitle={content.title} />
              </RecessedCard.Body>
            </RecessedCard>
            {content.platformsInfo && (
              <p className="text-sm text-text-secondary text-center mt-4">{content.platformsInfo}</p>
            )}
          </div>
        )}
        {showPlatformsInfoOnly && (
          <p className="p-3 text-sm text-text-secondary text-center">{content.platformsInfo}</p>
        )}
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
