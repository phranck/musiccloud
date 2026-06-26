import type { CSSProperties } from "react";
import { ArtistTrackCell } from "@/components/artist/ArtistTrackCell";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { trackItemKey } from "@/components/artist/artistTrackItems";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";
import { TrackListView } from "@/hooks/useTrackListView";
import { cn } from "@/lib/utils";

interface ArtistTrackViewProps {
  /** Which presentation to render. */
  view: TrackListView;
  /** Normalized rows to render (already filtered by the owner). */
  items: ArtistTrackItem[];
  /** Analytics signal forwarded to each cell. */
  cardSignal?: string;
  /**
   * Fill the parent's height (`h-full`) and scroll within it, instead of capping
   * at this view's own `max-height`. The layered slide host pins the card to the
   * grid height and stacks the views absolutely, so each view must fill that fixed
   * height rather than impose its own.
   */
  fillHeight?: boolean;
  /** In-place resolve handler forwarded to each cell. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before a cell begins resolving. */
  onResolveStart?: () => void;
}

/**
 * One complete artist-track presentation — the stacked list or the cover grid —
 * as a self-contained block: the scroll viewport, the grouped-corner container
 * ({@link useGroupedCorners} is layout-agnostic, so the same call rounds a list's
 * first/last rows and a grid's four outer corners), and one {@link ArtistTrackCell}
 * per track.
 *
 * The owning {@link import("@/components/artist/ArtistTrackContent").ArtistTrackContent}
 * renders these layered at a fixed (grid) card height and slides them horizontally
 * on a view switch, so this component itself is a plain, static renderer with no
 * transition logic. With {@link ArtistTrackViewProps.fillHeight} the scroll viewport
 * fills that fixed height; otherwise it caps at its own `max-height`.
 *
 * @param props - {@link ArtistTrackViewProps}.
 */
export function ArtistTrackView({
  view,
  items,
  cardSignal,
  fillHeight = false,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackViewProps) {
  const isGrid = view === TrackListView.Grid;
  const groupedRef = useGroupedCorners<HTMLDivElement>({
    frameSelector: ".recessed-gradient-border",
    frameInset: isGrid ? 0 : 4,
    fillFrame: isGrid,
  });

  // Height: fill the parent's fixed height when layered, else cap at the view's own
  // max-height. Both views sit flush in the well, so neither subtracts a self-inset.
  const heightClass = fillHeight ? "h-full" : isGrid ? "max-h-72" : "max-h-[248px]";

  return (
    <div
      className={cn("overflow-y-auto overscroll-contain", heightClass)}
      style={{ borderRadius: raisedControlRadius }}
    >
      <div
        ref={groupedRef}
        className={
          isGrid
            ? "grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1"
            : "flex flex-col gap-[var(--mc-gap-list,0.125rem)]"
        }
        style={isGrid ? ({ "--neu-radius": raisedControlRadius } as CSSProperties) : undefined}
      >
        {items.map((item) => (
          <ArtistTrackCell
            key={trackItemKey(item)}
            view={view}
            track={item.track}
            artistLabel={item.artistLabel}
            cardSignal={cardSignal}
            onTrackResolve={onTrackResolve}
            onResolveStart={onResolveStart}
          />
        ))}
      </div>
    </div>
  );
}
