import { memo, useState } from "react";
import { buildMetaLine } from "@musiccloud/shared";
import { AudioPreviewPlayer } from "@/components/audio/AudioPreviewPlayer";

interface SongInfoProps {
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  durationMs?: number;
  isExplicit?: boolean;
  albumArtUrl: string;
  onAlbumArtLoad?: (img: HTMLImageElement) => void;
  /** When provided, replaces the automatically computed meta line (duration · year) */
  metaOverride?: string;
  /** When provided, renders the audio preview mini-player below the meta line */
  previewUrl?: string;
}

export const SongInfo = memo(function SongInfo({
  title,
  artist,
  album,
  releaseDate,
  durationMs,
  isExplicit,
  albumArtUrl,
  onAlbumArtLoad,
  metaOverride,
  previewUrl,
}: SongInfoProps) {
  const metaLine = metaOverride ?? buildMetaLine({ durationMs, releaseDate });

  // CORS-retry: attempt crossOrigin="anonymous" first (needed for canvas color extraction).
  // If the CDN blocks it (no Access-Control-Allow-Origin), fall back to a plain load
  // without crossOrigin so the artwork still displays (color extraction is then skipped).
  const [corsRetried, setCorsRetried] = useState(false);
  const [prevArtUrl, setPrevArtUrl] = useState(albumArtUrl);
  if (prevArtUrl !== albumArtUrl) {
    setPrevArtUrl(albumArtUrl);
    setCorsRetried(false);
  }

  return (
    <div>
      <div className="aspect-square w-full overflow-hidden rounded-t-2xl sm:rounded-t-[36px]">
        {albumArtUrl ? (
          <img
            key={corsRetried ? "display" : "cors"}
            src={corsRetried ? `${albumArtUrl}?_r=1` : albumArtUrl}
            alt={`"${title}" by ${artist} - album artwork`}
            className="w-full h-full object-cover"
            width={480}
            height={480}
            crossOrigin={corsRetried ? undefined : "anonymous"}
            onLoad={(e) => {
              if (!corsRetried) onAlbumArtLoad?.(e.currentTarget);
            }}
            onError={(e) => {
              if (!corsRetried) {
                setCorsRetried(true);
              } else {
                e.currentTarget.src = "/og/musiccloud.jpg";
              }
            }}
          />
        ) : (
          <img
            src="/og/musiccloud.jpg"
            alt=""
            className="w-full h-full object-cover"
            width={480}
            height={480}
          />
        )}
      </div>

      <div className="px-6 pt-5 pb-4">
        <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.02em] text-text-primary">{title}</h2>
        <p className="text-base text-text-secondary mt-1">{artist}</p>
        {album && <p className="text-base text-text-muted mt-1">{album}</p>}
        {(isExplicit || metaLine) && (
          <p className="text-sm text-text-muted/60 mt-2 font-mono tracking-wide flex items-center gap-1.5">
            {isExplicit && (
              <span
                role="img"
                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[3px] bg-text-muted/20 text-text-muted text-[10px] font-bold leading-none flex-shrink-0"
                title="Explicit"
                aria-label="Explicit content"
              >
                E
              </span>
            )}
            <span>{metaLine}</span>
          </p>
        )}
        {previewUrl && (
          <div className="mt-4">
            <AudioPreviewPlayer previewUrl={previewUrl} trackTitle={title} />
          </div>
        )}
      </div>
    </div>
  );
});
