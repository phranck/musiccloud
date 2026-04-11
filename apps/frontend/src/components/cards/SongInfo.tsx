import { buildMetaLine } from "@musiccloud/shared";
import { memo, useEffect } from "react";

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
}: SongInfoProps) {
  const metaLine = metaOverride ?? buildMetaLine({ durationMs, releaseDate });

  // Load a hidden CORS image for color extraction. Using a separate Image object
  // avoids the SSR hydration problem where the visible img is already loaded by the
  // browser before React can attach the onLoad handler. The visible img never needs
  // crossOrigin — only the hidden one used for canvas sampling does.
  useEffect(() => {
    if (!albumArtUrl || !onAlbumArtLoad) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => onAlbumArtLoad(img);
    img.src = albumArtUrl;
    return () => {
      img.onload = null;
      img.src = "";
    };
  }, [albumArtUrl, onAlbumArtLoad]);

  return (
    <div>
      <div className="aspect-square w-full overflow-hidden rounded-t-2xl sm:rounded-t-[36px]">
        {albumArtUrl ? (
          <img
            src={albumArtUrl}
            alt={`"${title}" by ${artist} - album artwork`}
            className="w-full h-full object-cover"
            width={480}
            height={480}
            onError={(e) => {
              e.currentTarget.src = "/og/musiccloud.jpg";
            }}
          />
        ) : (
          <img src="/og/musiccloud.jpg" alt="" className="w-full h-full object-cover" width={480} height={480} />
        )}
      </div>

      <div className="px-5 pt-5 pb-4">
        <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          {title}
        </h2>
        <p className="text-base text-text-secondary mt-1">{artist}</p>
        {album ? (
          <div className="flex items-baseline justify-between gap-3 mt-1">
            <p className="text-base text-text-muted">{album}</p>
            {(isExplicit || metaLine) && (
              <p className="text-sm text-text-muted/60 font-mono tracking-wide flex items-center gap-1.5 flex-shrink-0">
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
          </div>
        ) : isExplicit || metaLine ? (
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
        ) : null}
      </div>
    </div>
  );
});
