import type { ComponentType } from "react";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { PagedListFooter } from "@/components/ui/PagedListFooter";
import { usePagedList } from "@/hooks/usePagedList";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { TrackListView, useTrackListView } from "@/hooks/useTrackListView";

/** Rows per page in list view (matches usePagedList's own default). */
const LIST_PAGE_SIZE = 5;
/**
 * Cover tiles per page in grid view. A multiple of both three and four so a full
 * page fills the responsive 3–4 column track without leaving an orphan row.
 */
const GRID_PAGE_SIZE = 12;

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
 * {@link ArtistTrackList}, capped at five rows per page with the pager in the
 * card FOOTER. One protocol-driven component for both the artist's own popular
 * tracks and similar-artist tracks — it takes already-normalized {@link items}
 * plus presentation config and only displays; the owner ({@link import("@/components/share/AnimatedArtistColumn").AnimatedArtistColumn})
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
  const [view] = useTrackListView(viewStorageKey);
  const showContent = showInitialSkeleton || items.length > 0;
  const resetKey = items.map((item) => item.track.deezerUrl).join("|");
  const pageSize = view === TrackListView.Grid ? GRID_PAGE_SIZE : LIST_PAGE_SIZE;
  const { page, pageCount, canGoPrevious, canGoNext, goPrevious, goNext } = usePagedList(items, { resetKey, pageSize });

  if (showInitialSkeleton && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className={placeholderHeightClass} aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showContent) return null;

  const footer =
    pageCount > 1 ? (
      <PagedListFooter
        pageCount={pageCount}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onPrevious={goPrevious}
        onNext={goNext}
      />
    ) : undefined;

  return (
    <ArtistCardShell title={title} footer={footer} isRefreshing={isRefreshing}>
      <div className="px-3 pt-0 pb-3">
        <ArtistSectionWell
          showInitialSkeleton={showInitialSkeleton}
          Skeleton={Skeleton}
          hasContent={items.length > 0}
          swapKey={swapKey}
        >
          <ArtistTrackContent
            view={view}
            items={page}
            cardSignal={cardSignal}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
