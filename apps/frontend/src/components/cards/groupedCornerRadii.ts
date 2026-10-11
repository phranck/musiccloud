/**
 * The two corner radii of the grouped-list rule in `AGENTS.md`. Every corner of
 * a row or tile in a group takes the interior radius, and only a corner that
 * meets its well's rounded corner takes the full control radius. The
 * single-column lists, the measured genre columns and the platform grid all
 * apply that rule, so its values are defined here and nowhere else.
 */

/** Promoted corner, where a row or tile meets the well's rounded corner: the control's own radius. */
export const GROUPED_CORNER_FULL = "var(--neu-radius)";

/** Interior corner between grouped rows or tiles, capped at 5px. */
export const GROUPED_CORNER_INNER = "min(5px, var(--neu-radius))";
