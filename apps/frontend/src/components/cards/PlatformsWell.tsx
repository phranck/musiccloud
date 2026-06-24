import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

interface PlatformsWellProps {
  /** Resolved media content supplying the platform links and song title. */
  content: MediaCardContentConfiguration;
  /**
   * Optional pre-translated label rendered as a `RecessedCard.Header.Title`
   * inside the well. The landing-page `MediaCard` passes it so the title sits
   * on the recessed header; `ServicesCard` omits it because its title lives on
   * the outer `EmbossedCard.Header` instead.
   */
  label?: string;
}

/**
 * Recessed platform well shared by `MediaCard` and `ServicesCard`: a single
 * `AnimatedPlatformGrid` inside a `RecessedCard` body, followed by the optional
 * availability note. The `RecessedCard.Header` is intentionally not baked in —
 * the two cards place the platform title differently, so the title is passed as
 * the `label` prop only when it belongs inside the well.
 *
 * Each card renders exactly one `PlatformsWell`, so each rendered grid is a
 * single `AnimatedPlatformGrid` and the GSAP Flip key stays stable.
 *
 * @param content - The resolved media content configuration.
 * @param label - Optional in-well title (see {@link PlatformsWellProps.label}).
 */
export function PlatformsWell({ content, label }: PlatformsWellProps) {
  return (
    <>
      <RecessedCard className={recessedControlInsetClassName}>
        {label && (
          <RecessedCard.Header>
            <RecessedCard.Header.Title>{label}</RecessedCard.Header.Title>
          </RecessedCard.Header>
        )}
        <RecessedCard.Body>
          <AnimatedPlatformGrid platforms={content.platforms} songTitle={content.title} />
        </RecessedCard.Body>
      </RecessedCard>
      {content.platformsInfo && <p className="text-sm text-text-secondary text-center mt-4">{content.platformsInfo}</p>}
    </>
  );
}
