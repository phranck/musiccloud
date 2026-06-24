import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { trackItemKey } from "@/components/artist/artistTrackItems";
import { PopularTrack } from "@/components/artist/PopularTrack";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
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
  /**
   * Whether each row's cover carries its `data-flip-id`. The live view sets it
   * (default `true`); the cross-fade ghost passes `false` so exactly one element
   * per id exists for the GSAP Flip to match.
   */
  withFlipIds?: boolean;
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
  withFlipIds = true,
}: ArtistTrackListProps) {
  return (
    // Scrolls within a capped height instead of paging, like the grid view. The
    // rounded clip uses the well's inner control radius (`raisedControlRadius`), the
    // exact radius the grouped rows promote to, so the scroll viewport stays
    // concentric with the rows and the well — no gap, no clipped corner.
    <div className="max-h-[248px] overflow-y-auto overscroll-contain" style={{ borderRadius: raisedControlRadius }}>
      <ArtistPanelList frameSelector=".recessed-gradient-border" frameInset={4}>
        {items.map((item) => {
          const key = trackItemKey(item);
          return (
            <PopularTrack
              key={key}
              flipId={withFlipIds ? key : undefined}
              cardSignal={cardSignal}
              track={item.track}
              artistLabel={item.artistLabel}
              onTrackResolve={onTrackResolve}
              onResolveStart={onResolveStart}
            />
          );
        })}
      </ArtistPanelList>
    </div>
  );
}
