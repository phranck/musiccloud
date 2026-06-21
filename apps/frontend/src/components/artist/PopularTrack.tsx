import type { ArtistTopTrack } from "@musiccloud/shared";
import { type MouseEvent, useCallback, useState } from "react";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { ArtistPanelRow } from "@/components/artist/ArtistPanelRow";
import { ArtistPanelRowText } from "@/components/artist/ArtistPanelRowText";
import { SlideArtwork } from "@/components/ui/SlideArtwork";
import { useToastSafe } from "@/context/ToastContext";
import { useT } from "@/i18n/localeContext";
import { CardSignal, ResolveSignal, sendMusicSignal } from "@/lib/analytics/umami";

interface PopularTrackProps {
  /** The track to display and resolve on activation. */
  track: ArtistTopTrack;
  /**
   * Optional artist name rendered as a subline. Similar Tracks pass the other
   * artist's name; Popular Tracks omit it and may show the album name instead.
   */
  artistLabel?: string;
  /** Analytics signal fired when the row is activated. */
  cardSignal?: string;
  /** In-place resolve handler; its absence is treated as an error on click. */
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  /** Optional callback fired right before resolving begins. */
  onResolveStart?: () => void;
}

/**
 * A single tappable track row inside an artist panel. Both Popular Tracks and
 * Similar Tracks render it. Shows artwork, the title, an optional artist/album
 * subline, and an optional duration. Activating the row triggers in-place
 * resolve + playback via {@link ArtistPanelTrackResolveHandler}, shows a busy
 * state while resolving, and surfaces failures as a toast.
 */
export function PopularTrack({
  track,
  artistLabel,
  cardSignal = CardSignal.PopularTrack,
  onTrackResolve,
  onResolveStart,
}: PopularTrackProps) {
  const t = useT();
  const toast = useToastSafe();
  const showAlbum = !artistLabel && track.albumName && track.albumName !== track.title;
  const [resolving, setResolving] = useState(false);

  const handleListen = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (resolving) return;

      sendMusicSignal(cardSignal);
      setResolving(true);
      onResolveStart?.();
      try {
        if (!onTrackResolve) {
          throw new Error("missing in-place resolve handler");
        }

        await onTrackResolve(track);
        setResolving(false);
      } catch (err) {
        sendMusicSignal(err instanceof Error ? ResolveSignal.FailedClient : ResolveSignal.FailedUnknown);
        setResolving(false);
        if (import.meta.env.DEV) console.warn("[PopularTrack] resolve failed:", err);
        toast?.show(t("error.generic"), "error");
      }
    },
    [cardSignal, onResolveStart, onTrackResolve, resolving, track, toast, t],
  );

  return (
    <ArtistPanelRow as="button" type="button" onClick={handleListen} aria-busy={resolving} aria-disabled={resolving}>
      <SlideArtwork active={resolving} artworkUrl={track.artworkUrl ?? undefined} sizeClass="w-12 h-12" imgDim={48} />
      <ArtistPanelRowText>
        <p
          className="mc-txt-button-bright max-w-full truncate text-sm font-medium text-text-primary"
          title={track.title}
        >
          {track.title}
        </p>
        {artistLabel && (
          <p className="mc-txt-button-normal text-xs text-text-secondary mt-0.5 break-words">{artistLabel}</p>
        )}
        {showAlbum && (
          <p className="mc-txt-button-normal text-xs text-text-secondary mt-0.5 break-words">{track.albumName}</p>
        )}
      </ArtistPanelRowText>
      {track.durationMs != null && (
        <span className="mc-txt-button-dimmed text-xs text-text-secondary tabular-nums flex-none">
          {formatDuration(track.durationMs)}
        </span>
      )}
    </ArtistPanelRow>
  );
}

/**
 * Formats a millisecond duration as `m:ss` for the row's trailing label.
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
