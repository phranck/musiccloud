import { navigate } from "astro:transitions/client";
import type { PublicContentPage } from "@musiccloud/shared";
import { type ReactNode, useCallback, useEffect, useMemo, useReducer } from "react";
import { initialOverlayState, type OverlayState } from "./overlayState";
import { OVERLAY_OPEN_EVENT, type OverlayAPI, OverlayCtx, PRESENCE_FLAG } from "./useOverlay";

const OverlayActionType = {
  Open: "open",
  Close: "close",
} as const;

type OverlayAction =
  | { type: typeof OverlayActionType.Open; page: PublicContentPage; previousTitle: string; previousUrl: string }
  | { type: typeof OverlayActionType.Close };

function reducer(_state: OverlayState, action: OverlayAction): OverlayState {
  if (action.type === OverlayActionType.Open) {
    return {
      page: action.page,
      previousTitle: action.previousTitle,
      previousUrl: action.previousUrl,
    };
  }
  return { page: null, previousTitle: null, previousUrl: null };
}

interface OverlayOpenDetail {
  slug: string;
  source?: string;
}

async function fetchOverlayPage(slug: string, signal: AbortSignal): Promise<PublicContentPage | null> {
  const res = await fetch(`/api/v1/content/${slug}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  return res.ok ? ((await res.json()) as PublicContentPage) : null;
}

export function OverlayProvider({
  children,
  initialPage = null,
}: {
  children: ReactNode;
  initialPage?: PublicContentPage | null;
}) {
  const [state, dispatch] = useReducer(reducer, initialPage, initialOverlayState);

  const open = useCallback((page: PublicContentPage) => {
    if (typeof window === "undefined") {
      dispatch({ type: OverlayActionType.Open, page, previousTitle: "", previousUrl: "" });
      return;
    }
    dispatch({
      type: OverlayActionType.Open,
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
    dispatch({ type: OverlayActionType.Close });
  }, [state.previousTitle, state.previousUrl]);

  // Back-button support: when the overlay is open and user hits Back,
  // close the overlay instead of full-page navigating away.
  useEffect(() => {
    if (!state.page || typeof window === "undefined") return;
    function onPop() {
      dispatch({ type: OverlayActionType.Close });
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const page = await fetchOverlayPage(detail.slug, controller.signal);
        if (!page) {
          navigate(`/${detail.slug}`);
          return;
        }
        open(page);
      } catch {
        navigate(`/${detail.slug}`);
      } finally {
        clearTimeout(timeout);
      }
    }
    window.addEventListener(OVERLAY_OPEN_EVENT, onOpenEvent);
    return () => window.removeEventListener(OVERLAY_OPEN_EVENT, onOpenEvent);
  }, [open]);

  const value = useMemo<OverlayAPI>(() => ({ page: state.page, open, close }), [state.page, open, close]);
  return <OverlayCtx.Provider value={value}>{children}</OverlayCtx.Provider>;
}
