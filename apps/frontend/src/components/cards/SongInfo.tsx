import { buildMetaLine } from "@musiccloud/shared";
import { memo, useEffect, useRef, useState } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { TftScreen } from "@/components/ui/TftScreen";
import {
  VfdBrightness,
  VfdDisplay,
  VfdMarqueeMode,
  VfdSectionAlign,
  VfdSectionCells,
  VfdSizingMode,
} from "@/components/ui/VfdDisplay";

interface SongInfoProps {
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  durationMs?: number;
  isExplicit?: boolean;
  albumArtUrl: string;
  /** When provided, replaces the automatically computed meta line (duration · year) */
  metaOverride?: string;
  /** Fourth VFD row. Pre-translated by the caller so the component stays reusable. */
  statusLine?: string;
}

const ARTWORK_SWAP_MS = 900;

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function decodeArtwork(url: string): Promise<void> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    // Broken artwork should not block the cover transition. The visible image
    // still has its own fallback path via ArtworkImage.onError.
  }
  await nextAnimationFrame();
}

export const SongInfo = memo(function SongInfo({
  title,
  artist,
  album,
  releaseDate,
  durationMs,
  isExplicit,
  albumArtUrl,
  metaOverride,
  statusLine = "READY",
}: SongInfoProps) {
  const metaLine = metaOverride ?? buildMetaLine({ durationMs, releaseDate });
  const detailLine = [album, isExplicit ? "E" : null].filter(Boolean).join(" · ");
  const shouldMarqueeStatus = statusLine.length > 28;

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
      void decodeArtwork(albumArtUrl).then(startSwap);
    }

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [albumArtUrl]);

  return (
    <div>
      <div className="px-3 pt-3">
        <RecessedCard className="p-0.5">
          <RecessedCard.Body>
            <TftScreen className="aspect-square w-full">
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
            </TftScreen>
          </RecessedCard.Body>
        </RecessedCard>
      </div>

      <div className="px-3 pt-3 pb-3">
        {/* Fixed four-row hardware-style VFD. Text changes refresh via
            clipped translate3d movement, while the display height never changes.
            Weight hierarchy is modeled as phosphor intensity in VfdDisplay,
            not font-weight. */}
        <VfdDisplay
          sizingMode={VfdSizingMode.Container}
          ariaLabel={`Track information: ${title} ${artist} ${detailLine} ${statusLine}`}
          lines={[
            {
              brightness: VfdBrightness.Bright,
              sections: metaLine
                ? [
                    {
                      content: title,
                      cells: VfdSectionCells.Fill,
                      align: VfdSectionAlign.Left,
                      marquee: VfdMarqueeMode.Overflow,
                    },
                    // Keep duration/year pinned on the right while the
                    // title gets the remaining cells and scrolls only if
                    // it overflows. VfdDisplay stays generic: it only
                    // knows section sizing/alignment, not song metadata.
                    {
                      content: ` ${metaLine}`,
                      cells: VfdSectionCells.Auto,
                      align: VfdSectionAlign.Right,
                      brightness: VfdBrightness.Normal,
                    },
                  ]
                : [
                    {
                      content: title,
                      cells: VfdSectionCells.Fill,
                      align: VfdSectionAlign.Left,
                      marquee: VfdMarqueeMode.Overflow,
                    },
                  ],
            },
            { content: artist, brightness: VfdBrightness.Normal },
            { content: detailLine, brightness: VfdBrightness.Dim },
            {
              content: statusLine,
              brightness: VfdBrightness.Normal,
              align: VfdSectionAlign.Center,
              marquee: shouldMarqueeStatus,
            },
          ]}
        />
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
