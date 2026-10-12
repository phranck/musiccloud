import { useCallback, useMemo, useState } from "react";

import { nextTableSort, SortDirection, type SortState } from "../dashboard/tableSort.js";

/**
 * An array that may carry the `toSorted` method, which returns a sorted copy
 * and leaves the receiver alone. Browsers without it fall back to copying by
 * hand.
 */
type ToSortedArray<T> = T[] & {
  toSorted?: (compareFn: (a: T, b: T) => number) => T[];
};

/**
 * Sorts rows without mutating the array that was passed in, because it belongs
 * to the caller and is usually React state.
 *
 * @param rows - The rows to sort.
 * @param compare - The comparison applied to two rows.
 * @returns A sorted copy of the rows.
 */
function sortRowsByComparison<T>(rows: T[], compare: (a: T, b: T) => number): T[] {
  const toSorted = (rows as ToSortedArray<T>).toSorted;
  if (typeof toSorted === "function") {
    return toSorted.call(rows, compare);
  }
  return Array.from(rows).sort(compare);
}

interface UseTableSortOptions<T> {
  /** The rows in the order the caller supplied them. */
  rows: T[];
  /** Which column the table sorts by before anybody clicks a header. Ignored when the caller holds the sort. */
  defaultSort?: SortState | null;
  /**
   * Whether a third click on the same header returns the table to the caller's
   * order. When false the header alternates between ascending and descending.
   */
  allowUnsorted?: boolean;
  /** The ids of the columns a header click may sort. Clicking any other header does nothing. */
  sortableColumnIds: ReadonlySet<string>;
  /** Resolves the value a column sorts on when the rows are sorted here. */
  getSortKey: (columnId: string) => ((row: T) => string | number) | undefined;
  /** The sort the caller holds. Read only when `onSortChange` is given. */
  sort?: SortState | null;
  /**
   * Receives the sort a header click leads to. Given, the caller holds the
   * sort: the hook keeps no state of its own and returns the rows in the order
   * they were supplied, because the caller has already ordered them, usually
   * on a server that sees more rows than the table holds.
   */
  onSortChange?: (sort: SortState | null) => void;
}

interface UseTableSortResult<T> {
  /** The active sort, or `null` while the rows are in the caller's order. */
  sort: SortState | null;
  /** Advances the given column through the cycle `nextTableSort` defines. */
  toggleSort: (columnId: string) => void;
  /** The rows in the order they should render. */
  sortedRows: T[];
}

/**
 * Holds the sort state of a table and returns the rows in the resulting order,
 * or hands the sort to a caller that holds it.
 *
 * Rows sorted here compare numbers by value. Everything else is compared as
 * text with the German collator, `numeric` so that "Track 2" precedes
 * "Track 10", and `sensitivity: "base"` so that case and accents do not
 * separate otherwise equal entries.
 *
 * @param options - The rows, the starting sort, the sortable columns, the sort
 *   key resolver, and the caller's sort where it holds one.
 * @returns The active sort, the toggle for a column, and the rows to render.
 */
export function useTableSort<T>({
  rows,
  defaultSort = null,
  allowUnsorted = true,
  sortableColumnIds,
  getSortKey,
  sort: callerSort = null,
  onSortChange,
}: UseTableSortOptions<T>): UseTableSortResult<T> {
  const [ownSort, setOwnSort] = useState<SortState | null>(() => defaultSort);
  const sort = onSortChange ? callerSort : ownSort;

  const toggleSort = useCallback(
    (columnId: string) => {
      if (!sortableColumnIds.has(columnId)) return;
      const next = nextTableSort(sort, columnId, allowUnsorted);
      if (onSortChange) onSortChange(next);
      else setOwnSort(next);
    },
    [sort, allowUnsorted, sortableColumnIds, onSortChange],
  );

  const sortedRows = useMemo(() => {
    if (onSortChange || !sort) return rows;
    const sortKey = getSortKey(sort.id);
    if (!sortKey) return rows;

    return sortRowsByComparison(rows, (a, b) => {
      const left = sortKey(a);
      const right = sortKey(b);
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), "de", { numeric: true, sensitivity: "base" });
      return sort.dir === SortDirection.Asc ? comparison : -comparison;
    });
  }, [rows, sort, getSortKey, onSortChange]);

  return { sort, toggleSort, sortedRows };
}
