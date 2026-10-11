import { type RefObject, useEffect, useRef } from "react";
import { GROUPED_CORNER_FULL, GROUPED_CORNER_INNER } from "@/components/cards/groupedCornerRadii";

/**
 * Promote the outer corners of a single-column list of buttons so the list
 * reads as one rounded block inscribed in its surrounding RecessedCard.
 *
 * Every row defaults to the small interior radius ({@link GROUPED_CORNER_INNER}).
 * The first row's top corners and the last row's bottom corners are promoted to
 * the full control radius ({@link GROUPED_CORNER_FULL}) where they meet the
 * well's rounded corners. Whether the last row meets the well's bottom is read
 * from the live layout, which is the one thing a row's index cannot tell.
 */

/** The recessed well whose bottom edge the list may reach. */
const WELL_SELECTOR = ".recessed-gradient-border";

/** Computes which of an item's corners are outer, then writes the radii inline. */
function applyGroupedCorners(
  container: HTMLElement,
  items: HTMLElement[],
  frameSelector?: string,
  frameInset = 0,
  promoteTop = true,
): void {
  if (items.length === 0) return;

  // Does the list reach the well's BOTTOM edge? A genre column's well stretches to
  // the tallest column in its row, so a shorter column ends above it, and its last
  // row keeps interior corners. The list container carries no transform of its
  // own, so its rect is its layout box even while its rows enter scaled. The top
  // edge needs no test: the list sits flush against the well's top or a header.
  const well = container.closest(WELL_SELECTOR) ?? container;
  const wellStyle = getComputedStyle(well);
  const wellBottom =
    well.getBoundingClientRect().bottom - parseFloat(wellStyle.paddingBottom) - parseFloat(wellStyle.borderBottomWidth);
  const reachesBottom = container.getBoundingClientRect().bottom >= wellBottom - 1;
  const lastIndex = items.length - 1;

  items.forEach((item, index) => {
    // Every row of a single column spans its full width, so a row's right corners
    // follow its left ones. `promoteTop` is false when a header sits above the rows
    // inside the same well (genre columns): the rows then never reach its top corners.
    const top = promoteTop && index === 0;
    const bottom = reachesBottom && index === lastIndex;
    item.style.borderTopLeftRadius = top ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER;
    item.style.borderTopRightRadius = top ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER;
    item.style.borderBottomLeftRadius = bottom ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER;
    item.style.borderBottomRightRadius = bottom ? GROUPED_CORNER_FULL : GROUPED_CORNER_INNER;

    if (!frameSelector) return;
    const frame = item.querySelector<HTMLElement>(frameSelector);
    if (!frame) return;
    // A left-hugging frame (e.g. the track artwork): its left corners follow the
    // button's left corners but concentric (minus the inset); right corners are
    // interior and stay small. The frame has its OWN (smaller) --neu-radius, so
    // we read the BUTTON's resolved corner value rather than re-referencing the
    // var, which would resolve against the frame.
    const buttonStyle = getComputedStyle(item);
    const concentric = (corner: string) => `max(0px, calc(${corner} - ${frameInset}px))`;
    frame.style.borderTopLeftRadius = top ? concentric(buttonStyle.borderTopLeftRadius) : GROUPED_CORNER_INNER;
    frame.style.borderBottomLeftRadius = bottom ? concentric(buttonStyle.borderBottomLeftRadius) : GROUPED_CORNER_INNER;
    frame.style.borderTopRightRadius = GROUPED_CORNER_INNER;
    frame.style.borderBottomRightRadius = GROUPED_CORNER_INNER;
  });
}

/**
 * Returns a ref to attach to a single-column list container; its direct
 * children (or the elements matching `itemSelector`) get grouped corner radii
 * via {@link applyGroupedCorners}. Recomputes when the children change
 * (add/remove) and when the list or its well resizes, because either can move
 * the list's bottom against the well's.
 *
 * @param options.itemSelector CSS selector for the buttons (default: direct children).
 * @param options.frameSelector Optional selector for a per-item left-hugging frame
 *   (e.g. the track artwork) whose left corners should follow the button.
 * @param options.frameInset Padding in px between the button edge and that frame.
 * @param options.promoteTop Whether the top corners may be promoted. Pass `false`
 *   when a header sits above the rows in the same well (e.g. genre columns), so
 *   the rows never round their top corners below the header. Defaults to `true`.
 * @returns A ref object for the container element.
 */
export function useGroupedCorners<T extends HTMLElement = HTMLDivElement>(
  options: { itemSelector?: string; frameSelector?: string; frameInset?: number; promoteTop?: boolean } = {},
): RefObject<T | null> {
  const { itemSelector = ":scope > *", frameSelector, frameInset = 0, promoteTop = true } = options;
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
      );
    };
    apply();

    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(container);
    const well = container.closest(WELL_SELECTOR);
    if (well) resizeObserver.observe(well);
    // Re-run when items are added/removed (e.g. a list swaps its contents).
    const mutationObserver = new MutationObserver(apply);
    mutationObserver.observe(container, { childList: true, subtree: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [itemSelector, frameSelector, frameInset, promoteTop]);

  return ref;
}
