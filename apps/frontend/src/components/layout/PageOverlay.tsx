import type { OverlayHeight, OverlayWidth, PageDisplayMode } from "@musiccloud/shared";

import { cn } from "@/lib/utils";

const widthClass: Record<OverlayWidth, string> = {
  small: "max-w-[420px]",
  regular: "max-w-[560px]",
  big: "max-w-[820px]",
};

const heightClass: Record<OverlayHeight, string> = {
  small: "max-h-[40vh]",
  regular: "max-h-[60vh]",
  dynamic: "max-h-[85vh]",
  expanded: "h-[85vh] max-h-[85vh]",
};

/**
 * Derive the size/height Tailwind classes for an overlay-mode content page.
 * Both TranslucentCard- and EmbossedCard-based renderers feed the token set
 * through this one helper so the width/height matrix lives in exactly one
 * place.
 */
export function overlayClasses(
  _mode: Exclude<PageDisplayMode, "fullscreen">,
  w: OverlayWidth,
  h: OverlayHeight,
): string {
  return cn("w-[calc(100vw-2rem)]", widthClass[w], heightClass[h], "flex flex-col");
}
