import type { ArtistInfoResponse, ArtistTopTrack } from "@musiccloud/shared";
import { ArtistCardShell, TracksSkeleton, useSkeletonAllowed } from "@/components/artist/ArtistCardParts";
import { PopularTracksSection } from "@/components/artist/PopularTracksSection";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useT } from "@/i18n/context";

interface PopularTracksCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  onTrackResolve?: (track: ArtistTopTrack) => Promise<void>;
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
      <ArtistCardShell>
        <div className="min-h-[186px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showTracks) return null;

  return (
    <ArtistCardShell>
      <div className="p-3">
        <RecessedCard className="p-[0.1875rem]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
          <RecessedCard.Header>
            <RecessedCard.Header.Title>{t("artist.popularTracks")}</RecessedCard.Header.Title>
          </RecessedCard.Header>
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
