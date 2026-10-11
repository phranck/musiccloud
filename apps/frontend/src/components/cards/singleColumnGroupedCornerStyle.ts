import type { CSSProperties } from "react";
import { GROUPED_CORNER_FULL, GROUPED_CORNER_INNER } from "@/components/cards/groupedCornerRadii";

/** Carries a row's resolved control radius into its nested artwork frame. */
const GROUPED_ROW_RADIUS = "var(--mc-grouped-row-radius)";
/** Artwork follows the row's left edge, inset by the row's token-derived padding. */
const ARTWORK_OUTER = `max(0px, calc(${GROUPED_ROW_RADIUS} - var(--mc-pad-track, 0.25rem)))`;

/** The unpromoted artwork-frame radius inside a grouped track row. */
export const singleColumnGroupedArtworkInnerRadius = `min(5px, ${GROUPED_ROW_RADIUS})`;

/**
 * Computes the four corners of one row in a single-column grouped list.
 *
 * The first row owns the well's top corners, the last row owns its bottom
 * corners, and every other corner stays deliberately small. Unlike the
 * responsive grid helper, a single column needs no layout measurement: its
 * position is fully known during render.
 */
export function singleColumnGroupedCornerStyle(index: number, count: number): CSSProperties {
  const isFirst = index === 0;
  const isLast = index === count - 1;

  return {
    "--mc-grouped-row-radius": GROUPED_CORNER_FULL,
    borderTopLeftRadius: isFirst ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderTopRightRadius: isFirst ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderBottomLeftRadius: isLast ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderBottomRightRadius: isLast ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
  } as CSSProperties;
}

/**
 * Computes the corners for square artwork hugging the left edge of a grouped
 * track row. Its right corners remain interior; promoted left corners stay
 * concentric with their row after subtracting the row artwork inset token.
 */
export function singleColumnGroupedArtworkCornerStyle(index: number, count: number): CSSProperties {
  const isFirst = index === 0;
  const isLast = index === count - 1;

  return {
    borderTopLeftRadius: isFirst ? ARTWORK_OUTER : singleColumnGroupedArtworkInnerRadius,
    borderTopRightRadius: singleColumnGroupedArtworkInnerRadius,
    borderBottomLeftRadius: isLast ? ARTWORK_OUTER : singleColumnGroupedArtworkInnerRadius,
    borderBottomRightRadius: singleColumnGroupedArtworkInnerRadius,
  };
}
