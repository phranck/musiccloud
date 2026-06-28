import { type RefObject, useEffect, useRef } from "react";

/**
 * Promote the four outer corners of a group of buttons so the group reads as a
 * single rounded block inscribed in its surrounding RecessedCard.
 *
 * Mirrors the prototype's `applyGroupedCorners`: every grouped button defaults
 * to a small interior radius (`min(5px, var(--neu-radius))`) and only the
 * corners that coincide with the well's rounded corners are promoted to the
 * full control radius (`var(--neu-radius)`). Rows are read from the LIVE layout
 * (items sharing a rounded viewport top form one row), so it is agnostic to
 * column count and recomputes on reflow — a vertical list gets its first row's
 * top corners and its last row's bottom corners; a grid gets the four grid
 * corners.
 */

/** The promoted (outer) corner radius: the button's own control radius. */
const FULL = "var(--neu-radius)";
/** The interior corner radius: capped at 5px, mirroring `--mc-control-radius-inner`. */
const INNER = "min(5px, var(--neu-radius))";

/** Computes which of an item's corners are outer, then writes the radii inline. */
function applyGroupedCorners(
  container: HTMLElement,
  items: HTMLElement[],
  frameSelector?: string,
  frameInset = 0,
  promoteTop = true,
  fillFrame = false,
): void {
  if (items.length === 0) return;

  // Group items by their rounded viewport top → one entry per visual row.
  //
  // We read `getBoundingClientRect().top`, NOT `offsetTop`: when a staggered
  // entrance puts a transform on the row's wrapper, that wrapper becomes the
  // item's `offsetParent` and every `offsetTop` collapses to 0 — the whole list
  // would then group as a single row. The rect top stays correct throughout,
  // because a uniform entrance translate shifts every row by the same delta and
  // so preserves their relative ordering and spacing.
  const itemTop = new Map<HTMLElement, number>();
  for (const item of items) itemTop.set(item, Math.round(item.getBoundingClientRect().top));

  const rows = new Map<number, HTMLElement[]>();
  for (const item of items) {
    const top = itemTop.get(item)!;
    const row = rows.get(top);
    if (row) row.push(item);
    else rows.set(top, [item]);
  }
  const tops = [...rows.keys()].sort((a, b) => a - b);
  const firstTop = tops[0];
  const lastTop = tops[tops.length - 1];

  // The right content edge of the container. A tile may take the well's RIGHT
  // rounded corner only when its own right edge reaches this — so the last tile of
  // a PARTIAL final row (which stops short of the edge in a responsive auto-fill
  // grid) keeps its interior right corners, while the last tile of a FULL row, flush
  // against the edge, is promoted. The left edge needs no such test: a grid/list
  // fills from the left, so the first item of a row is always left-flush.
  const containerStyle = getComputedStyle(container);
  const contentRight =
    container.getBoundingClientRect().right -
    parseFloat(containerStyle.paddingRight) -
    parseFloat(containerStyle.borderRightWidth);
  const isRightEdge = (el: HTMLElement): boolean => el.getBoundingClientRect().right >= contentRight - 1;

  // Does the content reach the well's BOTTOM edge? A `minHeight` on the card can make
  // the surrounding RecessedCard taller than the content (e.g. a single row of covers
  // with empty space below). The grid container shrinks to the content vertically, so
  // — unlike the right edge — it is NOT the reference here: the last row may take the
  // well's bottom corners only when it actually reaches the well's bottom content edge.
  // The top edge needs no test: the content sits flush against the well's top.
  const well = container.closest(".recessed-gradient-border") ?? container;
  const wellStyle = getComputedStyle(well);
  const wellBottom =
    well.getBoundingClientRect().bottom - parseFloat(wellStyle.paddingBottom) - parseFloat(wellStyle.borderBottomWidth);
  const reachesBottom = container.getBoundingClientRect().bottom >= wellBottom - 1;

  for (const item of items) {
    const top = itemTop.get(item)!;
    const row = rows.get(top) ?? [item];
    // `promoteTop` is false when a header sits above the rows inside the same
    // well (genre columns): the rows then never reach the well's top corners.
    const tl = promoteTop && top === firstTop && item === row[0];
    const tr = promoteTop && top === firstTop && isRightEdge(item);
    const bl = reachesBottom && top === lastTop && item === row[0];
    const br = reachesBottom && top === lastTop && isRightEdge(item);
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
    if (fillFrame) {
      // A frame that FILLS the item (e.g. a grid tile's square cover): all four of
      // its corners follow the item's — promoted at the group's outer corners,
      // interior elsewhere — concentric (minus the inset).
      frame.style.borderTopLeftRadius = tl ? concentric(buttonStyle.borderTopLeftRadius) : INNER;
      frame.style.borderTopRightRadius = tr ? concentric(buttonStyle.borderTopRightRadius) : INNER;
      frame.style.borderBottomLeftRadius = bl ? concentric(buttonStyle.borderBottomLeftRadius) : INNER;
      frame.style.borderBottomRightRadius = br ? concentric(buttonStyle.borderBottomRightRadius) : INNER;
    } else {
      // A left-hugging frame (e.g. the track artwork): its left corners follow the
      // button's left corners but concentric (minus the inset); right (interior)
      // corners stay small.
      frame.style.borderTopLeftRadius = tl ? concentric(buttonStyle.borderTopLeftRadius) : INNER;
      frame.style.borderBottomLeftRadius = bl ? concentric(buttonStyle.borderBottomLeftRadius) : INNER;
      frame.style.borderTopRightRadius = INNER;
      frame.style.borderBottomRightRadius = INNER;
    }
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
 * @param options.promoteTop Whether the top corners may be promoted. Pass `false`
 *   when a header sits above the rows in the same well (e.g. genre columns), so
 *   the rows never round their top corners below the header. Defaults to `true`.
 * @param options.fillFrame Set when the per-item frame FILLS the item (a grid
 *   tile's square cover) rather than left-hugging it (a list row's artwork): all
 *   four frame corners then follow the item's instead of only the left pair.
 * @returns A ref object for the container element.
 */
export function useGroupedCorners<T extends HTMLElement = HTMLDivElement>(
  options: {
    itemSelector?: string;
    frameSelector?: string;
    frameInset?: number;
    promoteTop?: boolean;
    fillFrame?: boolean;
  } = {},
): RefObject<T | null> {
  const { itemSelector = ":scope > *", frameSelector, frameInset = 0, promoteTop = true, fillFrame = false } = options;
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const apply = () => {
      applyGroupedCorners(
        container,
        [...container.querySelectorAll<HTMLElement>(itemSelector)],
        frameSelector,
        frameInset,
        promoteTop,
        fillFrame,
      );
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
  }, [itemSelector, frameSelector, frameInset, promoteTop, fillFrame]);

  return ref;
}
