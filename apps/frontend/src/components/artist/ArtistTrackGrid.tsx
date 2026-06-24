import type { CSSProperties } from "react";
import { ArtistTrackGridItem } from "@/components/artist/ArtistTrackGridItem";
import type { ArtistPanelTrackResolveHandler, ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";
import { CardSignal } from "@/lib/analytics/umami";

/** The scroll area sits 2px inside the well (its own margin), so its rounded clip
 *  is tight to the flush tiles instead of 2px wider. This radius — `raisedControlRadius`
 *  (well − control inset) minus that 2px — is BOTH the clip radius and the tiles'
 *  promoted corner (fed as `--neu-radius` for `useGroupedCorners`): corner tiles
 *  are concentric with the clip with no gap between them. */
const GRID_TILE_FULL_RADIUS = `calc(${raisedControlRadius} - 2px)`;

interface ArtistTrackGridProps {
  /** Normalized rows to render (already filtered by the owner). */
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
  // Promote the four outer corners of the tile group so they nest concentrically
  // in the scroll area's rounded corners; the cover (.recessed-gradient-border)
  // fills each tile, so all four of its corners follow the tile's (fillFrame).
  const gridRef = useGroupedCorners<HTMLDivElement>({
    frameSelector: ".recessed-gradient-border",
    frameInset: 0,
    fillFrame: true,
  });

  return (
    <div
      className="m-[2px] max-h-72 overflow-y-auto overscroll-contain"
      style={{ borderRadius: GRID_TILE_FULL_RADIUS }}
    >
      <div
        ref={gridRef}
        className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1"
        style={{ "--neu-radius": GRID_TILE_FULL_RADIUS } as CSSProperties}
      >
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
