import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { buildSimilarSwapKey } from "@/components/artist/artistSwapKeys";
import { SimilarArtistsSection } from "@/components/artist/SimilarArtistsSection";
import { SimilarArtistsSkeleton } from "@/components/artist/SimilarArtistsSkeleton";
import { hasResolvedTrack } from "@/components/artist/similarArtistTracks";
import { PagedListFooter } from "@/components/ui/PagedListFooter";
import { usePagedList } from "@/hooks/usePagedList";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";

interface SimilarArtistsCardProps {
  /** Card title, supplied by the presentation owner (never hardcoded here). */
  title: string;
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

/**
 * Desktop similar card: tracks by other artists related to the current one, in a
 * titled section card, capped at six per page with the pager in the card FOOTER.
 * Filters to entries that resolved to a playable track before paging, so the page
 * counts match what is shown. Self-hides once loading settles with no entries.
 */
export function SimilarArtistsCard({
  title,
  data,
  isLoading,
  onTrackResolve,
  onResolveStart,
}: SimilarArtistsCardProps) {
  const skeletonAllowed = useSkeletonAllowed();
  const showInitialSkeleton = isLoading && !data;
  const isRefreshing = isLoading && !!data;
  const withTrack = (data?.similarArtistTracks ?? []).filter(hasResolvedTrack);
  const showSimilar = showInitialSkeleton || withTrack.length > 0;
  const resetKey = withTrack.map((entry) => entry.track.deezerUrl).join("|");
  const { page, pageCount, canGoPrevious, canGoNext, goPrevious, goNext } = usePagedList(withTrack, { resetKey });

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className="min-h-[205px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showSimilar) return null;

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
          Skeleton={SimilarArtistsSkeleton}
          hasContent={withTrack.length > 0}
          swapKey={buildSimilarSwapKey(data)}
        >
          <SimilarArtistsSection withTrack={page} onTrackResolve={onTrackResolve} onResolveStart={onResolveStart} />
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
