import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { PopularTrack } from "@/components/artist/PopularTrack";
import { CardSignal } from "@/lib/analytics/umami";

interface ArtistTrackListProps {
  /** Normalized rows to render (already filtered by the owner). */
  items: ArtistTrackItem[];
  /** Analytics signal forwarded to each row (e.g. popular vs. similar). */
  cardSignal?: string;
  /** In-place resolve handler forwarded to every row. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before a row begins resolving. */
  onResolveStart?: () => void;
}

/**
 * The shared list presentation for every artist-column track section — the
 * artist's own popular tracks and the tracks of similar artists, in both the
 * commercial and Creative-Commons modes. Maps the normalized
 * {@link ArtistTrackItem} rows onto {@link PopularTrack} inside a grouped-corner
 * {@link ArtistPanelList}; the `artistLabel` (set only for similar tracks) drives
 * the row's subline. The list scrolls vertically inside a capped-height container
 * (no paging). Pure presentation — the owning card/section filters the items.
 *
 * @param items - The normalized rows to render.
 * @param cardSignal - Analytics signal forwarded to each row.
 * @param onTrackResolve - In-place resolve handler.
 * @param onResolveStart - Fired right before a row begins resolving.
 */
export function ArtistTrackList({
  items,
  cardSignal = CardSignal.PopularTrack,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackListProps) {
  return (
    // Scrolls within a capped height instead of paging, matching the grid view so
    // toggling list/grid keeps the card height stable.
    <div className="max-h-72 overflow-y-auto overscroll-contain">
      <ArtistPanelList frameSelector=".recessed-gradient-border" frameInset={4}>
        {items.map(({ track, artistLabel }) => (
          <PopularTrack
            key={artistLabel ? `${artistLabel}:${track.deezerUrl}` : track.deezerUrl}
            cardSignal={cardSignal}
            track={track}
            artistLabel={artistLabel}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        ))}
      </ArtistPanelList>
    </div>
  );
}
