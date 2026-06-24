import { ArtistTrackGrid } from "@/components/artist/ArtistTrackGrid";
import { ArtistTrackList } from "@/components/artist/ArtistTrackList";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { TrackListView } from "@/hooks/useTrackListView";

interface ArtistTrackPresentationProps {
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
  /** Whether covers carry their flip id; the cross-fade ghost passes `false`. */
  withFlipIds: boolean;
}

/**
 * Picks the artist-track presentation from a {@link TrackListView}: the stacked
 * {@link ArtistTrackList} or the cover {@link ArtistTrackGrid}. Extracted so the
 * live view and the cross-fade ghost render through one switch.
 *
 * @param props - {@link ArtistTrackPresentationProps}.
 */
function ArtistTrackPresentation({
  view,
  items,
  cardSignal,
  onTrackResolve,
  onResolveStart,
  withFlipIds,
}: ArtistTrackPresentationProps) {
  if (view === TrackListView.Grid) {
    return (
      <ArtistTrackGrid
        items={items}
        cardSignal={cardSignal}
        onTrackResolve={onTrackResolve}
        onResolveStart={onResolveStart}
        withFlipIds={withFlipIds}
      />
    );
  }
  return (
    <ArtistTrackList
      items={items}
      cardSignal={cardSignal}
      onTrackResolve={onTrackResolve}
      onResolveStart={onResolveStart}
      withFlipIds={withFlipIds}
    />
  );
}

interface ArtistTrackContentProps {
  /** Which presentation to render. */
  view: TrackListView;
  /**
   * The view animating OUT during a cover morph, or `null`/absent when none is
   * in flight. Rendered as an absolutely-positioned, fading ghost above the live
   * view so the outgoing row text fades while the shared covers travel (variant
   * 2). The ghost carries no flip ids;
   * {@link import("@/hooks/useTrackViewMorph").useTrackViewMorph} fades and
   * clears it.
   */
  outgoingView?: TrackListView | null;
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
 * The artist-track presentation host shared by the desktop card and the mobile
 * section. Renders the live {@link ArtistTrackPresentation} and, during a
 * list↔grid morph, a fading ghost of {@link ArtistTrackContentProps.outgoingView}
 * on top — both presentations are briefly in the DOM so the cover morph
 * (`useTrackViewMorph`) matches the shared covers across the swap while the old
 * row text fades out. Without `outgoingView` it is a plain switch (no overlay).
 *
 * @param props - {@link ArtistTrackContentProps}.
 */
export function ArtistTrackContent({
  view,
  outgoingView,
  items,
  cardSignal,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackContentProps) {
  const showGhost = outgoingView != null && outgoingView !== view;
  return (
    <div className="relative">
      <ArtistTrackPresentation
        view={view}
        items={items}
        cardSignal={cardSignal}
        onTrackResolve={onTrackResolve}
        onResolveStart={onResolveStart}
        withFlipIds
      />
      {showGhost && (
        <div className="pointer-events-none absolute inset-0" data-track-ghost aria-hidden="true">
          <ArtistTrackPresentation view={outgoingView} items={items} cardSignal={cardSignal} withFlipIds={false} />
        </div>
      )}
    </div>
  );
}
