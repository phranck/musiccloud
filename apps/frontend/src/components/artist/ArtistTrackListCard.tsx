import { type ComponentType, useMemo } from "react";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { TrackViewToggle } from "@/components/artist/TrackViewToggle";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { useTrackViewMorph } from "@/hooks/useTrackViewMorph";

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
  /** localStorage key for this card's persisted list/grid view (see `ArtistTrackViewKey`). */
  viewStorageKey: string;
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

/**
 * The desktop artist-column track card: a titled section card around the shared
 * track content, with a header toggle switching list vs. grid. Both views show
 * every item and scroll within a capped height (no pager). One protocol-driven
 * component for both the artist's own popular tracks
 * and similar-artist tracks — it takes already-normalized {@link items} plus
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
  viewStorageKey,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackListCardProps) {
  const skeletonAllowed = useSkeletonAllowed();
  const { view, setView, containerRef } = useTrackViewMorph(viewStorageKey);
  // Only offer the list/grid switch once there are rows to switch between (the
  // skeleton phase has none). Memoized so the element identity is stable across
  // renders and not flagged as inline JSX-as-prop (jsx-no-jsx-as-prop).
  const headerAddOn = useMemo(
    () => (items.length > 0 ? <TrackViewToggle view={view} onChange={setView} /> : undefined),
    [items.length, view, setView],
  );
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
    <ArtistCardShell title={title} headerAddOn={headerAddOn} isRefreshing={isRefreshing}>
      <div className="px-3 pt-0 pb-3">
        <ArtistSectionWell
          showInitialSkeleton={showInitialSkeleton}
          Skeleton={Skeleton}
          hasContent={items.length > 0}
          swapKey={swapKey}
        >
          <div ref={containerRef}>
            <ArtistTrackContent
              view={view}
              items={items}
              cardSignal={cardSignal}
              onTrackResolve={onTrackResolve}
              onResolveStart={onResolveStart}
            />
          </div>
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
