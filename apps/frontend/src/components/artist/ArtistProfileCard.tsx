import type { ArtistInfoResponse } from "@musiccloud/shared";
import {
  ArtistCardShell,
  type ArtistInfoStatus,
  ArtistNoticeContent,
  ProfileSkeleton,
  useSkeletonAllowed,
} from "@/components/artist/ArtistCardParts";
import { ArtistProfileSection } from "@/components/artist/ArtistProfileSection";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useT } from "@/i18n/context";

interface ArtistProfileCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  status?: ArtistInfoStatus;
}

export function ArtistProfileCard({ data, isLoading, status }: ArtistProfileCardProps) {
  const t = useT();
  const skeletonAllowed = useSkeletonAllowed();
  const effectiveStatus: ArtistInfoStatus = status ?? (isLoading ? "loading" : data ? "ready" : "empty");

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell>
        <div className="min-h-[132px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }

  if (!isLoading && (!data || !data.profile)) {
    return (
      <ArtistCardShell>
        <div className="p-3">
          <RecessedCard className="p-4 min-h-[108px]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Body>
              <ArtistNoticeContent message={effectiveStatus === "error" ? t("artist.error") : t("artist.empty")} />
            </RecessedCard.Body>
          </RecessedCard>
        </div>
      </ArtistCardShell>
    );
  }

  const showInitialSkeleton = isLoading && !data;
  const profileSwapKey = data?.profile
    ? [data.profile.imageUrl, data.profile.genres.join("|"), data.profile.bioSummary ?? ""].join("::")
    : "profile-empty";

  return (
    <ArtistCardShell>
      <div className="p-3">
        <RecessedCard className="p-1.5 min-h-[108px]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
          <RecessedCard.Body>
            {showInitialSkeleton ? (
              <ProfileSkeleton />
            ) : data?.profile ? (
              <SmoothSwap swapKey={profileSwapKey}>
                <ArtistProfileSection profile={data.profile} t={t} />
              </SmoothSwap>
            ) : null}
          </RecessedCard.Body>
        </RecessedCard>
        {!showInitialSkeleton && data?.profile && (
          <p className="mt-2 text-xs text-text-muted text-center px-2">{t("artist.profileProvidedBy")}</p>
        )}
      </div>
    </ArtistCardShell>
  );
}
