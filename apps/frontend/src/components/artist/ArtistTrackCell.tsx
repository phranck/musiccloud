import type { ArtistTopTrack } from "@musiccloud/shared";
import type { MouseEvent } from "react";
import { ArtistPanelRow } from "@/components/artist/ArtistPanelRow";
import { ArtistPanelRowText } from "@/components/artist/ArtistPanelRowText";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { getTrackSubline } from "@/components/artist/artistTrackItems";
import { SlideArtwork } from "@/components/ui/SlideArtwork";
import { TrackListView } from "@/hooks/useTrackListView";
import { useTrackResolve } from "@/hooks/useTrackResolve";
import { CardSignal } from "@/lib/analytics/umami";
import { cn } from "@/lib/utils";

/** The grid tile's interior radius (≤5px, per AGENTS.md), promoted at the group's outer corners by `useGroupedCorners`. */
const CELL_RADIUS = "min(5px, var(--neu-radius))";

interface ArtistTrackCellProps {
  /** The track to display and resolve on activation. */
  track: ArtistTopTrack;
  /** Similar-artist label; drives the subline when present. */
  artistLabel?: string;
  /** Which presentation this cell renders in. */
  view: TrackListView;
  /** Analytics signal fired when the cell is activated. */
  cardSignal?: string;
  /** In-place resolve handler; its absence is treated as an error on click. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before resolving begins. */
  onResolveStart?: () => void;
}

/**
 * One track rendered as either a list row or a grid tile, chosen by
 * {@link ArtistTrackCellProps.view}. A single component for both presentations so
 * the two stay in lockstep; the list↔grid transition itself is a horizontal slide
 * owned by {@link import("@/components/artist/ArtistTrackContent").ArtistTrackContent}.
 *
 * - **List:** the shared {@link ArtistPanelRow} (an `EmbossedButton` carrying the
 *   raised row frame + token-driven chrome, identical to the commercial candidate
 *   rows) — square cover (48px), title + optional subline, an optional trailing
 *   duration.
 * - **Grid:** a square cover tile; the same title/subline become a bottom gradient
 *   overlay revealed on hover/focus, the duration is dropped.
 *
 * Reuses {@link SlideArtwork} (cover frame + CD-slot resolve animation) and
 * {@link useTrackResolve} (busy state, analytics, failure toast) so behaviour is
 * identical in both presentations.
 *
 * @param props - {@link ArtistTrackCellProps}.
 */
export function ArtistTrackCell({
  track,
  artistLabel,
  view,
  cardSignal = CardSignal.PopularTrack,
  onTrackResolve,
  onResolveStart,
}: ArtistTrackCellProps) {
  const isGrid = view === TrackListView.Grid;
  const subline = getTrackSubline(track, artistLabel);
  const { resolving, activate } = useTrackResolve(track, cardSignal, onTrackResolve, onResolveStart);

  const handleListen = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void activate();
  };

  const ariaLabel = subline ? `${track.title} — ${subline}` : track.title;

  if (!isGrid) {
    // List row: the shared raised row frame (EmbossedButton) + grouped corners,
    // matching the commercial candidate rows.
    return (
      <ArtistPanelRow
        as="button"
        onClick={handleListen}
        aria-busy={resolving}
        aria-disabled={resolving}
        aria-label={ariaLabel}
      >
        <SlideArtwork active={resolving} artworkUrl={track.artworkUrl ?? undefined} sizeClass="w-12 h-12" imgDim={48} />
        <ArtistPanelRowText>
          <p
            className="mc-txt-button-bright max-w-full truncate text-sm font-medium text-text-primary"
            title={track.title}
          >
            {track.title}
          </p>
          {subline && <p className="mc-txt-button-normal mt-0.5 break-words text-xs text-text-secondary">{subline}</p>}
        </ArtistPanelRowText>
        {track.durationMs != null && (
          <span className="mc-txt-button-dimmed flex-none text-xs tabular-nums text-text-secondary">
            {formatDuration(track.durationMs)}
          </span>
        )}
      </ArtistPanelRow>
    );
  }

  // Grid tile: the cover IS the tile; title/subline reveal as a bottom overlay.
  return (
    <button
      type="button"
      onClick={handleListen}
      aria-busy={resolving}
      aria-disabled={resolving}
      aria-label={ariaLabel}
      className={cn(
        "group relative block w-full cursor-pointer overflow-hidden text-left transform-gpu",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-accent/60",
      )}
      style={{ borderRadius: CELL_RADIUS }}
    >
      <SlideArtwork
        active={resolving}
        artworkUrl={track.artworkUrl ?? undefined}
        sizeClass="w-full aspect-square"
        imgDim={96}
        radius={CELL_RADIUS}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-2 pt-5 pb-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        <p className="mc-txt-button-bright truncate text-xs font-semibold leading-tight text-white">{track.title}</p>
        {subline && (
          <p className="mc-txt-button-normal truncate text-[0.6875rem] leading-tight text-white/70">{subline}</p>
        )}
      </div>
    </button>
  );
}

/**
 * Formats a millisecond duration as `m:ss` for the list row's trailing label.
 *
 * @param ms - Duration in milliseconds.
 * @returns The duration as `minutes:zero-padded-seconds`, e.g. `3:07`.
 */
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
