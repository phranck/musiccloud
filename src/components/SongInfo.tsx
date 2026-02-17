import { memo } from "react";
import { formatDuration, formatYear } from "../lib/utils";

interface SongInfoProps {
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  durationMs?: number;
  isrc?: string;
  isExplicit?: boolean;
  albumArtUrl: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

export const SongInfo = memo(function SongInfo({
  title,
  artist,
  album,
  releaseDate,
  durationMs,
  isrc,
  isExplicit,
  albumArtUrl,
  onAlbumArtLoad,
}: SongInfoProps) {
  const year = releaseDate ? formatYear(releaseDate) : null;
  const duration = durationMs ? formatDuration(durationMs) : null;
  const metaItems = [duration, isrc, year].filter(Boolean);

  return (
    <div>
      {/* Album art - full width, card-filling */}
      <div className="aspect-square w-full overflow-hidden rounded-t-2xl sm:rounded-t-[36px]">
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
        {(isExplicit || metaItems.length > 0) && (
          <p className="text-sm text-text-muted/60 mt-2 font-mono tracking-wide flex items-center gap-1.5">
            {isExplicit && (
              <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[3px] bg-text-muted/20 text-text-muted text-[10px] font-bold leading-none flex-shrink-0" title="Explicit" aria-label="Explicit content">E</span>
            )}
            <span>{metaItems.join(" \u00B7 ")}</span>
          </p>
        )}
      </div>
    </div>
  );
});
