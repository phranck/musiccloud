import type { ArtistTopTrack } from "@musiccloud/shared";
import type { CSSProperties, MouseEvent } from "react";
import { ArtistPanelRow } from "@/components/artist/ArtistPanelRow";
import { ArtistPanelRowText } from "@/components/artist/ArtistPanelRowText";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { getTrackSubline } from "@/components/artist/artistTrackItems";
import type { NowPlayingStatus } from "@/components/artist/nowPlayingTrack";
import { PlaybackBars } from "@/components/artist/PlaybackBars";
import { SlideArtwork } from "@/components/ui/SlideArtwork";
import { useTrackResolve } from "@/hooks/useTrackResolve";
import { CardSignal } from "@/lib/analytics/umami";

interface ArtistTrackCellProps {
  /** The track to display and resolve on activation. */
  track: ArtistTopTrack;
  /** Similar-artist label; drives the subline when present. */
  artistLabel?: string;
  /** Analytics signal fired when the cell is activated. */
  cardSignal?: string;
  /** In-place resolve handler; its absence is treated as an error on click. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before resolving begins. */
  onResolveStart?: () => void;
  /** Token-derived grouped-list corners for the raised row. */
  rowStyle?: CSSProperties;
  /** Token-derived base radius for the square artwork frame. */
  artworkRadius?: string;
  /** Per-corner grouped-list geometry for the artwork frame. */
  artworkStyle?: CSSProperties;
  /** The player's state when this row shows the track it holds; absent for every other row. */
  playback?: NowPlayingStatus;
}

/**
 * One track rendered as a list row: the shared {@link ArtistPanelRow} (an
 * `EmbossedButton` carrying the raised row frame + token-driven chrome, identical
 * to the commercial candidate rows) — square cover (48px), title + optional
 * subline, an optional trailing duration.
 *
 * The row that shows the track the share page's player holds carries
 * `data-playback` and `aria-current`: the stylesheet draws a ring inside its
 * contour and shows {@link PlaybackBars} under the duration. The ring stays
 * inside the row because the list's scroll viewport clips anything outside it.
 *
 * Reuses {@link SlideArtwork} (cover frame + CD-slot resolve animation) and
 * {@link useTrackResolve} (busy state, analytics, failure toast).
 *
 * @param props - {@link ArtistTrackCellProps}.
 */
export function ArtistTrackCell({
  track,
  artistLabel,
  cardSignal = CardSignal.PopularTrack,
  onTrackResolve,
  onResolveStart,
  rowStyle,
  artworkRadius,
  artworkStyle,
  playback,
}: ArtistTrackCellProps) {
  const subline = getTrackSubline(track, artistLabel);
  const { resolving, activate } = useTrackResolve(track, cardSignal, onTrackResolve, onResolveStart);

  const handleListen = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void activate();
  };

  const ariaLabel = subline ? `${track.title} — ${subline}` : track.title;

  // List row: the shared raised row frame (EmbossedButton) + grouped corners,
  // matching the commercial candidate rows.
  return (
    <ArtistPanelRow
      as="button"
      onClick={handleListen}
      aria-busy={resolving}
      aria-disabled={resolving}
      aria-label={ariaLabel}
      aria-current={playback ? true : undefined}
      data-playback={playback}
      className="mc-playback-row"
      style={rowStyle}
    >
      <SlideArtwork
        active={resolving}
        artworkUrl={track.artworkUrl ?? undefined}
        sizeClass="w-12 h-12"
        imgDim={48}
        radius={artworkRadius}
        style={artworkStyle}
        decoding="sync"
      />
      <ArtistPanelRowText>
        <p
          className="mc-txt-button-bright max-w-full truncate text-sm font-medium text-text-primary"
          title={track.title}
        >
          {track.title}
        </p>
        {subline && (
          <p className="mc-txt-button-normal mt-0.5 truncate text-xs text-text-secondary" title={subline}>
            {subline}
          </p>
        )}
      </ArtistPanelRowText>
      {track.durationMs != null ? (
        <span className="mc-txt-button-dimmed relative flex-none text-xs tabular-nums text-text-secondary">
          {formatDuration(track.durationMs)}
          {/* Hangs below the duration so the duration keeps its place in every row. */}
          <PlaybackBars className="absolute top-full right-0" />
        </span>
      ) : (
        <PlaybackBars className="flex-none" />
      )}
    </ArtistPanelRow>
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
