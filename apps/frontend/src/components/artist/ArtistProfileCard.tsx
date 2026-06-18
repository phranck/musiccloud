import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ProfileSkeleton } from "@/components/artist/ArtistCardParts";
import { ArtistProfileSection } from "@/components/artist/ArtistProfileSection";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useT } from "@/i18n/localeContext";

type ArtistProfile = ArtistInfoResponse["profile"];

interface ArtistProfileCardProps {
  profile: ArtistProfile | null | undefined;
  showInitialSkeleton: boolean;
}

export function ArtistProfileCard({ profile, showInitialSkeleton }: ArtistProfileCardProps) {
  const t = useT();
  const profileSwapKey = profile
    ? [profile.imageUrl, profile.genres.join("|"), profile.bioSummary ?? ""].join("::")
    : "profile-empty";

  return (
    <RecessedCard className="p-[var(--mc-pad-artist,0.375rem)] min-h-[108px]">
      <RecessedCard.Body>
        {showInitialSkeleton ? (
          <ProfileSkeleton />
        ) : profile ? (
          <SmoothSwap swapKey={profileSwapKey}>
            <ArtistProfileSection profile={profile} t={t} />
          </SmoothSwap>
        ) : null}
      </RecessedCard.Body>
    </RecessedCard>
  );
}
