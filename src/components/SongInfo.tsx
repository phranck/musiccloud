import { memo } from "react";

interface SongInfoProps {
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  durationMs?: number;
  isrc?: string;
  albumArtUrl: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

function formatYear(dateStr: string): string | null {
  const year = dateStr.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const SongInfo = memo(function SongInfo({
  title,
  artist,
  album,
  releaseDate,
  durationMs,
  isrc,
  albumArtUrl,
  onAlbumArtLoad,
}: SongInfoProps) {
  const year = releaseDate ? formatYear(releaseDate) : null;
  const duration = durationMs ? formatDuration(durationMs) : null;
  const metaItems = [duration, isrc, year].filter(Boolean);

  return (
    <div>
      {/* Album art - full width, card-filling */}
      <div className="aspect-square w-full overflow-hidden rounded-t-[36px]">
        <img
          src={albumArtUrl}
          alt={`"${title}" by ${artist} - album artwork`}
          className="w-full h-full object-cover"
          width={480}
          height={480}
          crossOrigin="anonymous"
          onLoad={(e) => onAlbumArtLoad?.(e.currentTarget)}
          onError={(e) => { e.currentTarget.src = "/og/default.jpg"; }}
        />
      </div>

      {/* Track metadata */}
      <div className="px-6 pt-5 pb-4">
        <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          {title}
        </h2>
        <p className="text-base text-text-secondary mt-1">
          {artist}
        </p>
        {album && (
          <p className="text-base text-text-muted mt-1">
            {album}
          </p>
        )}
        {metaItems.length > 0 && (
          <p className="text-sm text-text-muted/60 mt-2 font-mono tracking-wide">
            {metaItems.join(" \u00B7 ")}
          </p>
        )}
      </div>
    </div>
  );
});
