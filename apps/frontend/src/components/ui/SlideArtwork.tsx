import { type CSSProperties, useState } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { CoverImage } from "@/components/ui/CoverImage";
import { SlideArtworkKind, type SlideArtworkKind as SlideArtworkKindType } from "@/components/ui/SlideArtworkTypes";
import { VinylRecord } from "@/components/vinyl/VinylRecord";
import { VinylDiscFormat, VinylLabelVariant, VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { cn } from "@/lib/utils";

interface SlideArtworkProps {
  /** Whether the spinning Single should slide in (only this row gets the disc). */
  active: boolean;
  artworkUrl?: string;
  /** "round" for artists, "square" for tracks/albums. */
  kind?: SlideArtworkKindType;
  /** Size classes applied to the outer container. */
  sizeClass: string;
  /** Pixel dimension for the img width/height attributes. */
  imgDim?: number;
  /**
   * Explicit corner radius (a CSS length). Overrides the `imgDim`-derived
   * default — pass a cascade-derived value (e.g. the grouped grid tile's inner
   * radius) so the tile never hardcodes a nested radius. Square tiles only.
   */
  radius?: string;
  /** Per-corner artwork geometry, merged after the base radius. */
  style?: CSSProperties;
  /**
   * `<img>` decoding hint forwarded to {@link CoverImage}. Defaults to `async`;
   * pass `sync` where a remount must not flash an empty frame (e.g. covers that
   * re-mount as the list/grid views slide past each other).
   */
  decoding?: "async" | "sync" | "auto";
}

/**
 * Artwork tile with RecessedCard + inner shadow matching the artist profile
 * image in ArtistInfoCard.
 *
 * Drives a two-phase loading swap around `active`:
 * - **Enter** (`active` → true): a spinning Single slides in from above
 *   (`mc-disc-drop-in`) while the cover slides down out of the tile
 *   (`mc-cover-drop-out`), reading as a record slotting into a device.
 * - **Exit** (`active` → false, i.e. the requested data has loaded): the disc
 *   slides back DOWN out of the tile (`mc-disc-drop-out`) while the cover
 *   slides in from above (`mc-cover-drop-in`) - the symmetric reverse, like
 *   the Single being ejected and the artwork returning. The disc stays mounted
 *   through the exit (`discMounted`) and only unmounts once its drop-out
 *   animation ends, so the reverse glide is never skipped.
 *
 * The RecessedCard border and inner rim shadow stay fixed above both layers.
 */
export function SlideArtwork({
  active,
  artworkUrl,
  kind = SlideArtworkKind.Square,
  sizeClass,
  imgDim = 56,
  radius,
  style,
  decoding = "async",
}: SlideArtworkProps) {
  // Keep the disc in the DOM across the EXIT animation: when `active` flips
  // back to false the disc must slide OUT before it unmounts, so its mount
  // cannot be gated on `active` alone. Mount it synchronously the moment a row
  // turns active (set during render, no effect → no first-frame gap); the
  // disc's own animationend clears the flag after the exit glide. Starts
  // unmounted so idle rows never run the spin off-screen.
  const [discMounted, setDiscMounted] = useState(false);
  if (active && !discMounted) setDiscMounted(true);

  const borderRadius = radius ?? (kind === SlideArtworkKind.Round ? "50%" : imgDim <= 40 ? "4px" : "6px");
  // Scale a tight top/left-only inner shadow proportionally. It should read
  // as the recessed rim casting onto the artwork/CD, not as a dark overlay.
  const shadowOffset = Math.max(2, Math.round((imgDim / 56) * 4));
  const shadowBlur = Math.max(4, Math.round((imgDim / 56) * 10));
  const shadowSpread = Math.max(1, Math.round((imgDim / 56) * 3));
  const shadowColor = "rgba(0,0,0,0.55)";
  const innerShadow = [
    `inset ${shadowOffset}px 0 ${shadowBlur}px -${shadowSpread}px ${shadowColor}`,
    `inset 0 ${shadowOffset}px ${shadowBlur}px -${shadowSpread}px ${shadowColor}`,
  ].join(", ");

  // Cover motion: out on enter, back in during the exit, at rest otherwise.
  const coverSlideClass = active ? "mc-cover-drop-out" : discMounted ? "mc-cover-drop-in" : undefined;

  return (
    <RecessedCard
      // `mc-row-art` lets a grouped list promote this frame's left corners (see
      // CandidateRowContent). Only square covers are such a frame; a round artist
      // disc keeps its 50% radius and must not carry the marker.
      className={cn(
        sizeClass,
        kind === SlideArtworkKind.Square && "mc-row-art",
        "p-0 flex-shrink-0 relative overflow-hidden [&::before]:z-10",
      )}
      radius={borderRadius}
      borderWidth="1px"
      style={{ "--neu-light": "hsl(0 0% 100% / 0.5)", "--neu-shadow": "hsl(0 0% 0% / 0.1)", ...style } as CSSProperties}
    >
      <RecessedCard.Body className="contents">
        {/* Spinning Single: mounted for the selected row AND through its exit glide.
            On enter it drops in from the top (mc-disc-drop-in); on exit it drops
            back down out of the tile (mc-disc-drop-out) and unmounts once that
            animation ends. Sized to the tile so the round disc settles centred
            with its cover art as the label. Sits below the rim
            shadow only, so its face is never dimmed. */}
        {discMounted && (
          <div
            className={cn(
              "absolute inset-0 z-0 flex transform-gpu items-center justify-center will-change-transform",
              active ? "mc-disc-drop-in" : "mc-disc-drop-out",
            )}
            aria-hidden="true"
            onAnimationEnd={(event) => {
              // Only the container's own drop animation (not the inner spin),
              // and only the exit run: unmount the disc now that it slid out.
              if (event.target === event.currentTarget && !active) setDiscMounted(false);
            }}
          >
            <VinylRecord
              className="h-full w-full"
              discFormat={VinylDiscFormat.Single}
              labelVariant={VinylLabelVariant.Generic}
              spinState={VinylSpinState.Playing}
            />
          </div>
        )}

        {/* Cover artwork -- drops out downward on enter, slides back in from the
            top on exit (see coverSlideClass). */}
        <div
          className={cn("relative z-0 h-full w-full transform-gpu bg-surface will-change-transform", coverSlideClass)}
        >
          <CoverImage artworkUrl={artworkUrl} kind={kind} imgDim={imgDim} iconSize={20} decoding={decoding} />
        </div>

        {/* Recessed rim shadow -- edge-localised (top/left), so the disc reads as
            sitting INSIDE the tile without dimming its face. Stays above both layers. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none z-10"
          style={{ boxShadow: innerShadow }}
        />
      </RecessedCard.Body>
    </RecessedCard>
  );
}
