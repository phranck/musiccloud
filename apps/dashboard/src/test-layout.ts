import { vi } from "vitest";

/**
 * Gives every element the given rendered width for the rest of a test.
 *
 * jsdom lays nothing out and reports every box as zero wide. A table measures
 * its own width to decide whether its secondary columns show, so a test about
 * those columns states the width it assumes.
 *
 * @param width - The width every element reports, in pixels.
 * @returns The spy, which `vi.restoreAllMocks()` removes.
 */
export function renderElementsAtWidth(width: number) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width,
    height: 40,
    right: width,
    bottom: 40,
    toJSON: () => ({}),
  } as DOMRect);
}
