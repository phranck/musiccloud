import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import { ArtistTrackList } from "@/components/artist/ArtistTrackList";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { buildTracksSwapKey } from "@/components/artist/artistSwapKeys";
import { TracksSkeleton } from "@/components/artist/TracksSkeleton";
import { PagedListFooter } from "@/components/ui/PagedListFooter";
import { usePagedList } from "@/hooks/usePagedList";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";

interface PopularTracksCardProps {
  /** Card title, supplied by the presentation owner (never hardcoded here). */
  title: string;
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

/**
 * Desktop popular-tracks card: the current artist's own top tracks inside a
 * titled section card, capped at five per page with the pager in the card FOOTER
 * (not the recessed content well). Self-hides once loading settles with no tracks.
 */
export function PopularTracksCard({ title, data, isLoading, onTrackResolve, onResolveStart }: PopularTracksCardProps) {
  const skeletonAllowed = useSkeletonAllowed();
  const showInitialSkeleton = isLoading && !data;
  const isRefreshing = isLoading && !!data;
  const tracks = data?.topTracks ?? [];
  const showTracks = showInitialSkeleton || tracks.length > 0;
  const resetKey = tracks.map((track) => track.deezerUrl).join("|");
  const { page, pageCount, canGoPrevious, canGoNext, goPrevious, goNext } = usePagedList(tracks, { resetKey });

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className="min-h-[186px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showTracks) return null;

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
          Skeleton={TracksSkeleton}
          hasContent={tracks.length > 0}
          swapKey={buildTracksSwapKey(data)}
        >
          <ArtistTrackList
            items={page.map((track) => ({ track }))}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
