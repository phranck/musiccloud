import type { CSSProperties } from "react";
import { ArtistTrackCell } from "@/components/artist/ArtistTrackCell";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { trackItemKey } from "@/components/artist/artistTrackItems";
import { useRowCappedViewport } from "@/components/artist/useRowCappedViewport";
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
   * Fill the parent's height (`h-full`) and scroll within it, instead of capping at
   * 4.5 list rows / 2.5 grid tile rows. The host stacks the views as absolute layers
   * that fill the (animated) card height, so they pass `fillHeight`; the in-flow copy
   * that drives the card height omits it and imposes the cap.
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
 * renders these layered, fills them to the card height while it animates, and slides
 * them horizontally on a view switch, so this component itself is a plain, static
 * renderer with no transition logic. With {@link ArtistTrackViewProps.fillHeight} the
 * scroll viewport fills the parent height; otherwise it caps at 4.5 rows / 2.5 tiles.
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

  // Height: when this view drives the card height (the in-flow spacer), cap it at
  // 4.5 list rows / 2.5 grid tile rows so it wraps the content with a half-row scroll
  // peek; the layered, slideable copies pass `fillHeight` and just fill the animated
  // card height. The cap ref is only attached in the height-driving (non-fill) case.
  const cappedRef = useRowCappedViewport<HTMLDivElement>(isGrid ? 2.5 : 4.5);

  return (
    <div
      ref={fillHeight ? undefined : cappedRef}
      className={cn("overflow-y-auto overscroll-contain", fillHeight && "h-full")}
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
