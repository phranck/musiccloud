import { useEffect, useState } from "react";

/**
 * Read whether a media query currently matches, guarding against SSR and
 * environments without `matchMedia`. Used both for the hook's initial state and
 * as a standalone check.
 *
 * @param query - the media query string to evaluate
 * @returns true when the query matches, false when it does not or when
 *   `window.matchMedia` is unavailable (e.g. server render)
 */
function getMediaQueryMatch(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

/**
 * Subscribe to a CSS media query and re-render when its match state changes.
 *
 * SSR-safe: starts from {@link getMediaQueryMatch} (false on the server) and
 * only attaches a listener after mount. Supports the legacy
 * `addListener`/`removeListener` API for older browsers that lack
 * `addEventListener` on `MediaQueryList`.
 *
 * @param query - the media query string to watch (e.g. `"(max-width: 767px)"`)
 * @returns the current match state, updated as the query toggles
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMediaQueryMatch(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    const legacyMediaQuery = mediaQuery as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    legacyMediaQuery.addListener?.(update);
    return () => legacyMediaQuery.removeListener?.(update);
  }, [query]);

  return matches;
}
