import { ArtistCardCloseButton } from "@/components/artist/ArtistCardCloseButton";
import { ArtistNoticeWell } from "@/components/artist/ArtistNoticeWell";
import { fullWidthEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";

interface ArtistInfoNoticeCardProps {
  /** Optional close handler; when present a close button is shown top-right. */
  onClose?: () => void;
  /** Message explaining why the artist panel has no sections (empty or error). */
  message: string;
}

/**
 * Fallback / empty-state card for the mobile artist panel. Rendered in place of
 * the full {@link import("./ArtistInfoCard").ArtistInfoCard} when the
 * artist-info request returned nothing useful, so the panel explains itself
 * instead of silently disappearing. A full-width `EmbossedCard` with a centered
 * notice and the shared close affordance.
 */
export function ArtistInfoNoticeCard({ onClose, message }: ArtistInfoNoticeCardProps) {
  return (
    <EmbossedCard className={fullWidthEmbossedCardClassName}>
      <div className="relative">
        {onClose && <ArtistCardCloseButton onClose={onClose} />}
        <div className="p-3">
          <ArtistNoticeWell message={message} />
        </div>
      </div>
    </EmbossedCard>
  );
}
