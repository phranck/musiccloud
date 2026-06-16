import type { ArtistInfoResponse } from "@musiccloud/shared";
import {
  ArtistCardShell,
  type ArtistInfoStatus,
  ArtistNoticeContent,
  useSkeletonAllowed,
} from "@/components/artist/ArtistCardParts";
import { ArtistProfileCard } from "@/components/artist/ArtistProfileCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { useT } from "@/i18n/context";

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
    return (
      <ArtistCardShell title={t("artist.infoTitle")}>
        <div className="px-3 pt-0 pb-3">
          <RecessedCard className="p-4 min-h-[108px]">
            <RecessedCard.Body>
              <ArtistNoticeContent message={effectiveStatus === "error" ? t("artist.error") : t("artist.empty")} />
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
