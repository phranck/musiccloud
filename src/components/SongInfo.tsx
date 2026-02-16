import { memo } from "react";

interface SongInfoProps {
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  albumArtUrl: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

function formatYear(dateStr: string): string | null {
  const year = dateStr.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

export const SongInfo = memo(function SongInfo({
  title,
  artist,
  album,
  releaseDate,
  albumArtUrl,
  onAlbumArtLoad,
}: SongInfoProps) {
  const year = releaseDate ? formatYear(releaseDate) : null;

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
        {(album || year) && (
          <p className="text-base text-text-muted mt-1">
            {[album, year].filter(Boolean).join(" \u00B7 ")}
          </p>
        )}
      </div>
    </div>
  );
});
