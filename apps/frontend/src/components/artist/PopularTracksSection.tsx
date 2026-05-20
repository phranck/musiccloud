import type { ArtistTopTrack } from "@musiccloud/shared";
import { type MouseEvent, useCallback, useState } from "react";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { SlideArtwork } from "@/components/ui/SlideArtwork";
import { useToastSafe } from "@/context/ToastContext";
import { useT } from "@/i18n/context";

interface PopularTracksSectionProps {
  tracks: ArtistTopTrack[];
  onTrackResolve?: (track: ArtistTopTrack) => Promise<void>;
  onResolveStart?: () => void;
}

export function PopularTracksSection({ tracks, onTrackResolve, onResolveStart }: PopularTracksSectionProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {tracks.map((track) => (
        <PopularTrack
          key={track.deezerUrl}
          track={track}
          onTrackResolve={onTrackResolve}
          onResolveStart={onResolveStart}
        />
      ))}
    </div>
  );
}

export function PopularTrack({
  track,
  artistLabel,
  onTrackResolve,
  onResolveStart,
}: {
  track: ArtistTopTrack;
  artistLabel?: string;
  onTrackResolve?: (track: ArtistTopTrack) => Promise<void>;
  onResolveStart?: () => void;
}) {
  const t = useT();
  const toast = useToastSafe();
  const showAlbum = !artistLabel && track.albumName && track.albumName !== track.title;
  const [resolving, setResolving] = useState(false);

  const handleListen = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (resolving) return;

      setResolving(true);
      onResolveStart?.();
      try {
        if (!onTrackResolve) {
          throw new Error("missing in-place resolve handler");
        }

        await onTrackResolve(track);
        setResolving(false);
      } catch (err) {
        setResolving(false);
        if (import.meta.env.DEV) console.warn("[PopularTrack] resolve failed:", err);
        toast?.show(t("error.generic"), "error");
      }
    },
    [onResolveStart, onTrackResolve, resolving, track, toast, t],
  );

  return (
    <EmbossedButton
      as="button"
      type="button"
      onClick={handleListen}
      disabled={resolving}
      aria-busy={resolving}
      noScale
      className="flex items-center gap-3 w-full p-2"
    >
      <SlideArtwork active={resolving} artworkUrl={track.artworkUrl ?? undefined} sizeClass="w-10 h-10" imgDim={40} />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-text-primary break-words">{track.title}</p>
        {artistLabel && <p className="text-xs text-text-secondary mt-0.5 break-words">{artistLabel}</p>}
        {showAlbum && <p className="text-xs text-text-secondary mt-0.5 break-words">{track.albumName}</p>}
      </div>
      {track.durationMs != null && (
        <span className="text-xs text-text-secondary tabular-nums flex-none">{formatDuration(track.durationMs)}</span>
      )}
    </EmbossedButton>
  );
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
