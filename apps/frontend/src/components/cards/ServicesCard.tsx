import { animatedOuterEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { sectionCardHeaderClassName, sectionCardTitleClassName } from "@/components/cards/sectionCardChromeStyles";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

interface ServicesCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
}

export function ServicesCard({ content, className, animated = false }: ServicesCardProps) {
  const showPlatforms = content.platforms.length > 0;
  const showPlatformsInfoOnly = content.platforms.length === 0 && !!content.platformsInfo;

  if (!showPlatforms && !showPlatformsInfoOnly) return null;

  return (
    <EmbossedCard className={animatedOuterEmbossedCardClassName(animated, className)}>
      <EmbossedCard.Header className={sectionCardHeaderClassName}>
        <EmbossedCard.Header.Title className={sectionCardTitleClassName}>
          {content.platformsLabel}
        </EmbossedCard.Header.Title>
      </EmbossedCard.Header>
      <EmbossedCard.Body>
        {showPlatforms && (
          <div className="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)]">
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
          <p className="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)] text-sm text-text-secondary text-center">
            {content.platformsInfo}
          </p>
        )}
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
