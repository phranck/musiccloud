import type { ArtistTopTrack } from "@musiccloud/shared";
import type { MouseEvent } from "react";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { getTrackSubline } from "@/components/artist/artistTrackItems";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { SlideArtwork } from "@/components/ui/SlideArtwork";
import { useTrackResolve } from "@/hooks/useTrackResolve";
import { CardSignal } from "@/lib/analytics/umami";

/**
 * Grouped grid tile's interior corner radius: the ≤5px inner-corner rule from
 * AGENTS.md (`min(5px, control-radius)`). With the grid padded off the scroll
 * area's edge, no tile corner coincides with a container corner, so every tile
 * stays interior (no promotion) — derived from the cascade, never hardcoded.
 */
const TILE_RADIUS = `min(5px, ${raisedControlRadius})`;
/**
 * The hover overlay sits 1px inside the tile, so its radius is concentric: the
 * tile radius minus 1px. Written flat as `min(4px, X − 1px)` — the algebraic
 * equivalent of `min(5px, X) − 1px` — to keep the nested calc shallow.
 */
const TILE_OVERLAY_RADIUS = `min(4px, calc(${raisedControlRadius} - 1px))`;

interface ArtistTrackGridItemProps {
  /** The track to display and resolve on activation. */
  track: ArtistTopTrack;
  /** Similar-artist label; drives the overlay subline when present. */
  artistLabel?: string;
  /** Analytics signal fired when the item is activated. */
  cardSignal?: string;
  /** In-place resolve handler; its absence is treated as an error on click. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before resolving begins. */
  onResolveStart?: () => void;
}

/**
 * A single cover tile in the artist-track grid. Shows only the square artwork at
 * rest; on hover or keyboard focus a bottom gradient reveals the title and an
 * optional subline (the album name, or the other artist for similar tracks).
 *
 * It reuses {@link SlideArtwork} so the cover frame and the CD-slot resolve
 * animation are identical to the list row, and {@link useTrackResolve} so the
 * busy state, analytics signal, and failure toast behave the same regardless of
 * presentation. The overlay text is always in the DOM but the accessible name
 * comes from an explicit `aria-label`, so the tile stays announced even while
 * the label is visually hidden.
 *
 * @param props - {@link ArtistTrackGridItemProps}.
 */
export function ArtistTrackGridItem({
  track,
  artistLabel,
  cardSignal = CardSignal.PopularTrack,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackGridItemProps) {
  const subline = getTrackSubline(track, artistLabel);
  const { resolving, activate } = useTrackResolve(track, cardSignal, onTrackResolve, onResolveStart);

  const handleListen = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void activate();
  };

  return (
    <button
      type="button"
      onClick={handleListen}
      aria-busy={resolving}
      aria-disabled={resolving}
      aria-label={subline ? `${track.title} — ${subline}` : track.title}
      className="group relative block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-accent/60"
      style={{ borderRadius: TILE_RADIUS }}
    >
      <SlideArtwork
        active={resolving}
        artworkUrl={track.artworkUrl ?? undefined}
        sizeClass="w-full aspect-square"
        imgDim={96}
        radius={TILE_RADIUS}
      />
      {/* Title/subline overlay — hidden at rest, revealed on hover or focus.
          Clipped one pixel inside the cover frame (concentric: the tile radius
          minus the 1px SlideArtwork border) so its rounded bottom matches the edge. */}
      <div
        className="pointer-events-none absolute inset-[1px] overflow-hidden"
        style={{ borderRadius: TILE_OVERLAY_RADIUS }}
      >
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-2 pt-5 pb-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <p className="mc-txt-button-bright truncate text-xs font-semibold leading-tight text-white">{track.title}</p>
          {subline && (
            <p className="mc-txt-button-normal truncate text-[0.6875rem] leading-tight text-white/70">{subline}</p>
          )}
        </div>
      </div>
    </button>
  );
}
