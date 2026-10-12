/**
 * The direction a column is sorted in. The values are also what the admin list
 * endpoints read as `sortDir`, so a table that sorts on the server sends them
 * unchanged.
 */
export const SortDirection = {
  Asc: "asc",
  Desc: "desc",
} as const;

export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

/** Which column a table is sorted by, and in which direction. */
export interface SortState {
  /** The id of the sorted column. */
  id: string;
  dir: SortDirection;
}

/**
 * The sort a click on a column header leads to. This is the one place the
 * cycle is written, so a table sorting in the browser and a table sorting on
 * the server step through the same sequence.
 *
 * A column that is not sorted yet starts ascending, and an ascending column
 * turns descending. A descending column then returns the rows to their given
 * order, or starts ascending again where the table has no unsorted order to
 * return to.
 *
 * @param current - The sort before the click, or `null` while unsorted.
 * @param columnId - The id of the column whose header was clicked.
 * @param allowUnsorted - Whether the cycle includes the unsorted step.
 * @returns The sort after the click, or `null` for the given order.
 */
export function nextTableSort(current: SortState | null, columnId: string, allowUnsorted: boolean): SortState | null {
  if (!current || current.id !== columnId) return { id: columnId, dir: SortDirection.Asc };
  if (current.dir === SortDirection.Asc) return { id: columnId, dir: SortDirection.Desc };
  return allowUnsorted ? null : { id: columnId, dir: SortDirection.Asc };
}

/**
 * The `aria-sort` value of a sortable column header.
 *
 * @param direction - The column's direction, or `null` when another column or
 *   none is sorted.
 * @returns `ascending`, `descending` or `none`.
 */
export function getTableSortAriaSort(direction: SortDirection | null) {
  if (direction === SortDirection.Asc) return "ascending";
  if (direction === SortDirection.Desc) return "descending";
  return "none";
}
