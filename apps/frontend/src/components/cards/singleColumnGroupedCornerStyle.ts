import type { CSSProperties } from "react";

/** Promoted corner where a row meets a recessed well's outer curve. */
const FULL = "var(--neu-radius)";
/** Interior corner for grouped rows, capped to the shared 5px maximum. */
const INNER = "min(5px, var(--neu-radius))";
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
    "--mc-grouped-row-radius": FULL,
    borderTopLeftRadius: isFirst ? FULL : INNER,
    borderTopRightRadius: isFirst ? FULL : INNER,
    borderBottomLeftRadius: isLast ? FULL : INNER,
    borderBottomRightRadius: isLast ? FULL : INNER,
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
