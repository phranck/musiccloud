import type { ReactNode } from "react";
import { CoverImage } from "@/components/ui/CoverImage";
import { SlideArtwork } from "@/components/ui/SlideArtwork";
import { SlideArtworkKind } from "@/components/ui/SlideArtworkTypes";
import { cn } from "@/lib/utils";

export type ArtworkKind = "square" | "round";

export interface CandidateRowContentProps {
  /** URL of the primary artwork. Falls back to an icon if missing or if it fails to load. */
  artworkUrl?: string;
  /**
   * Fully custom artwork element — when supplied it replaces the default
   * `<img>` rendering entirely. Used by `DisambiguationPanel` to swap in
   * the vinyl-spin loading animation.
   */
  artwork?: ReactNode;
  slideArtwork?: boolean;
  slideArtworkActive?: boolean;
  /** Tile shape: `round` for artists, `square` for tracks and albums. */
  artworkKind?: ArtworkKind;
  /** Primary display string (title / name). Always visible. */
  primary: string;
  /** Optional secondary line — typically artists-joined. */
  secondary?: string;
  /** Optional tertiary line — typically album name. */
  tertiary?: string;
  /**
   * Compact variant for dense multi-column layouts (genre-search panel).
   * Shrinks the artwork tile and tightens text sizing. Default size matches
   * the single-column disambiguation layout.
   */
  compact?: boolean;
}

/**
 * The visual guts of a "result row": artwork tile on the left, up to three
 * text lines on the right. Purely presentational — the consumer wraps this
 * in whatever interactive shell it needs (`EmbossedButton`, animated
 * container, etc.).
 *
 * Rationale: `DisambiguationPanel` and `GenreSearchResults` both render
 * lists of clickable result cards with the same artwork + text pattern.
 * Keeping the row markup in one place prevents the subtle drift that
 * always happens when the same structure lives in two files.
 *
 * ### Accessibility
 *
 * The `<img>` gets `alt=""` because the row's parent button is expected
 * to carry a meaningful `aria-label`. Duplicating the track title into
 * the image alt would cause screen readers to announce it twice.
 */
export function CandidateRowContent({
  artworkUrl,
  artwork,
  slideArtwork = false,
  slideArtworkActive = false,
  artworkKind = "square",
  primary,
  secondary,
  tertiary,
  compact = false,
}: CandidateRowContentProps) {
  const artworkSize = compact ? "w-12 h-12 md:w-14 md:h-14" : "w-14 h-14 md:w-16 md:h-16";
  const artworkShape = artworkKind === "round" ? "rounded-full" : "rounded-md";
  // `mc-row-art` marks the left-hugging frame so a grouped list (useGroupedCorners
  // with `frameSelector=".mc-row-art"`) can promote its left corners concentrically.
  // Only SQUARE artwork is such a frame; a round avatar keeps its 50% radius and
  // must not carry the marker, or the hook would square it off.
  const artworkClasses = cn(
    artworkSize,
    artworkShape,
    artworkKind === "square" && "mc-row-art",
    "overflow-hidden shadow-md flex-shrink-0 bg-surface",
  );
  const imgDim = compact ? 56 : 64;
  const iconSize = compact ? 20 : 24;
  const slideKind = artworkKind === "round" ? SlideArtworkKind.Round : SlideArtworkKind.Square;

  const primaryClass = compact ? "text-sm" : "text-base";
  const secondaryClass = compact ? "text-xs" : "text-sm";
  const tertiaryClass = compact ? "text-[10px]" : "text-xs";

  return (
    <>
      {artwork ??
        (slideArtwork ? (
          <SlideArtwork
            active={slideArtworkActive}
            artworkUrl={artworkUrl}
            kind={slideKind}
            sizeClass={artworkSize}
            imgDim={imgDim}
          />
        ) : (
          <div className={artworkClasses}>
            <CoverImage artworkUrl={artworkUrl} kind={artworkKind} imgDim={imgDim} iconSize={iconSize} />
          </div>
        ))}

      <div className="flex-1 min-w-0">
        <p className={cn(primaryClass, "font-medium tracking-[-0.01em] text-text-primary truncate")}>{primary}</p>
        {secondary && <p className={cn(secondaryClass, "text-text-secondary truncate mt-0.5")}>{secondary}</p>}
        {tertiary && <p className={cn(tertiaryClass, "text-text-muted truncate mt-0.5")}>{tertiary}</p>}
      </div>
    </>
  );
}
