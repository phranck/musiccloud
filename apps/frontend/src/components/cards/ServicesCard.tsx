import { animatedOuterEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { PlatformsWell } from "@/components/cards/PlatformsWell";
import { sectionCardHeaderClassName, sectionCardTitleClassName } from "@/components/cards/sectionCardChromeStyles";
import { derivePlatformsVisibility, type MediaCardContentConfiguration } from "@/lib/types/media-card";

interface ServicesCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
}

export function ServicesCard({ content, className, animated = false }: ServicesCardProps) {
  const { showGrid, showInfoOnly } = derivePlatformsVisibility(content);

  if (!showGrid && !showInfoOnly) return null;

  return (
    <EmbossedCard className={animatedOuterEmbossedCardClassName(animated, className)}>
      <EmbossedCard.Header className={sectionCardHeaderClassName}>
        <EmbossedCard.Header.Title className={sectionCardTitleClassName}>
          {content.platformsLabel}
        </EmbossedCard.Header.Title>
      </EmbossedCard.Header>
      <EmbossedCard.Body>
        {showGrid && (
          <div className="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)]">
            <PlatformsWell content={content} />
          </div>
        )}
        {showInfoOnly && (
          <p className="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)] text-sm text-text-secondary text-center">
            {content.platformsInfo}
          </p>
        )}
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
