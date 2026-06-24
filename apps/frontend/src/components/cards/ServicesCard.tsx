import { outerEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { PlatformsWell } from "@/components/cards/PlatformsWell";
import { SectionCardShell } from "@/components/cards/SectionCardShell";
import { derivePlatformsVisibility, type MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

interface ServicesCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
}

export function ServicesCard({ content, className, animated = false }: ServicesCardProps) {
  const { showGrid, showInfoOnly } = derivePlatformsVisibility(content);

  if (!showGrid && !showInfoOnly) return null;

  return (
    <SectionCardShell
      title={content.platformsLabel}
      animated={animated}
      className={cn(outerEmbossedCardClassName, className)}
    >
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
    </SectionCardShell>
  );
}
