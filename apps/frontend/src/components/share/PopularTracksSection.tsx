import { type ArtistTopTrack, ENDPOINTS } from "@musiccloud/shared";
import { useCallback, useState } from "react";
import { SectionHeading } from "@/components/share/SectionHeading";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { SlideArtwork } from "@/components/ui/SlideArtwork";

interface PopularTracksSectionProps {
  tracks: ArtistTopTrack[];
  t: (key: string, vars?: Record<string, string>) => string;
}

export function PopularTracksSection({ tracks, t }: PopularTracksSectionProps) {
  return (
    <div>
      <SectionHeading info={t("artist.popularTracksInfo")}>{t("artist.popularTracks")}</SectionHeading>
      <div className="flex flex-col gap-1.5">
        {tracks.map((track) => (
          <PopularTrack key={track.deezerUrl} track={track} />
        ))}
      </div>
    </div>
  );
}

export function PopularTrack({ track, artistLabel }: { track: ArtistTopTrack; artistLabel?: string }) {
  const showAlbum = !artistLabel && track.albumName && track.albumName !== track.title;
  const [resolving, setResolving] = useState(false);

  const handleListen = useCallback(() => {
    if (track.shortId) {
      window.location.href = `/${track.shortId}`;
      return;
    }
    setResolving(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    fetch(ENDPOINTS.frontend.resolve, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: track.deezerUrl }),
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeout);
        if (!res.ok) throw new Error("resolve failed");
        return res.json() as Promise<{ shortUrl?: string }>;
      })
      .then((data) => {
        if (data.shortUrl) {
          const path = new URL(data.shortUrl).pathname;
          window.location.href = path;
        } else {
          setResolving(false);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        setResolving(false);
      });
  }, [track.shortId, track.deezerUrl]);

  return (
    <EmbossedButton
      as="button"
      type="button"
      onClick={handleListen}
      noScale
      className="flex items-center gap-3 w-full rounded-[4px] sm:rounded-lg p-2"
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
