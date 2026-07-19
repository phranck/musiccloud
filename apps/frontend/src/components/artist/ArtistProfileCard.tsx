import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistProfileSection } from "@/components/artist/ArtistProfileSection";
import { ProfileSkeleton } from "@/components/artist/ProfileSkeleton";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";

type ArtistProfile = ArtistInfoResponse["profile"];

interface ArtistProfileCardProps {
  profile: ArtistProfile | null | undefined;
  showInitialSkeleton: boolean;
}

export function ArtistProfileCard({ profile, showInitialSkeleton }: ArtistProfileCardProps) {
  const profileSwapKey = profile
    ? [profile.imageUrl, profile.genres.join("|"), profile.bioSummary ?? ""].join("::")
    : "profile-empty";

  return (
    <RecessedCard className="p-[var(--mc-pad-artist,0.375rem)] min-h-[108px]">
      <RecessedCard.Body className="max-h-[22rem] overflow-y-auto">
        {showInitialSkeleton ? (
          <ProfileSkeleton />
        ) : profile ? (
          <SmoothSwap swapKey={profileSwapKey}>
            <ArtistProfileSection profile={profile} />
          </SmoothSwap>
        ) : null}
      </RecessedCard.Body>
    </RecessedCard>
  );
}
