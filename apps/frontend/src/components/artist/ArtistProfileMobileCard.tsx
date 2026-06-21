import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistProfileCard } from "@/components/artist/ArtistProfileCard";
import { sectionCardFooterTextClassName } from "@/components/cards/sectionCardChromeStyles";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { cn } from "@/lib/utils";

type ArtistProfile = ArtistInfoResponse["profile"];

interface ArtistProfileMobileCardProps {
  profile: ArtistProfile | null | undefined;
  providedByLabel?: string;
  showInitialSkeleton: boolean;
  visible: boolean;
}

export function ArtistProfileMobileCard({
  profile,
  providedByLabel,
  showInitialSkeleton,
  visible,
}: ArtistProfileMobileCardProps) {
  return (
    <CollapsibleSection visible={visible} sectionClass="p-[var(--mc-pad-card,0.75rem)]">
      {/* min-h = artwork (96) + 2 × 6 padding = 108 px. Guarantees the
          card never collapses below the artwork height when the profile
          has minimal text (no genres, no similar artists, no bio), so the
          bottom edge doesn't slide up against the artwork. */}
      <ArtistProfileCard profile={profile} showInitialSkeleton={showInitialSkeleton} />
      {providedByLabel && (
        <p className={cn("mc-txt-info", sectionCardFooterTextClassName, "mt-2 px-2")}>{providedByLabel}</p>
      )}
    </CollapsibleSection>
  );
}
