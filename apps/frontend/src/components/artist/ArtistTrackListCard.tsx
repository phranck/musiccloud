import type { ComponentType } from "react";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import { ArtistTrackView } from "@/components/artist/ArtistTrackView";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";

interface ArtistTrackListCardProps {
  /** Card title, supplied by the presentation owner (never hardcoded here). */
  title: string;
  /** Normalized rows, already extracted + filtered by the owner (the "protocol"). */
  items: ArtistTrackItem[];
  /** Show the skeleton instead of content on the very first load (no data yet). */
  showInitialSkeleton: boolean;
  /** Blur + spinner while a refetch runs with the previous content still on screen. */
  isRefreshing: boolean;
  /** Skeleton component for the initial load (popular vs. similar differ in height). */
  Skeleton: ComponentType;
  /** `SmoothSwap` identity key for the content (see `artistSwapKeys`). */
  swapKey: string;
  /** Class sizing the pre-skeleton placeholder to the skeleton height (no layout shift). */
  placeholderHeightClass: string;
  /** Analytics signal forwarded to each row (popular vs. similar). */
  cardSignal?: string;
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

/**
 * The desktop artist-column track card: a titled section card around the shared
 * track list. Shows every item and scrolls within a capped height (no pager).
 * One protocol-driven component for both the artist's own popular tracks and
 * similar-artist tracks — it takes already-normalized {@link items} plus
 * presentation config and only displays; the owner ({@link import("@/components/share/AnimatedArtistColumn").AnimatedArtistColumn})
 * extracts the items from the artist-info payload. Self-hides once loading settles
 * with no rows.
 *
 * @param props - {@link ArtistTrackListCardProps}.
 */
export function ArtistTrackListCard({
  title,
  items,
  showInitialSkeleton,
  isRefreshing,
  Skeleton,
  swapKey,
  placeholderHeightClass,
  cardSignal,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackListCardProps) {
  const skeletonAllowed = useSkeletonAllowed();
  const showContent = showInitialSkeleton || items.length > 0;

  if (showInitialSkeleton && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className={placeholderHeightClass} aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showContent) return null;

  return (
    <ArtistCardShell title={title} isRefreshing={isRefreshing}>
      <div className="px-3 pt-0 pb-3">
        <ArtistSectionWell
          showInitialSkeleton={showInitialSkeleton}
          Skeleton={Skeleton}
          hasContent={items.length > 0}
          swapKey={swapKey}
        >
          <ArtistTrackView
            items={items}
            cardSignal={cardSignal}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
