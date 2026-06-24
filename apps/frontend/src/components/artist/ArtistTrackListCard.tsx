import { type ComponentType, useMemo } from "react";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { TrackViewToggle } from "@/components/artist/TrackViewToggle";
import { PagedListFooter } from "@/components/ui/PagedListFooter";
import { usePagedList } from "@/hooks/usePagedList";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { TrackListView, useTrackListView } from "@/hooks/useTrackListView";

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
 * track content, with a header toggle switching list vs. grid. List view pages
 * five rows with the pager in the card FOOTER; grid view shows every item and
 * scrolls. One protocol-driven component for both the artist's own popular tracks
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
  const [view, setView] = useTrackListView(viewStorageKey);
  const isGrid = view === TrackListView.Grid;
  // Only offer the list/grid switch once there are rows to switch between (the
  // skeleton phase has none). Memoized so the element identity is stable across
  // renders and not flagged as inline JSX-as-prop (jsx-no-jsx-as-prop).
  const headerAddOn = useMemo(
    () => (items.length > 0 ? <TrackViewToggle view={view} onChange={setView} /> : undefined),
    [items.length, view, setView],
  );
  const showContent = showInitialSkeleton || items.length > 0;
  const resetKey = items.map((item) => item.track.deezerUrl).join("|");
  // List view pages five rows with the pager in the footer; grid view shows every
  // item and scrolls instead, so it always renders the full list (no pager).
  const { page, pageCount, canGoPrevious, canGoNext, goPrevious, goNext } = usePagedList(items, { resetKey });

  if (showInitialSkeleton && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className={placeholderHeightClass} aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showContent) return null;

  const footer =
    !isGrid && pageCount > 1 ? (
      <PagedListFooter
        pageCount={pageCount}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onPrevious={goPrevious}
        onNext={goNext}
      />
    ) : undefined;

  return (
    <ArtistCardShell title={title} headerAddOn={headerAddOn} footer={footer} isRefreshing={isRefreshing}>
      <div className="px-3 pt-0 pb-3">
        <ArtistSectionWell
          showInitialSkeleton={showInitialSkeleton}
          Skeleton={Skeleton}
          hasContent={items.length > 0}
          swapKey={swapKey}
        >
          <ArtistTrackContent
            view={view}
            items={isGrid ? items : page}
            cardSignal={cardSignal}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
