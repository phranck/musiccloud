import type { CSSProperties } from "react";
import { ArtistTrackCell } from "@/components/artist/ArtistTrackCell";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { trackItemKey } from "@/components/artist/artistTrackItems";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";
import { TrackListView } from "@/hooks/useTrackListView";
import { cn } from "@/lib/utils";

/** Grid scroll-clip + tile radius: the well's inner control radius minus the 2px the grid insets itself. */
const GRID_TILE_FULL_RADIUS = `calc(${raisedControlRadius} - 2px)`;

interface ArtistTrackViewProps {
  /** Which presentation to render. */
  view: TrackListView;
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
 * One complete artist-track presentation — the stacked list or the cover grid —
 * as a self-contained block: the capped-height scroll viewport, the grouped-corner
 * container ({@link useGroupedCorners} is layout-agnostic, so the same call rounds
 * a list's first/last rows and a grid's four outer corners), and one
 * {@link ArtistTrackCell} per track.
 *
 * The owning {@link import("@/components/artist/ArtistTrackContent").ArtistTrackContent}
 * renders two of these and slides them horizontally on a view switch, so this
 * component itself is a plain, static renderer with no transition logic.
 *
 * @param props - {@link ArtistTrackViewProps}.
 */
export function ArtistTrackView({ view, items, cardSignal, onTrackResolve, onResolveStart }: ArtistTrackViewProps) {
  const isGrid = view === TrackListView.Grid;
  const groupedRef = useGroupedCorners<HTMLDivElement>({
    frameSelector: ".recessed-gradient-border",
    frameInset: isGrid ? 0 : 4,
    fillFrame: isGrid,
  });

  return (
    <div
      className={cn("overflow-y-auto overscroll-contain", isGrid ? "m-[2px] max-h-72" : "max-h-[248px]")}
      style={{ borderRadius: isGrid ? GRID_TILE_FULL_RADIUS : raisedControlRadius }}
    >
      <div
        ref={groupedRef}
        className={
          isGrid
            ? "grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1"
            : "flex flex-col gap-[var(--mc-gap-list,0.125rem)]"
        }
        style={isGrid ? ({ "--neu-radius": GRID_TILE_FULL_RADIUS } as CSSProperties) : undefined}
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
