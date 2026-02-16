import { memo } from "react";

interface SongInfoProps {
  title: string;
  artist: string;
  album?: string;
  albumArtUrl: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
}

export const SongInfo = memo(function SongInfo({
  title,
  artist,
  album,
  albumArtUrl,
  onAlbumArtLoad,
}: SongInfoProps) {
  return (
    <div className="flex gap-5 p-5">
      <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden shadow-lg flex-shrink-0">
        <img
          src={albumArtUrl}
          alt={`"${title}" by ${artist} - album artwork`}
          className="w-full h-full object-cover"
          width={128}
          height={128}
          crossOrigin="anonymous"
          onLoad={(e) => onAlbumArtLoad?.(e.currentTarget)}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      </div>

      <div className="flex flex-col justify-center min-w-0">
        <h2 className="text-xl md:text-2xl font-semibold text-text-primary truncate">
          {title}
        </h2>
        <p className="text-base text-text-secondary truncate mt-1">
          {artist}
        </p>
        {album && (
          <p className="text-sm text-text-muted truncate mt-0.5">
            {album}
          </p>
        )}
      </div>
    </div>
  );
});
