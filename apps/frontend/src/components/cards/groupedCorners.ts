import type { CSSProperties } from "react";

/**
 * The grouped-list corner rule from `AGENTS.md`, stated once. Every row or tile
 * of a group inside a recessed well takes the small interior radius, and only
 * the corners that meet the well's rounded corners take the full control
 * radius. The single-column lists apply it by position, the two-column platform
 * grid by its own column arithmetic, and the genre columns through
 * `useGroupedCorners`, which adds the one fact a position cannot tell: whether
 * the list reaches the well's bottom.
 */

/** Promoted corner, where a row or tile meets the well's rounded corner: the control's own radius. */
export const GROUPED_CORNER_FULL = "var(--neu-radius)";

/** Interior corner between grouped rows or tiles, capped at 5px. */
export const GROUPED_CORNER_INNER = "min(5px, var(--neu-radius))";

/**
 * Carries a row's resolved control radius into its nested artwork frame. The
 * frame has a smaller `--neu-radius` of its own, so it reads the row's value
 * through this property, which the row resolves before it is inherited.
 */
const GROUPED_ROW_RADIUS = "var(--mc-grouped-row-radius)";

/** Promoted artwork corner, concentric with its row: the row radius less the row's `--mc-pad-track` padding. */
export const GROUPED_ARTWORK_OUTER = `max(0px, calc(${GROUPED_ROW_RADIUS} - var(--mc-pad-track, 0.25rem)))`;

/** Interior artwork corner, capped at 5px against the row's radius. */
export const GROUPED_ARTWORK_INNER = `min(5px, ${GROUPED_ROW_RADIUS})`;

/** Which of the well's rounded edges a single-column list meets. Both default to `true`. */
export interface GroupedListEdges {
  /** The first row meets the well's top corners; `false` when a header sits above the rows inside the well. */
  top?: boolean;
  /** The last row meets the well's bottom corners; `false` when the list ends above the well's bottom. */
  bottom?: boolean;
}

/**
 * Whether the row at `index` takes the well's top and bottom corners.
 *
 * @param index - Zero-based position of the row.
 * @param count - Number of rows in the list.
 * @param edges - Which of the well's edges the list meets.
 * @returns The promotion of the row's top and bottom corners.
 */
function promotedEdges(index: number, count: number, edges: GroupedListEdges): { top: boolean; bottom: boolean } {
  return {
    top: (edges.top ?? true) && index === 0,
    bottom: (edges.bottom ?? true) && index === count - 1,
  };
}

/**
 * Computes the four corners of one row in a single-column grouped list.
 *
 * Every row spans the list's full width, so a row's right corners follow its
 * left ones, and its position alone decides them. The row also carries
 * `--mc-grouped-row-radius`, which its artwork frame reads.
 *
 * @param index - Zero-based position of the row.
 * @param count - Number of rows in the list.
 * @param edges - Which of the well's edges the list meets; see {@link GroupedListEdges}.
 * @returns The row's corner radii and its `--mc-grouped-row-radius`.
 */
export function singleColumnGroupedCornerStyle(
  index: number,
  count: number,
  edges: GroupedListEdges = {},
): CSSProperties {
  const { top, bottom } = promotedEdges(index, count, edges);

  return {
    "--mc-grouped-row-radius": GROUPED_CORNER_FULL,
    borderTopLeftRadius: top ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderTopRightRadius: top ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderBottomLeftRadius: bottom ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
    borderBottomRightRadius: bottom ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER,
  } as CSSProperties;
}

/**
 * Computes the corners for square artwork hugging the left edge of a grouped
 * row. Its right corners stay interior, and its promoted left corners stay
 * concentric with the row's.
 *
 * @param index - Zero-based position of the row.
 * @param count - Number of rows in the list.
 * @param edges - Which of the well's edges the list meets; see {@link GroupedListEdges}.
 * @returns The artwork frame's corner radii.
 */
export function singleColumnGroupedArtworkCornerStyle(
  index: number,
  count: number,
  edges: GroupedListEdges = {},
): CSSProperties {
  const { top, bottom } = promotedEdges(index, count, edges);

  return {
    borderTopLeftRadius: top ? GROUPED_ARTWORK_OUTER : GROUPED_ARTWORK_INNER,
    borderTopRightRadius: GROUPED_ARTWORK_INNER,
    borderBottomLeftRadius: bottom ? GROUPED_ARTWORK_OUTER : GROUPED_ARTWORK_INNER,
    borderBottomRightRadius: GROUPED_ARTWORK_INNER,
  };
}
