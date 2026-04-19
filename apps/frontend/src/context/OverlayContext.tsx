import type { PublicContentPage } from "@musiccloud/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer } from "react";

interface OverlayState {
  page: PublicContentPage | null;
  previousTitle: string | null;
  previousUrl: string | null;
}

type OverlayAction =
  | { type: "open"; page: PublicContentPage; previousTitle: string; previousUrl: string }
  | { type: "close" };

interface OverlayAPI {
  page: PublicContentPage | null;
  open: (page: PublicContentPage) => void;
  close: () => void;
}

const OverlayCtx = createContext<OverlayAPI | null>(null);

function reducer(_state: OverlayState, action: OverlayAction): OverlayState {
  if (action.type === "open") {
    return {
      page: action.page,
      previousTitle: action.previousTitle,
      previousUrl: action.previousUrl,
    };
  }
  return { page: null, previousTitle: null, previousUrl: null };
}

/** Event name fired by nav-click interception; see PageHeader.tsx. */
export const OVERLAY_OPEN_EVENT = "mc:overlay-open";

/** Flag on window set while at least one OverlayProvider is mounted. */
const PRESENCE_FLAG = "__mcOverlayActive";

interface OverlayOpenDetail {
  slug: string;
  source?: string;
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    page: null,
    previousTitle: null,
    previousUrl: null,
  });

  const open = useCallback((page: PublicContentPage) => {
    if (typeof window === "undefined") {
      dispatch({ type: "open", page, previousTitle: "", previousUrl: "" });
      return;
    }
    dispatch({
      type: "open",
      page,
      previousTitle: document.title,
      previousUrl: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    });
    if (window.location.pathname !== `/${page.slug}`) {
      window.history.pushState({ overlay: page.slug }, "", `/${page.slug}`);
    }
    document.title = page.title;
  }, []);

  const close = useCallback(() => {
    if (typeof window !== "undefined" && state.previousUrl) {
      window.history.pushState({}, "", state.previousUrl);
      if (state.previousTitle) document.title = state.previousTitle;
    }
    dispatch({ type: "close" });
  }, [state.previousTitle, state.previousUrl]);

  // Back-button support: when the overlay is open and user hits Back,
  // close the overlay instead of full-page navigating away.
  useEffect(() => {
    if (!state.page || typeof window === "undefined") return;
    function onPop() {
      dispatch({ type: "close" });
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [state.page]);

  // Advertise presence so the header can decide between client-side
  // overlay open vs full-page navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as Record<string, unknown>)[PRESENCE_FLAG] = true;
    return () => {
      (window as unknown as Record<string, unknown>)[PRESENCE_FLAG] = false;
    };
  }, []);

  // Listen for overlay-open events dispatched by nav clicks. The detail
  // carries only the slug; we fetch the full page data here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    async function onOpenEvent(event: Event) {
      const detail = (event as CustomEvent<OverlayOpenDetail>).detail;
      if (!detail?.slug) return;
      try {
        const res = await fetch(`/api/v1/content/${detail.slug}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          window.location.href = `/${detail.slug}`;
          return;
        }
        const page = (await res.json()) as PublicContentPage;
        open(page);
      } catch {
        window.location.href = `/${detail.slug}`;
      }
    }
    window.addEventListener(OVERLAY_OPEN_EVENT, onOpenEvent);
    return () => window.removeEventListener(OVERLAY_OPEN_EVENT, onOpenEvent);
  }, [open]);

  const value = useMemo<OverlayAPI>(() => ({ page: state.page, open, close }), [state.page, open, close]);
  return <OverlayCtx.Provider value={value}>{children}</OverlayCtx.Provider>;
}

/**
 * True when a PageOverlayIsland is mounted on the current page. Used by
 * PageHeader.tsx to decide whether to intercept nav clicks.
 */
export function isOverlayActive(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as Record<string, unknown>)[PRESENCE_FLAG] === true;
}

export function useOverlay(): OverlayAPI {
  const ctx = useContext(OverlayCtx);
  if (!ctx) throw new Error("useOverlay must be used inside OverlayProvider");
  return ctx;
}
