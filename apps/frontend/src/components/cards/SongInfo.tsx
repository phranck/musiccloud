import { useGSAP } from "@gsap/react";
import { buildMetaLine } from "@musiccloud/shared";
import { memo, type ReactNode, useEffect, useRef, useState } from "react";
import type { AudioStatus } from "@/components/audio/AudioStatus";
import { ArtworkImage } from "@/components/cards/ArtworkImage";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { ShareMediaView, type ShareMediaView as ShareMediaViewType } from "@/components/share/ShareMediaView.types";
import { TftScreen } from "@/components/ui/TftScreen";
import type { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";
import { VfdInfoDisplay } from "@/components/ui/VfdInfoDisplay";
import { buildCoverSwapTimeline } from "@/lib/motion/coverSwap";
import { cn } from "@/lib/utils";

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
  /** Share-only cover/turntable visual mode. Stage 2.3 renders this. */
  shareMediaView?: ShareMediaViewType;
  /** Share-only playback status, forwarded by share media containers. */
  previewStatus?: AudioStatus | null;
  /**
   * The turntable deck rendered behind the cover on the share-only turntable
   * view. Supplied by the caller (`MediaCardHead`) so the deck can be hub-driven
   * under a `TurntablePlayerProvider` or a static prop-driven deck where no hub
   * exists; `SongInfo` only owns the cover/VFD layout and the cover-swap
   * animation. Only rendered when {@link shareMediaView} is set.
   */
  turntableStage?: ReactNode;
  /** Fourth VFD row. Pre-translated by the caller so the component stays reusable. */
  statusLine?: string;
  /** Transient seek-hint trigger forwarded to the status row overlay. */
  seekHint?: { direction: VfdScrollOutDirection; nonce: number } | null;
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
  seekHint,
  shareMediaView,
  statusLine = "READY",
  turntableStage,
}: SongInfoProps) {
  const metaLine = metaOverride ?? buildMetaLine({ durationMs, releaseDate });
  const detailLine = [album, isExplicit ? "E" : null].filter(Boolean).join(" · ");
  const mediaView = shareMediaView ?? ShareMediaView.Cover;
  const showTurntableStage = shareMediaView !== undefined;

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
            <TftScreen className="mc-share-media-screen aspect-square w-full" showEffects={false} showMatrix={false}>
              <div
                className={cn(
                  "mc-share-media-stage",
                  mediaView === ShareMediaView.Cover
                    ? "mc-share-media-stage--cover-active"
                    : "mc-share-media-stage--cover-exit",
                )}
                data-media-stage="cover"
              >
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
                {/* The LCD overlay layers (dot-matrix grid, tint, sheen, inset
                    shadow) live INSIDE the cover stage, not on the TftScreen, so
                    they slide in and out together with the artwork like one
                    cabinet-door panel instead of snapping over the fixed turntable
                    behind it. */}
                <div className="mc-tft-screen-tint" aria-hidden="true" />
                <div className="mc-tft-screen-matrix" aria-hidden="true" />
                <div className="mc-tft-screen-sheen" aria-hidden="true" />
                <div className="mc-tft-screen-shadow" aria-hidden="true" />
              </div>
              {/* The turntable is a fixed layer at the back; only the cover in
                  front of it slides (see .mc-share-media-stage CSS), so the deck
                  never moves when toggling the media view. */}
              {showTurntableStage && (
                <div className="mc-share-media-stage" data-media-stage="turntable">
                  {turntableStage}
                </div>
              )}
            </TftScreen>
          </RecessedCard.Body>
        </RecessedCard>
      </div>

      <div className="px-3 pt-3 pb-3">
        {/* Fixed four-row hardware-style track-info VFD. detailLine/metaLine are
            derived here from album/explicit/duration/release; VfdInfoDisplay owns
            the row layout, marquee and seek-hint overlay. */}
        <VfdInfoDisplay
          title={title}
          artist={artist}
          detailLine={detailLine}
          metaLine={metaLine}
          statusLine={statusLine}
          seekHint={seekHint}
        />
      </div>
    </div>
  );
});
