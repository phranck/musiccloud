import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { buildSimilarSwapKey } from "@/components/artist/artistSwapKeys";
import { SimilarArtistsSection } from "@/components/artist/SimilarArtistsSection";
import { SimilarArtistsSkeleton } from "@/components/artist/SimilarArtistsSkeleton";
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
 * Desktop similar card: tracks by other artists related to the current one, in
 * a titled section card. Self-hides once loading settles with no entries.
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
  const showSimilar = showInitialSkeleton || (data?.similarArtistTracks?.length ?? 0) > 0;

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className="min-h-[205px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showSimilar) return null;

  return (
    <ArtistCardShell title={title}>
      <div className="px-3 pt-0 pb-3">
        <ArtistSectionWell
          showInitialSkeleton={showInitialSkeleton}
          Skeleton={SimilarArtistsSkeleton}
          hasContent={(data?.similarArtistTracks?.length ?? 0) > 0}
          swapKey={buildSimilarSwapKey(data)}
        >
          <SimilarArtistsSection
            similarArtistTracks={data?.similarArtistTracks ?? []}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
