import { buildMetaLine } from "@musiccloud/shared";
import { memo, useEffect, useRef, useState } from "react";
import { SmoothSwap } from "@/components/ui/SmoothSwap";

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

const ARTWORK_SWAP_MS = 740;

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
  const [artworkState, setArtworkState] = useState({
    currentUrl: albumArtUrl,
    previousUrl: null as string | null,
    generation: 0,
  });
  const previousArtworkUrl = useRef(albumArtUrl);

  useEffect(() => {
    if (previousArtworkUrl.current === albumArtUrl) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const startSwap = () => {
      if (cancelled) return;
      const oldUrl = previousArtworkUrl.current;
      previousArtworkUrl.current = albumArtUrl;
      setArtworkState((state) => ({
        currentUrl: albumArtUrl,
        previousUrl: oldUrl,
        generation: state.generation + 1,
      }));

      timeout = setTimeout(() => {
        setArtworkState((state) => (state.currentUrl === albumArtUrl ? { ...state, previousUrl: null } : state));
      }, ARTWORK_SWAP_MS + 120);
    };

    if (!albumArtUrl) {
      startSwap();
    } else {
      const img = new Image();
      img.decoding = "async";
      img.onload = startSwap;
      img.onerror = startSwap;
      img.src = albumArtUrl;
    }

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [albumArtUrl]);

  // Load a hidden CORS image for color extraction. Using a separate Image object
  // avoids the SSR hydration problem where the visible img is already loaded by the
  // browser before React can attach the onLoad handler. The visible img never needs
  // crossOrigin — only the hidden one used for canvas sampling does.
  //
  // fetchPriority="high" + eager decode minimises the gap between first paint and
  // the point at which the dynamic accent becomes available, because the button
  // stays in its neutral pre-accent state until this image resolves.
  useEffect(() => {
    if (!albumArtUrl || !onAlbumArtLoad) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    if ("fetchPriority" in img) {
      (img as HTMLImageElement & { fetchPriority: string }).fetchPriority = "high";
    }
    img.onload = () => onAlbumArtLoad(img);
    img.src = albumArtUrl;
    return () => {
      img.onload = null;
      img.src = "";
    };
  }, [albumArtUrl, onAlbumArtLoad]);

  return (
    <div>
      <div className="aspect-square w-full overflow-hidden rounded-t-[1.375rem] sm:rounded-t-[1.625rem] relative">
        {artworkState.previousUrl !== null && (
          <ArtworkImage
            key={`cover-out-${artworkState.generation}`}
            url={artworkState.previousUrl}
            alt=""
            className="absolute inset-0 mc-cover-slide-out transform-gpu will-change-transform"
          />
        )}
        <ArtworkImage
          key={`cover-in-${artworkState.generation}`}
          url={artworkState.currentUrl}
          alt={`"${title}" by ${artist} - album artwork`}
          className={
            artworkState.previousUrl !== null
              ? "absolute inset-0 mc-cover-slide-in transform-gpu will-change-transform"
              : ""
          }
        />
      </div>

      <div className="px-7 pt-5 pb-4">
        <SmoothSwap
          swapKey={[title, artist, album ?? "", metaLine ?? "", isExplicit ? "explicit" : "clean"].join("::")}
        >
          <div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.02em] text-text-primary">{title}</h2>
            <p className="text-base text-text-secondary mt-1">{artist}</p>
            {album ? (
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <p className="text-base text-text-muted">{album}</p>
                {(isExplicit || metaLine) && (
                  <p className="text-sm text-text-muted/60 font-mono tracking-wide flex items-center gap-1.5 flex-shrink-0">
                    {isExplicit && <ExplicitBadge />}
                    <span>{metaLine}</span>
                  </p>
                )}
              </div>
            ) : isExplicit || metaLine ? (
              <p className="text-sm text-text-muted/60 mt-2 font-mono tracking-wide flex items-center gap-1.5">
                {isExplicit && <ExplicitBadge />}
                <span>{metaLine}</span>
              </p>
            ) : null}
          </div>
        </SmoothSwap>
      </div>
    </div>
  );
});

function ExplicitBadge() {
  return (
    <span
      role="img"
      className="inline-flex items-center justify-center size-[18px] rounded-[3px] bg-text-muted/20 text-text-muted text-[10px] font-bold leading-none flex-shrink-0"
      title="Explicit"
      aria-label="Explicit content"
    >
      E
    </span>
  );
}

function ArtworkImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const src = url || "/og/musiccloud.jpg";
  return (
    <img
      src={src}
      alt={alt}
      className={`size-full object-cover ${className ?? ""}`}
      width={480}
      height={480}
      onError={(e) => {
        e.currentTarget.src = "/og/musiccloud.jpg";
      }}
    />
  );
}
