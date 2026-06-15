import { type RefObject, useEffect, useRef } from "react";

/**
 * Promote the four outer corners of a group of buttons so the group reads as a
 * single rounded block inscribed in its surrounding RecessedCard.
 *
 * Mirrors the prototype's `applyGroupedCorners`: every grouped button defaults
 * to a small interior radius (`min(5px, var(--neu-radius))`) and only the
 * corners that coincide with the well's rounded corners are promoted to the
 * full control radius (`var(--neu-radius)`). Rows are read from the LIVE layout
 * (items sharing a rounded `offsetTop` form one row), so it is agnostic to
 * column count and recomputes on reflow — a vertical list gets its first row's
 * top corners and its last row's bottom corners; a grid gets the four grid
 * corners.
 */

/** The promoted (outer) corner radius: the button's own control radius. */
const FULL = "var(--neu-radius)";
/** The interior corner radius: capped at 5px, mirroring `--mc-control-radius-inner`. */
const INNER = "min(5px, var(--neu-radius))";

/** Computes which of an item's corners are outer, then writes the radii inline. */
function applyGroupedCorners(items: HTMLElement[], frameSelector?: string, frameInset = 0): void {
  if (items.length === 0) return;

  // Group items by rounded offsetTop → one entry per visual row.
  const rows = new Map<number, HTMLElement[]>();
  for (const item of items) {
    const top = Math.round(item.offsetTop);
    const row = rows.get(top);
    if (row) row.push(item);
    else rows.set(top, [item]);
  }
  const tops = [...rows.keys()].sort((a, b) => a - b);
  const firstTop = tops[0];
  const lastTop = tops[tops.length - 1];

  for (const item of items) {
    const row = rows.get(Math.round(item.offsetTop)) ?? [item];
    const top = Math.round(item.offsetTop);
    const tl = top === firstTop && item === row[0];
    const tr = top === firstTop && item === row[row.length - 1];
    const bl = top === lastTop && item === row[0];
    const br = top === lastTop && item === row[row.length - 1];
    item.style.borderTopLeftRadius = tl ? FULL : INNER;
    item.style.borderTopRightRadius = tr ? FULL : INNER;
    item.style.borderBottomLeftRadius = bl ? FULL : INNER;
    item.style.borderBottomRightRadius = br ? FULL : INNER;

    if (!frameSelector) continue;
    const frame = item.querySelector<HTMLElement>(frameSelector);
    if (!frame) continue;
    // A left-hugging frame (e.g. the track artwork): its left corners follow the
    // button's left corners but concentric (minus the inset); right corners are
    // interior and stay small. The frame has its OWN (smaller) --neu-radius, so
    // we read the BUTTON's resolved corner value rather than re-referencing the
    // var, which would resolve against the frame.
    const buttonStyle = getComputedStyle(item);
    const concentric = (corner: string) => `max(0px, calc(${corner} - ${frameInset}px))`;
    frame.style.borderTopLeftRadius = tl ? concentric(buttonStyle.borderTopLeftRadius) : INNER;
    frame.style.borderBottomLeftRadius = bl ? concentric(buttonStyle.borderBottomLeftRadius) : INNER;
    frame.style.borderTopRightRadius = INNER;
    frame.style.borderBottomRightRadius = INNER;
  }
}

/**
 * Returns a ref to attach to a list/grid container; its direct children (or the
 * elements matching `itemSelector`) get grouped corner radii via
 * {@link applyGroupedCorners}. Recomputes when the children change (add/remove)
 * and on container resize (reflow), so it tracks any item or column count.
 *
 * @param options.itemSelector CSS selector for the buttons (default: direct children).
 * @param options.frameSelector Optional selector for a per-item left-hugging frame
 *   (e.g. the track artwork) whose left corners should follow the button.
 * @param options.frameInset Padding in px between the button edge and that frame.
 * @returns A ref object for the container element.
 */
export function useGroupedCorners<T extends HTMLElement = HTMLDivElement>(
  options: { itemSelector?: string; frameSelector?: string; frameInset?: number } = {},
): RefObject<T | null> {
  const { itemSelector = ":scope > *", frameSelector, frameInset = 0 } = options;
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const apply = () => {
      applyGroupedCorners([...container.querySelectorAll<HTMLElement>(itemSelector)], frameSelector, frameInset);
    };
    apply();

    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(container);
    // Re-run when items are added/removed (e.g. a list swaps its contents).
    const mutationObserver = new MutationObserver(apply);
    mutationObserver.observe(container, { childList: true, subtree: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [itemSelector, frameSelector, frameInset]);

  return ref;
}
