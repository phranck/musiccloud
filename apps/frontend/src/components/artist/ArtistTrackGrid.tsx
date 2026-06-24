import { ArtistTrackGridItem } from "@/components/artist/ArtistTrackGridItem";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { CardSignal } from "@/lib/analytics/umami";

interface ArtistTrackGridProps {
  /** Normalized rows to render (already filtered + paged by the owner). */
  items: ArtistTrackItem[];
  /** Analytics signal forwarded to each item (e.g. popular vs. similar). */
  cardSignal?: string;
  /** In-place resolve handler forwarded to every item. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before an item begins resolving. */
  onResolveStart?: () => void;
}

/**
 * The shared cover-grid presentation for every artist-column track section —
 * the alternative to {@link import("@/components/artist/ArtistTrackList").ArtistTrackList}.
 * Lays the normalized {@link ArtistTrackItem} rows out as square cover tiles in
 * a responsive 3–4 column track. `auto-fill` (not `auto-fit`) keeps the tiles at
 * their small column size when only a few items are present, instead of
 * stretching them across the full width. The grid scrolls vertically inside a
 * capped-height container (no paging), so a long section stays compact. Pure
 * presentation — the owning card filters the items.
 *
 * @param items - The normalized rows to render.
 * @param cardSignal - Analytics signal forwarded to each item.
 * @param onTrackResolve - In-place resolve handler.
 * @param onResolveStart - Fired right before an item begins resolving.
 */
export function ArtistTrackGrid({
  items,
  cardSignal = CardSignal.PopularTrack,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackGridProps) {
  return (
    <div className="max-h-72 overflow-y-auto overscroll-contain pr-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
        {items.map(({ track, artistLabel }) => (
          <ArtistTrackGridItem
            key={artistLabel ? `${artistLabel}:${track.deezerUrl}` : track.deezerUrl}
            cardSignal={cardSignal}
            track={track}
            artistLabel={artistLabel}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        ))}
      </div>
    </div>
  );
}
