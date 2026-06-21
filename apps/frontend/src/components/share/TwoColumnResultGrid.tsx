import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fixed column geometry shared by every desktop two-column result view. Both the
 * commercial share layout (`ShareLayout`/`DesktopShareLayout`) and the CC
 * album/artist layout (`CcEntityLayout`) render through {@link TwoColumnResultGrid},
 * so these widths are the single source of truth — keep the Tailwind grid track
 * literal (`grid-cols-[512px_512px]`) in sync with `MEDIA_W`/`ARTIST_W` here.
 */
export const MEDIA_W = 512;
export const ARTIST_W = 512;

/** Gap between the two columns (px). Internal — only feeds {@link TWO_COLUMN_TOTAL_W}. */
const GAP = 24;

/** Total fixed width of the two-column grid (`MEDIA_W + GAP + ARTIST_W`). */
export const TWO_COLUMN_TOTAL_W = MEDIA_W + GAP + ARTIST_W;

interface TwoColumnResultGridProps {
  /** Left column — the cover/player media block. */
  left: ReactNode;
  /** Right column — the artist-info column (commercial) or the track list (CC). */
  right: ReactNode;
  /** Extra classes merged onto the grid container. */
  className?: string;
}

/**
 * The desktop two-column result grid: two fixed 512px tracks with a 24px gap,
 * top-aligned and centered, activated at the `min-[1080px]` width breakpoint
 * (below it the container is hidden and each caller renders its own single-column
 * fallback). Owns only the grid geometry — the column contents are passed in, so
 * the commercial and CC result pages share one layout definition instead of
 * re-declaring the grid markup.
 *
 * @param left - The left (media) column node.
 * @param right - The right (artist-info / track-list) column node.
 * @param className - Optional extra classes for the grid container.
 */
export function TwoColumnResultGrid({ left, right, className }: TwoColumnResultGridProps) {
  return (
    <div
      className={cn("hidden min-[1080px]:grid grid-cols-[512px_512px] items-start gap-6 mx-auto", className)}
      style={{ width: `${TWO_COLUMN_TOTAL_W}px` }}
    >
      {left}
      {right}
    </div>
  );
}
