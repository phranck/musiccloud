import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { buildTracksSwapKey } from "@/components/artist/artistSwapKeys";
import { PopularTracksSection } from "@/components/artist/PopularTracksSection";
import { TracksSkeleton } from "@/components/artist/TracksSkeleton";
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
 * titled section card. Self-hides once loading settles with no tracks, so the
 * artist column shows only its populated cards.
 */
export function PopularTracksCard({ title, data, isLoading, onTrackResolve, onResolveStart }: PopularTracksCardProps) {
  const skeletonAllowed = useSkeletonAllowed();
  const showInitialSkeleton = isLoading && !data;
  const showTracks = showInitialSkeleton || (data?.topTracks.length ?? 0) > 0;

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className="min-h-[186px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showTracks) return null;

  return (
    <ArtistCardShell title={title}>
      <div className="px-3 pt-0 pb-3">
        <ArtistSectionWell
          showInitialSkeleton={showInitialSkeleton}
          Skeleton={TracksSkeleton}
          hasContent={!!data && data.topTracks.length > 0}
          swapKey={buildTracksSwapKey(data)}
        >
          <PopularTracksSection
            tracks={data?.topTracks ?? []}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
