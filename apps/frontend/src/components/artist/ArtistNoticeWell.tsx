import { ArtistNoticeContent } from "@/components/artist/ArtistNoticeContent";
import { RecessedCard } from "@/components/cards/RecessedCard";

interface ArtistNoticeWellProps {
  /** The notice message shown centered inside the well. */
  message: string;
}

/**
 * Recessed well wrapping a centered {@link ArtistNoticeContent} message — the
 * empty/error body of the artist cards. Shared by the desktop profile card's
 * error branch and the mobile notice card so the well geometry (padding,
 * min-height) lives in one place; each caller keeps its own outer card chrome.
 */
export function ArtistNoticeWell({ message }: ArtistNoticeWellProps) {
  return (
    <RecessedCard className="p-4 min-h-[108px]">
      <RecessedCard.Body>
        <ArtistNoticeContent message={message} />
      </RecessedCard.Body>
    </RecessedCard>
  );
}
