import { ArtistTrackGrid } from "@/components/artist/ArtistTrackGrid";
import { ArtistTrackList } from "@/components/artist/ArtistTrackList";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { TrackListView } from "@/hooks/useTrackListView";

interface ArtistTrackContentProps {
  /** Which presentation to render. */
  view: TrackListView;
  /** Normalized rows to render (already filtered by the owner). */
  items: ArtistTrackItem[];
  /** Analytics signal forwarded to each row/item. */
  cardSignal?: string;
  /** In-place resolve handler forwarded to the presentation. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before a row/item begins resolving. */
  onResolveStart?: () => void;
}

/**
 * Picks the artist-track presentation from the current {@link TrackListView}:
 * the stacked {@link ArtistTrackList} or the cover {@link ArtistTrackGrid}. A
 * thin switch shared by both the desktop card and the mobile section so the
 * list/grid choice lives in one place and the same already-filtered {@link items}
 * feed either view.
 *
 * @param props - {@link ArtistTrackContentProps}.
 */
export function ArtistTrackContent({
  view,
  items,
  cardSignal,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackContentProps) {
  if (view === TrackListView.Grid) {
    return (
      <ArtistTrackGrid
        items={items}
        cardSignal={cardSignal}
        onTrackResolve={onTrackResolve}
        onResolveStart={onResolveStart}
      />
    );
  }

  return (
    <ArtistTrackList
      items={items}
      cardSignal={cardSignal}
      onTrackResolve={onTrackResolve}
      onResolveStart={onResolveStart}
    />
  );
}
