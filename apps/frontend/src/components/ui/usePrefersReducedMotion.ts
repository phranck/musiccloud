import { useEffect, useState } from "react";

/**
 * Reads the current `prefers-reduced-motion` user preference once, without
 * subscribing. Returns `false` outside the browser (during SSR) so the
 * initial render assumes motion is allowed; the subsequent
 * {@link usePrefersReducedMotion} effect corrects this if the real
 * preference disagrees.
 */
function readPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Hook returning a live `prefers-reduced-motion` flag.
 *
 * Subscribes to the matching media query so the component re-renders when
 * the user toggles the preference at the OS level. Used by the VFD pipeline
 * to suppress marquee animation and line-swap transitions, which keeps the
 * display visually quiet for users who have disabled motion.
 *
 * @returns `true` when the user has requested reduced motion.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}
