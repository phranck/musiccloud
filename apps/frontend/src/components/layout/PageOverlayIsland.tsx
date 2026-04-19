import type { PublicContentPage } from "@musiccloud/shared";
import { useEffect } from "react";

import { overlayClasses } from "@/components/layout/PageOverlay";
import {
  EmbossedOverlayContent,
  TranslucentOverlayContent,
} from "@/components/layout/PageOverlayContent";
import { OverlayProvider, useOverlay } from "@/context/OverlayContext";
import { LocaleProvider } from "@/i18n/context";
import { cn } from "@/lib/utils";

interface Props {
  initialPage: PublicContentPage | null;
}

export function PageOverlayIsland({ initialPage }: Props) {
  return (
    <LocaleProvider>
      <OverlayProvider>
        <OverlayShell initialPage={initialPage} />
      </OverlayProvider>
    </LocaleProvider>
  );
}

function OverlayShell({ initialPage }: Props) {
  const { page, open, close } = useOverlay();

  // On mount: if the Astro server rendered a content page with overlay mode,
  // open the overlay immediately so the user lands on the deep-linked state.
  useEffect(() => {
    if (initialPage && initialPage.displayMode !== "fullscreen") {
      open(initialPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC closes the overlay.
  useEffect(() => {
    if (!page) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, close]);

  if (!page || page.displayMode === "fullscreen") return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close overlay"
        onClick={close}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm cursor-default"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
        <div
          className={cn(
            "pointer-events-auto relative",
            overlayClasses(
              page.displayMode as "embossed" | "translucent",
              page.overlayWidth,
              page.overlayHeight,
            ),
          )}
        >
          {page.displayMode === "translucent" ? (
            <TranslucentOverlayContent page={page} onClose={close} />
          ) : (
            <EmbossedOverlayContent page={page} onClose={close} />
          )}
        </div>
      </div>
    </>
  );
}
