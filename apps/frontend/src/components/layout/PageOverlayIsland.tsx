import type { PublicContentPage } from "@musiccloud/shared";

import { OverlayShell } from "@/components/layout/OverlayShell";
import { OverlayProvider } from "@/context/OverlayContext";

interface Props {
  initialPage: PublicContentPage | null;
}

/**
 * Hydration entry point for the content-page overlay. Wires the overlay
 * provider around the {@link OverlayShell}, which renders the
 * draggable/resizable frame and its content. Mounted once per page as an Astro
 * island; `initialPage` is only set on a direct SSR load of an overlay page.
 *
 * @param initialPage - the page to open immediately on direct load, or null
 */
export function PageOverlayIsland({ initialPage }: Props) {
  return (
    <OverlayProvider initialPage={initialPage}>
      <OverlayShell />
    </OverlayProvider>
  );
}
