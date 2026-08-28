import { useCallback, useMemo, useState } from "react";

/** The direction a column is sorted in. */
export type SortDir = "asc" | "desc";

/** Which column a table is sorted by, and in which direction. */
export interface SortState {
  id: string;
  dir: SortDir;
}

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
  /** Which column the table sorts by before anybody clicks a header. */
  defaultSort?: SortState | null;
  /**
   * Whether a third click on the same header returns the table to the caller's
   * order. When false the header alternates between ascending and descending.
   */
  allowUnsorted?: boolean;
  /**
   * Resolves the value a column sorts on. Returning `undefined` marks the
   * column as not sortable, and clicking its header then does nothing.
   */
  getSortKey: (columnId: string) => ((row: T) => string | number) | undefined;
}

interface UseTableSortResult<T> {
  /** The active sort, or `null` while the rows are in the caller's order. */
  sort: SortState | null;
  /** Advances the given column through ascending, descending and unsorted. */
  toggleSort: (columnId: string) => void;
  /** The rows in the order they should render. */
  sortedRows: T[];
}

/**
 * Holds the sort state of a table and returns the rows in the resulting order.
 *
 * Numbers are compared by value. Everything else is compared as text with the
 * German collator, `numeric` so that "Track 2" precedes "Track 10", and
 * `sensitivity: "base"` so that case and accents do not separate otherwise
 * equal entries.
 *
 * @param options - The rows, the starting sort and the sort key resolver.
 * @returns The active sort, the toggle for a column, and the sorted rows.
 */
export function useTableSort<T>({
  rows,
  defaultSort = null,
  allowUnsorted = true,
  getSortKey,
}: UseTableSortOptions<T>): UseTableSortResult<T> {
  const [sort, setSort] = useState<SortState | null>(() => defaultSort);

  const toggleSort = useCallback(
    (columnId: string) => {
      if (!getSortKey(columnId)) return;
      setSort((previous) => {
        if (!previous || previous.id !== columnId) return { id: columnId, dir: "asc" };
        if (previous.dir === "asc") return { id: columnId, dir: "desc" };
        return allowUnsorted ? null : { id: columnId, dir: "asc" };
      });
    },
    [allowUnsorted, getSortKey],
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const sortKey = getSortKey(sort.id);
    if (!sortKey) return rows;

    return sortRowsByComparison(rows, (a, b) => {
      const left = sortKey(a);
      const right = sortKey(b);
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), "de", { numeric: true, sensitivity: "base" });
      return sort.dir === "asc" ? comparison : -comparison;
    });
  }, [rows, sort, getSortKey]);

  return { sort, toggleSort, sortedRows };
}
