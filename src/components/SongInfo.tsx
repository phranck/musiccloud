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
    <div className="flex flex-col items-center p-6 pb-4">
      <div className="w-40 h-40 md:w-[200px] md:h-[200px] rounded-xl overflow-hidden shadow-2xl mb-5">
        <img
          src={albumArtUrl}
          alt={`"${title}" by ${artist} - album artwork`}
          className="w-full h-full object-cover"
          width={200}
          height={200}
          crossOrigin="anonymous"
          onLoad={(e) => onAlbumArtLoad?.(e.currentTarget)}
          onError={(e) => { e.currentTarget.src = "/og/default.jpg"; }}
        />
      </div>

      <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.02em] text-text-primary text-center">
        {title}
      </h2>
      <p className="text-base text-text-secondary mt-1 text-center">
        {artist}
      </p>
      {album && (
        <p className="text-sm text-text-muted mt-0.5 text-center">
          {album}
        </p>
      )}
    </div>
  );
});
