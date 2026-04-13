import { type ArtistTopTrack, ENDPOINTS } from "@musiccloud/shared";
import { useCallback, useState } from "react";
import { SectionHeading } from "@/components/share/SectionHeading";
import { EmbossedButton } from "@/components/ui/EmbossedButton";

interface PopularTracksSectionProps {
  tracks: ArtistTopTrack[];
  t: (key: string, vars?: Record<string, string>) => string;
}

export function PopularTracksSection({ tracks, t }: PopularTracksSectionProps) {
  return (
    <div>
      <SectionHeading info={t("artist.popularTracksInfo")}>{t("artist.popularTracks")}</SectionHeading>
      <div className="flex flex-col gap-2">
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
      className="flex items-center gap-3 w-full rounded-lg px-3 py-2"
    >
      <div className="w-10 h-10 flex-none">
        {resolving ? (
          <SpinningCD size={40} />
        ) : track.artworkUrl ? (
          <img
            src={track.artworkUrl}
            alt=""
            width={40}
            height={40}
            className="w-full h-full rounded-lg object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full rounded-lg bg-white/[0.06]" />
        )}
      </div>
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

function SpinningCD({ size = 28 }: { size?: number }) {
  return (
    <div className="relative animate-vinyl-spin" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, #e8e8f0 0%, #a0a0b0 40%, #c8c8d0 70%, #b0b0b8 100%)",
        }}
      />
      <div
        className="absolute inset-0 rounded-full animate-cd-shimmer"
        style={{
          background:
            "conic-gradient(from 30deg, #a060ff 0%, #40b0ff 20%, #40ffc0 35%, #ffe040 50%, #ff6090 65%, #a060ff 80%, transparent 95%)",
          opacity: 0.45,
        }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.7) 0%, transparent 40%)" }}
      />
      <div
        className="absolute rounded-full bg-[#0a0a0c]"
        style={{ top: "38%", left: "38%", width: "24%", height: "24%" }}
      />
    </div>
  );
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
