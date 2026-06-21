import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { PopularTracksSection } from "@/components/artist/PopularTracksSection";
import { TracksSkeleton } from "@/components/artist/TracksSkeleton";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { useT } from "@/i18n/localeContext";

interface PopularTracksCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

export function PopularTracksCard({ data, isLoading, onTrackResolve, onResolveStart }: PopularTracksCardProps) {
  const t = useT();
  const skeletonAllowed = useSkeletonAllowed();
  const showInitialSkeleton = isLoading && !data;
  const showTracks = showInitialSkeleton || (data?.topTracks.length ?? 0) > 0;
  const tracksSwapKey = data?.topTracks.map((track) => track.deezerUrl).join("|") ?? "tracks-empty";

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={t("artist.popularTracks")}>
        <div className="min-h-[186px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showTracks) return null;

  return (
    <ArtistCardShell title={t("artist.popularTracks")}>
      <div className="px-3 pt-0 pb-3">
        <RecessedCard className={recessedControlInsetClassName}>
          <RecessedCard.Body>
            {showInitialSkeleton ? (
              <TracksSkeleton />
            ) : data && data.topTracks.length > 0 ? (
              <SmoothSwap swapKey={tracksSwapKey}>
                <PopularTracksSection
                  tracks={data.topTracks}
                  onTrackResolve={onTrackResolve}
                  onResolveStart={onResolveStart}
                />
              </SmoothSwap>
            ) : null}
          </RecessedCard.Body>
        </RecessedCard>
      </div>
    </ArtistCardShell>
  );
}
