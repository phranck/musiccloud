import { MusicNoteIcon, UserIcon } from "@phosphor-icons/react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { CDSpinArtwork } from "@/components/ui/CDSpinArtwork";
import { SlideArtworkKind, type SlideArtworkKind as SlideArtworkKindType } from "@/components/ui/SlideArtworkTypes";
import { cn } from "@/lib/utils";

interface SlideArtworkProps {
  /** Whether the spinning CD should slide in (only this row gets the CD). */
  active: boolean;
  artworkUrl?: string;
  /** "round" for artists, "square" for tracks/albums. */
  kind?: SlideArtworkKindType;
  /** Size classes applied to the outer container. */
  sizeClass: string;
  /** Pixel dimension for the img width/height attributes. */
  imgDim?: number;
}

/**
 * Artwork tile with RecessedCard + inner shadow matching the artist profile
 * image in ArtistInfoCard. When `active` becomes true a spinning CD slides
 * in from above, pushing the cover image out downward. The RecessedCard
 * border and inner shadow stay fixed on top of both layers.
 */
export function SlideArtwork({
  active,
  artworkUrl,
  kind = SlideArtworkKind.Square,
  sizeClass,
  imgDim = 56,
}: SlideArtworkProps) {
  const FallbackIcon = kind === SlideArtworkKind.Round ? UserIcon : MusicNoteIcon;
  const borderRadius = kind === SlideArtworkKind.Round ? "50%" : imgDim <= 40 ? "4px" : "6px";
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
      style={{ "--neu-light": "hsl(0 0% 100% / 0.5)", "--neu-shadow": "hsl(0 0% 0% / 0.1)" } as React.CSSProperties}
    >
      <RecessedCard.Body className="contents">
        {/* Spinning CD: mounted only for the selected row. It drops in from the
            top (mc-disc-drop-in) as the cover drops out below. Oversized + centred
            so it reads as a CD slotted into a device; the tile's `overflow:hidden`
            clips the overhang. Sits below the rim shadow only — its face is never
            dimmed. */}
        {active && (
          <div className="mc-disc-drop-in absolute inset-0 z-0 flex items-center justify-center" aria-hidden="true">
            {/* `shrink-0`: without it the row flex container shrinks the oversized
                disc's WIDTH back to the tile width while its height keeps its
                oversize, turning the round layers into a wobbling ellipse. */}
            <CDSpinArtwork className="w-[115%] h-[115%] shrink-0" />
          </div>
        )}

        {/* Cover artwork -- drops out downward when the CD slides in */}
        <div className={cn("relative z-0 w-full h-full bg-surface", active && "mc-cover-drop-out")}>
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt=""
              className="w-full h-full object-cover"
              width={imgDim}
              height={imgDim}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.src = "/og/default.jpg";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-surface-elevated">
              <FallbackIcon size={20} weight="duotone" className="text-text-muted" />
            </div>
          )}
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
