import { PageDisplayMode, type PublicContentPage } from "@musiccloud/shared";

/**
 * State shape of the content-overlay reducer.
 *
 * @property page - The overlay's currently displayed content page, or `null` when closed.
 * @property previousTitle - The `document.title` captured before the overlay opened, restored on close.
 * @property previousUrl - The URL to return to when the overlay closes (history push target).
 */
export interface OverlayState {
  page: PublicContentPage | null;
  previousTitle: string | null;
  previousUrl: string | null;
}

/**
 * Computes the overlay reducer's initial state from an optionally SSR-provided page.
 *
 * Lives in this plain module (not in `OverlayContext.tsx`) so the context file
 * exports only its React component, keeping it Fast-Refresh-eligible.
 *
 * Behaviour:
 * - No page, or a `Fullscreen` page → closed state (fullscreen pages render as a
 *   full route, not as an overlay).
 * - During SSR (`window` undefined) → the page is set but no previous title/URL
 *   is captured (there is no document to read from).
 * - On a direct browser load of an overlay page → captures the current
 *   `document.title` and pins the close target to the homepage (`/`), because a
 *   direct SSR load of e.g. `/info` has no meaningful in-app page to return to.
 *
 * @param initialPage - The page to seed the overlay with (SSR direct-load), or `null`/`undefined`.
 * @returns The initial {@link OverlayState}.
 */
export function initialOverlayState(initialPage: PublicContentPage | null | undefined): OverlayState {
  if (!initialPage || initialPage.displayMode === PageDisplayMode.Fullscreen) {
    return { page: null, previousTitle: null, previousUrl: null };
  }
  if (typeof window === "undefined") {
    return { page: initialPage, previousTitle: null, previousUrl: null };
  }
  return {
    page: initialPage,
    previousTitle: document.title,
    // `initialPage` is only set on a direct SSR load of an overlay page (menu
    // opens go through `open()` with `initialPage=null`). Closing should return
    // to the landing page rather than stay on e.g. `/info`, so the previous URL
    // is the homepage.
    previousUrl: "/",
  };
}
