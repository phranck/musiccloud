import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell, SimilarArtistsSkeleton, useSkeletonAllowed } from "@/components/artist/ArtistCardParts";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { SimilarArtistsSection } from "@/components/artist/SimilarArtistsSection";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useT } from "@/i18n/localeContext";

interface SimilarArtistsCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  onTrackResolve?: ArtistPanelTrackResolveHandler;
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
      <div className="px-3 pt-0 pb-3">
        <RecessedCard className={recessedControlInsetClassName}>
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
