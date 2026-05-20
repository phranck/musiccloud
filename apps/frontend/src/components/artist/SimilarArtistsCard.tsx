import type { ArtistInfoResponse, ArtistTopTrack } from "@musiccloud/shared";
import { ArtistCardShell, SimilarArtistsSkeleton, useSkeletonAllowed } from "@/components/artist/ArtistCardParts";
import { SimilarArtistsSection } from "@/components/artist/SimilarArtistsSection";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useT } from "@/i18n/context";

interface SimilarArtistsCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  onTrackResolve?: (track: ArtistTopTrack) => Promise<void>;
  onResolveStart?: () => void;
}

export function SimilarArtistsCard({ data, isLoading, onTrackResolve, onResolveStart }: SimilarArtistsCardProps) {
  const t = useT();
  const skeletonAllowed = useSkeletonAllowed();
  const showInitialSkeleton = isLoading && !data;
  const showSimilar = showInitialSkeleton || (data?.similarArtistTracks?.length ?? 0) > 0;
  const similarSwapKey =
    data?.similarArtistTracks?.map((entry) => `${entry.artistName}:${entry.track?.deezerUrl ?? ""}`).join("|") ??
    "similar-empty";

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={t("artist.similarArtists")}>
        <div className="min-h-[205px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showSimilar) return null;

  return (
    <ArtistCardShell title={t("artist.similarArtists")}>
      <div className="p-3">
        <RecessedCard className="p-[0.1875rem]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
          <RecessedCard.Body>
            {showInitialSkeleton ? (
              <SimilarArtistsSkeleton />
            ) : data?.similarArtistTracks && data.similarArtistTracks.length > 0 ? (
              <SmoothSwap swapKey={similarSwapKey}>
                <SimilarArtistsSection
                  similarArtistTracks={data.similarArtistTracks}
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
