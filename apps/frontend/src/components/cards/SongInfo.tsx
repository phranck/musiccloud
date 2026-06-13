import { useGSAP } from "@gsap/react";
import { buildMetaLine } from "@musiccloud/shared";
import { memo, type Ref, useEffect, useRef, useState } from "react";
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
import { buildCoverSwapTimeline } from "@/lib/motion/coverSwap";

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
  const incomingCoverRef = useRef<HTMLImageElement>(null);
  const outgoingCoverRef = useRef<HTMLImageElement>(null);
  const coverSwapTimeline = useRef<ReturnType<typeof buildCoverSwapTimeline>>(null);

  useEffect(() => {
    if (previousArtworkUrl.current === albumArtUrl) return;

    let cancelled = false;

    const startSwap = () => {
      if (cancelled) return;
      const oldUrl = previousArtworkUrl.current;
      previousArtworkUrl.current = albumArtUrl;
      setArtworkState((state) => ({
        currentUrl: albumArtUrl,
        previousUrl: oldUrl,
        generation: state.generation + 1,
      }));
    };

    if (!albumArtUrl) {
      startSwap();
    } else {
      void decodeArtwork(albumArtUrl).then(startSwap);
    }

    return () => {
      cancelled = true;
    };
  }, [albumArtUrl]);

  // Cover slide (GSAP port of the removed `.mc-cover-slide-in/out` classes):
  // runs pre-paint in the commit that mounted the two cover buffers, so the
  // incoming cover never flashes at its final position. The timeline's
  // onSettle unmounts the outgoing cover (replacing the old fixed
  // `setTimeout`); a swap arriving mid-flight bumps `generation`, remounts
  // both buffers and kills the predecessor here first (its superseded settle
  // is suppressed — the generation guard in `settle` covers the rest).
  useGSAP(
    () => {
      if (artworkState.previousUrl === null) return;
      const incoming = incomingCoverRef.current;
      const outgoing = outgoingCoverRef.current;
      if (!incoming || !outgoing) return;

      const settledGeneration = artworkState.generation;
      const settle = () => {
        setArtworkState((state) => (state.generation === settledGeneration ? { ...state, previousUrl: null } : state));
      };

      coverSwapTimeline.current?.kill();
      coverSwapTimeline.current = buildCoverSwapTimeline({ incoming, outgoing, onSettle: settle });
      // Reduced motion: no timeline exists and the commit already shows the
      // incoming cover in place — settle (unmount the old cover) immediately.
      if (!coverSwapTimeline.current) settle();
    },
    // Keyed on the generation only: every swap bumps it, while the settle
    // commit (previousUrl → null) leaves it unchanged and must not re-run
    // the effect.
    { dependencies: [artworkState.generation] },
  );

  return (
    <div>
      <div className="px-3 pt-3">
        <RecessedCard className="p-0.5">
          <RecessedCard.Body>
            <TftScreen className="aspect-square w-full">
              {artworkState.previousUrl !== null && (
                <ArtworkImage
                  ref={outgoingCoverRef}
                  key={`cover-out-${artworkState.generation}`}
                  url={artworkState.previousUrl}
                  alt=""
                  className="absolute inset-0 transform-gpu will-change-transform"
                />
              )}
              <ArtworkImage
                ref={incomingCoverRef}
                key={`cover-in-${artworkState.generation}`}
                url={artworkState.currentUrl}
                alt={`"${title}" by ${artist} - album artwork`}
                className={
                  artworkState.previousUrl !== null ? "absolute inset-0 transform-gpu will-change-transform" : ""
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

/**
 * Cover image with the shared artwork fallback. The optional `ref` exposes
 * the `<img>` element so the cover-swap timeline can slide it (the buffers
 * remount per swap generation, so the refs always point at fresh nodes).
 */
function ArtworkImage({
  url,
  alt,
  className,
  ref,
}: {
  url: string;
  alt: string;
  className?: string;
  ref?: Ref<HTMLImageElement>;
}) {
  const src = url || "/og/musiccloud.jpg";
  return (
    <img
      ref={ref}
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
