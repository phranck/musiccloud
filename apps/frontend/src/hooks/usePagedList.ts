import { useCallback, useState } from "react";

/** Default number of items shown per page. */
const DEFAULT_PAGE_SIZE = 5;

interface UsePagedListOptions {
  /** Items per page. Defaults to {@link DEFAULT_PAGE_SIZE}. */
  pageSize?: number;
  /**
   * When this value changes, the pager resets to page 0. Pass the list's
   * identity (e.g. the same key a parent `SmoothSwap` uses) so switching to a
   * new data set never strands the user on a stale page that only existed in
   * the previous set.
   */
  resetKey?: unknown;
}

/** Current page slice plus pager state and step callbacks. */
interface PagedList<T> {
  /** The items on the current (clamped) page. */
  page: T[];
  /** The clamped current page index (0-based). */
  pageIndex: number;
  /** Total number of pages (always at least 1). */
  pageCount: number;
  /** Whether a previous page exists. */
  canGoPrevious: boolean;
  /** Whether a next page exists. */
  canGoNext: boolean;
  /** Step to the previous page (clamped at the first page). */
  goPrevious: () => void;
  /** Step to the next page (clamped at the last page). */
  goNext: () => void;
}

/**
 * Paginates an in-memory list with a fixed page size. Holds the page index as
 * local state, clamps it so a shrinking list never strands the user past the
 * end, and slices the current page. The clamp means a list that shrinks below
 * the current page silently shows the new last page instead of an empty one.
 *
 * @typeParam T - The list item type.
 * @param items - The full list to paginate.
 * @param options - Page size and an optional reset key.
 * @returns The current page slice plus pager state and step callbacks.
 */
export function usePagedList<T>(items: T[], options: UsePagedListOptions = {}): PagedList<T> {
  const { pageSize = DEFAULT_PAGE_SIZE, resetKey } = options;
  const [pageIndex, setPageIndex] = useState(0);
  const [trackedResetKey, setTrackedResetKey] = useState(resetKey);

  // Reset to the first page when the list identity changes. Adjusting state
  // during render (React's recommended pattern over an effect) so a fresh data
  // set never opens on a stale page — no extra render pass, no flash.
  if (resetKey !== trackedResetKey) {
    setTrackedResetKey(resetKey);
    setPageIndex(0);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const page = items.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize);

  const goPrevious = useCallback(() => setPageIndex((current) => Math.max(0, current - 1)), []);
  const goNext = useCallback(() => setPageIndex((current) => Math.min(pageCount - 1, current + 1)), [pageCount]);

  return {
    page,
    pageIndex: safePageIndex,
    pageCount,
    canGoPrevious: safePageIndex > 0,
    canGoNext: safePageIndex < pageCount - 1,
    goPrevious,
    goNext,
  };
}
