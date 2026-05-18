import { buildMetaLine } from "@musiccloud/shared";
import { memo, useEffect, useRef, useState } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { VfdDisplay } from "@/components/ui/VfdDisplay";

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
  /** Fourth VFD row. Pre-translated by the caller so the component stays reusable. */
  statusLine?: string;
  /** Pulses the fourth VFD row with compositor-only opacity animation. */
  statusActive?: boolean;
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
  statusLine = "READY",
  statusActive = false,
}: SongInfoProps) {
  const metaLine = metaOverride ?? buildMetaLine({ durationMs, releaseDate });
  const detailLine = [album, isExplicit ? "E" : null].filter(Boolean).join(" · ");
  const shouldMarqueeStatus = statusLine.length > 28;
  const isPreviewPlayingStatus = /^[♪♫♬]/u.test(statusLine);
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

      <div className="px-3 pt-3 pb-3">
        {/* Fixed four-row VFD inside a recessed card. Text changes refresh via
            clipped translate3d movement, while the display height never changes.
            Weight hierarchy is modeled as phosphor intensity in VfdDisplay,
            not font-weight. */}
        <RecessedCard className="p-0.5" radius={{ base: "0.75rem", sm: "0.875rem" }}>
          <RecessedCard.Body>
            <VfdDisplay
              ariaLabel={`Track information: ${title} ${artist} ${detailLine} ${statusLine}`}
              lines={[
                {
                  brightness: "bright",
                  sections: metaLine
                    ? [
                        { content: title, cells: "fill", align: "left", marquee: "overflow" },
                        // Keep duration/year pinned on the right while the
                        // title gets the remaining cells and scrolls only if
                        // it overflows. VfdDisplay stays generic: it only
                        // knows section sizing/alignment, not song metadata.
                        { content: ` ${metaLine}`, cells: "auto", align: "right", brightness: "dim" },
                      ]
                    : [{ content: title, cells: "fill", align: "left", marquee: "overflow" }],
                },
                { content: artist, brightness: "normal" },
                { content: detailLine, brightness: "dim" },
                {
                  content: statusLine,
                  brightness: "normal",
                  align: "center",
                  marquee: shouldMarqueeStatus,
                  pulse: statusActive,
                  className: isPreviewPlayingStatus ? "mc-vfd-line-pulse-slow" : undefined,
                },
              ]}
            />
          </RecessedCard.Body>
        </RecessedCard>
      </div>
    </div>
  );
});

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
