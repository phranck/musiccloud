import type { ComponentType, ReactNode } from "react";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";

interface ArtistSectionWellProps {
  /**
   * Optional inner title rendered as a `RecessedCard.Header.Title`. The mobile
   * `ArtistInfoCard` passes its section label here; the desktop cards omit it
   * because their title sits on the outer `ArtistCardShell` header instead.
   */
  innerTitle?: ReactNode;
  /**
   * Optional trailing control for the inner header (e.g. the list/grid toggle),
   * rendered as a `RecessedCard.Header.AddOn` beside {@link innerTitle}. Only
   * shows when `innerTitle` is set (mobile), so the desktop cards — whose toggle
   * sits on the outer card header — are unaffected.
   */
  headerAddOn?: ReactNode;
  /** Render the skeleton instead of content during the initial load. */
  showInitialSkeleton: boolean;
  /**
   * Skeleton shown during the initial load — passed as a component (not a JSX
   * element) so it stays render-stable and is instantiated only when needed.
   */
  Skeleton: ComponentType;
  /** Whether resolved content exists; gates the content vs. empty (`null`) branch. */
  hasContent: boolean;
  /** `SmoothSwap` identity key for the content; see `artistSwapKeys`. */
  swapKey: string;
  /** The resolved section content (a `*Section` component). */
  children: ReactNode;
}

/**
 * The inner well shared by all three artist-column list sections (popular
 * tracks, events, similar) across both desktop and mobile. Renders the recessed
 * card surface and the skeleton → cross-faded-content → empty tri-state, so that
 * tri-state and its `SmoothSwap` wiring live in exactly one place instead of
 * being rebuilt per card and per viewport.
 *
 * It deliberately owns neither the outer card chrome nor the title placement:
 * desktop wraps it in `ArtistCardShell` (title on the embossed header), mobile
 * wraps it in a `CollapsibleSection` and passes {@link ArtistSectionWellProps.innerTitle}
 * for an inner recessed header — the two presentations keep their distinct
 * wrappers.
 */
export function ArtistSectionWell({
  innerTitle,
  headerAddOn,
  showInitialSkeleton,
  Skeleton,
  hasContent,
  swapKey,
  children,
}: ArtistSectionWellProps) {
  return (
    <RecessedCard className={recessedControlInsetClassName}>
      {innerTitle && (
        <RecessedCard.Header>
          <RecessedCard.Header.Title>{innerTitle}</RecessedCard.Header.Title>
          {headerAddOn && <RecessedCard.Header.AddOn>{headerAddOn}</RecessedCard.Header.AddOn>}
        </RecessedCard.Header>
      )}
      <RecessedCard.Body>
        {showInitialSkeleton ? <Skeleton /> : hasContent ? <SmoothSwap swapKey={swapKey}>{children}</SmoothSwap> : null}
      </RecessedCard.Body>
    </RecessedCard>
  );
}
