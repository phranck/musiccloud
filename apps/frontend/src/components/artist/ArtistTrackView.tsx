import { ArtistTrackCell } from "@/components/artist/ArtistTrackCell";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { trackItemKey } from "@/components/artist/artistTrackItems";
import { findNowPlayingRowIndex, type NowPlayingTrack } from "@/components/artist/nowPlayingTrack";
import { useRowCappedViewport } from "@/components/artist/useRowCappedViewport";
import { groupedListClassName, raisedControlRadius } from "@/components/cards/cardGeometry";
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
  /** The track the share page's player holds, or `null` while nothing plays. */
  nowPlaying?: NowPlayingTrack | null;
}

/**
 * One complete artist-track list: a scroll viewport capped at 4.5 rows (so it
 * wraps its content with a half-row scroll peek), a declaratively rounded
 * single-column track list, and one {@link ArtistTrackCell} per track. At most
 * one row is marked as the track the player holds.
 *
 * @param props - {@link ArtistTrackViewProps}.
 */
export function ArtistTrackView({
  items,
  cardSignal,
  onTrackResolve,
  onResolveStart,
  nowPlaying = null,
}: ArtistTrackViewProps) {
  // Cap the viewport at 4.5 list rows so it wraps the content with a half-row
  // scroll peek; longer lists scroll within it (no pager).
  const cappedRef = useRowCappedViewport<HTMLDivElement>(4.5);
  const nowPlayingIndex = findNowPlayingRowIndex(items, nowPlaying);

  return (
    <div ref={cappedRef} className="overflow-y-auto overscroll-contain" style={{ borderRadius: raisedControlRadius }}>
      <div className={groupedListClassName}>
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
            playback={index === nowPlayingIndex ? nowPlaying?.status : undefined}
          />
        ))}
      </div>
    </div>
  );
}
