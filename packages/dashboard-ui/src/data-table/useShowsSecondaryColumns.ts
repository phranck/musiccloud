import { useLayoutEffect, useState } from "react";

/**
 * How wide a table has to be, in rem, before it shows its secondary columns.
 *
 * In rem rather than pixels because the columns are sized in rem, so the point
 * at which they fit moves with the root font size.
 */
const SECONDARY_COLUMNS_MIN_WIDTH_REM = 64;

/**
 * Whether a table is wide enough for its secondary columns, measured on the
 * element the table renders into rather than on the window.
 *
 * A table may sit in a page of its own or in one half of a two-column page, so
 * the window says little about the room it has. The measurement runs before
 * the browser paints, which keeps a narrow table from showing every column for
 * one frame. Until there is an element to measure, every column shows.
 *
 * @param element - The table's viewport, or `null` before it is mounted.
 * @returns `true` while the element is at least
 *   {@link SECONDARY_COLUMNS_MIN_WIDTH_REM} wide.
 */
export function useShowsSecondaryColumns(element: HTMLElement | null): boolean {
  const [showsSecondary, setShowsSecondary] = useState(true);

  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => {
      const remInPixels = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setShowsSecondary(element.getBoundingClientRect().width >= SECONDARY_COLUMNS_MIN_WIDTH_REM * remInPixels);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return showsSecondary;
}
