import { MusicNoteIcon, UserIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
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

  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (active) {
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
  }, [active]);

  return (
    <RecessedCard
      className={cn(sizeClass, "p-0 flex-shrink-0 relative overflow-hidden [&::before]:z-10")}
      radius={borderRadius}
      borderWidth="1px"
      style={{ "--neu-light": "hsl(0 0% 100% / 0.5)", "--neu-shadow": "hsl(0 0% 0% / 0.1)" } as React.CSSProperties}
    >
      <RecessedCard.Body className="contents">
        {/* CD spinner -- only mounted for the selected row */}
        {active && (
          <div
            className={cn(
              "absolute inset-0 z-0 transition-transform duration-[420ms] ease-in-out",
              entered ? "translate-y-0" : "-translate-y-full",
            )}
          >
            <CDSpinArtwork className="w-full h-full" />
          </div>
        )}

        {/* Cover artwork -- pushed down when CD slides in */}
        <div
          className={cn(
            "relative z-0 transition-transform duration-[420ms] ease-in-out w-full h-full bg-surface",
            active && entered ? "translate-y-full" : "translate-y-0",
          )}
        >
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt=""
              className="w-full h-full object-cover"
              width={imgDim}
              height={imgDim}
              loading="lazy"
              decoding="async"
              style={{ borderRadius: "var(--neu-radius-inner)" }}
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

        {/* Inner shadow overlay -- stays on top of both CD and cover */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            borderRadius: "var(--neu-radius-inner)",
            boxShadow: innerShadow,
          }}
        />
      </RecessedCard.Body>
    </RecessedCard>
  );
}
