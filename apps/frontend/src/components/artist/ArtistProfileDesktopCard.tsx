import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistNoticeContent } from "@/components/artist/ArtistNoticeContent";
import { ArtistProfileCard } from "@/components/artist/ArtistProfileCard";
import type { ArtistInfoStatus } from "@/components/artist/artistPanelTypes";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { useT } from "@/i18n/localeContext";

interface ArtistProfileDesktopCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  status?: ArtistInfoStatus;
}

export function ArtistProfileDesktopCard({ data, isLoading, status }: ArtistProfileDesktopCardProps) {
  const t = useT();
  const skeletonAllowed = useSkeletonAllowed();
  const effectiveStatus: ArtistInfoStatus = status ?? (isLoading ? "loading" : data ? "ready" : "empty");

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={t("artist.infoTitle")}>
        <div className="min-h-[132px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }

  if (!isLoading && (!data || !data.profile)) {
    // No profile data: an error still surfaces a notice, but a clean empty
    // profile (e.g. a CC result — Jamendo supplies no artist profile) self-hides
    // so the column shows only its populated cards, matching the
    // PopularTracks/Events/SimilarArtists self-hide behaviour.
    if (effectiveStatus !== "error") return null;
    return (
      <ArtistCardShell title={t("artist.infoTitle")}>
        <div className="px-3 pt-0 pb-3">
          <RecessedCard className="p-4 min-h-[108px]">
            <RecessedCard.Body>
              <ArtistNoticeContent message={t("artist.error")} />
            </RecessedCard.Body>
          </RecessedCard>
        </div>
      </ArtistCardShell>
    );
  }

  const showInitialSkeleton = isLoading && !data;
  const footer = !showInitialSkeleton && data?.profile ? t("artist.profileProvidedBy") : undefined;

  return (
    <ArtistCardShell title={t("artist.infoTitle")} footer={footer}>
      <div className={footer ? "px-3 pt-0 pb-2" : "px-3 pt-0 pb-3"}>
        <ArtistProfileCard profile={data?.profile} showInitialSkeleton={showInitialSkeleton} />
      </div>
    </ArtistCardShell>
  );
}
