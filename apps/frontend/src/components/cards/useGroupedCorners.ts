import { type CSSProperties, type RefObject, useEffect, useRef } from "react";
import {
  type GroupedListEdges,
  singleColumnGroupedArtworkCornerStyle,
  singleColumnGroupedCornerStyle,
} from "@/components/cards/groupedCorners";

/**
 * Applies the grouped-corner rule from `groupedCorners.ts` to a single-column
 * list whose bottom edge is not known at render time.
 *
 * The rule itself is the one the declarative lists use. This hook only adds
 * what needs the live layout: whether the last row meets the well's bottom,
 * which is the one thing a row's index cannot tell.
 */

/** The recessed well whose bottom edge the list may reach. */
const WELL_SELECTOR = ".recessed-gradient-border";

/**
 * Writes a style object from `groupedCorners.ts` onto an element, custom
 * properties included, since `Object.assign` on `style` skips those.
 *
 * @param element - The row or frame to style.
 * @param style - The corner style to apply.
 */
function writeStyle(element: HTMLElement, style: CSSProperties): void {
  for (const [property, value] of Object.entries(style)) {
    element.style.setProperty(property.startsWith("--") ? property : toKebabCase(property), String(value));
  }
}

/**
 * Turns a camel-cased style key such as `borderTopLeftRadius` into the CSS
 * property name `setProperty` expects.
 *
 * @param property - The camel-cased key.
 * @returns The kebab-cased CSS property name.
 */
function toKebabCase(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Reads whether the list reaches its well's bottom edge, then gives every row,
 * and its artwork frame where there is one, the corners of its position.
 *
 * A genre column's well stretches to the tallest column in its row, so a
 * shorter column ends above it, and its last row keeps interior corners. The
 * list container carries no transform of its own, so its rect is its layout
 * box even while its rows enter scaled. The top edge needs no reading, because
 * the list sits flush against the well's top or a header.
 *
 * @param container - The list element.
 * @param items - The rows in display order.
 * @param frameSelector - Selector for each row's left-hugging artwork frame, if any.
 * @param promoteTop - Whether the first row may take the well's top corners.
 */
function applyGroupedCorners(
  container: HTMLElement,
  items: HTMLElement[],
  frameSelector: string | undefined,
  promoteTop: boolean,
): void {
  if (items.length === 0) return;

  const well = container.closest(WELL_SELECTOR) ?? container;
  const wellStyle = getComputedStyle(well);
  const wellBottom =
    well.getBoundingClientRect().bottom - parseFloat(wellStyle.paddingBottom) - parseFloat(wellStyle.borderBottomWidth);
  const edges: GroupedListEdges = {
    top: promoteTop,
    bottom: container.getBoundingClientRect().bottom >= wellBottom - 1,
  };

  items.forEach((item, index) => {
    writeStyle(item, singleColumnGroupedCornerStyle(index, items.length, edges));
    if (!frameSelector) return;
    const frame = item.querySelector<HTMLElement>(frameSelector);
    if (frame) writeStyle(frame, singleColumnGroupedArtworkCornerStyle(index, items.length, edges));
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
 * @param options.promoteTop Whether the top corners may be promoted. Pass `false`
 *   when a header sits above the rows in the same well (e.g. genre columns), so
 *   the rows never round their top corners below the header. Defaults to `true`.
 * @returns A ref object for the container element.
 */
export function useGroupedCorners<T extends HTMLElement = HTMLDivElement>(
  options: { itemSelector?: string; frameSelector?: string; promoteTop?: boolean } = {},
): RefObject<T | null> {
  const { itemSelector = ":scope > *", frameSelector, promoteTop = true } = options;
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const apply = () => {
      applyGroupedCorners(
        container,
        [...container.querySelectorAll<HTMLElement>(itemSelector)],
        frameSelector,
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
  }, [itemSelector, frameSelector, promoteTop]);

  return ref;
}
