import type { PublicContentPage } from "@musiccloud/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

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
    window.history.pushState({ overlay: page.slug }, "", `/${page.slug}`);
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

  const value = useMemo<OverlayAPI>(() => ({ page: state.page, open, close }), [state.page, open, close]);
  return <OverlayCtx.Provider value={value}>{children}</OverlayCtx.Provider>;
}

export function useOverlay(): OverlayAPI {
  const ctx = useContext(OverlayCtx);
  if (!ctx) throw new Error("useOverlay must be used inside OverlayProvider");
  return ctx;
}
