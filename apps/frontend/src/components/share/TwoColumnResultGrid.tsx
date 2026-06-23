import type { ReactNode } from "react";
import { TWO_COLUMN_TOTAL_W } from "@/components/share/twoColumnGeometry";
import { cn } from "@/lib/utils";

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
