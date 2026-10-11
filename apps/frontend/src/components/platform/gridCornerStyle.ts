import type { CSSProperties } from "react";
import { GROUPED_CORNER_FULL, GROUPED_CORNER_INNER } from "@/components/cards/groupedCornerRadii";

/** The grid is always two columns (`grid-cols-2`). */
const GRID_COLS = 2;

/**
 * Per-corner radii for a tile so the 2-column grid reads as one rounded block
 * inscribed in its RecessedCard: a tile corner is promoted to the full outer
 * radius only where it coincides with a corner of the well; every other corner
 * stays at the small interior radius. The right-column corners (top-right,
 * bottom-right) require the tile to occupy the grid's last column. With an odd
 * tile count the last row holds a single left-column tile, so the well's
 * bottom-right corner is unoccupied and that lone tile keeps an interior
 * bottom-right. Index-based (not layout-read) so it is immune to the GSAP Flip
 * reflow.
 *
 * @param index Zero-based position of the tile in display order.
 * @param count Total number of visible tiles in the grid.
 * @returns Inline per-corner `border-*-radius` values for the tile.
 */
export function gridCornerStyle(index: number, count: number): CSSProperties {
  const row = Math.floor(index / GRID_COLS);
  const col = index % GRID_COLS;
  const lastRow = Math.floor((count - 1) / GRID_COLS);
  const lastCol = GRID_COLS - 1;
  const tl = row === 0 && col === 0;
  const tr = row === 0 && col === lastCol;
  const bl = row === lastRow && col === 0;
  const br = row === lastRow && col === lastCol;
  return {
    borderTopLeftRadius: tl ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderTopRightRadius: tr ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderBottomLeftRadius: bl ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderBottomRightRadius: br ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
  };
}
