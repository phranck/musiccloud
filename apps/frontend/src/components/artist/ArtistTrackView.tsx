import { ArtistTrackCell } from "@/components/artist/ArtistTrackCell";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { trackItemKey } from "@/components/artist/artistTrackItems";
import { useRowCappedViewport } from "@/components/artist/useRowCappedViewport";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import {
  singleColumnGroupedArtworkCornerStyle,
  singleColumnGroupedArtworkInnerRadius,
  singleColumnGroupedCornerStyle,
} from "@/components/cards/singleColumnGroupedCornerStyle";

interface ArtistTrackViewProps {
  /** Normalized rows to render (already filtered by the owner). */
  items: ArtistTrackItem[];
  /** Analytics signal forwarded to each cell. */
  cardSignal?: string;
  /** In-place resolve handler forwarded to each cell. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before a cell begins resolving. */
  onResolveStart?: () => void;
}

/**
 * One complete artist-track list: a scroll viewport capped at 4.5 rows (so it
 * wraps its content with a half-row scroll peek), a declaratively rounded
 * single-column track list, and one {@link ArtistTrackCell} per track.
 *
 * @param props - {@link ArtistTrackViewProps}.
 */
export function ArtistTrackView({ items, cardSignal, onTrackResolve, onResolveStart }: ArtistTrackViewProps) {
  // Cap the viewport at 4.5 list rows so it wraps the content with a half-row
  // scroll peek; longer lists scroll within it (no pager).
  const cappedRef = useRowCappedViewport<HTMLDivElement>(4.5);

  return (
    <div ref={cappedRef} className="overflow-y-auto overscroll-contain" style={{ borderRadius: raisedControlRadius }}>
      <div className="flex flex-col gap-[var(--mc-gap-list,0.125rem)]">
        {items.map((item, index) => (
          <ArtistTrackCell
            key={trackItemKey(item)}
            track={item.track}
            artistLabel={item.artistLabel}
            cardSignal={cardSignal}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
            rowStyle={singleColumnGroupedCornerStyle(index, items.length)}
            artworkRadius={singleColumnGroupedArtworkInnerRadius}
            artworkStyle={singleColumnGroupedArtworkCornerStyle(index, items.length)}
          />
        ))}
      </div>
    </div>
  );
}
