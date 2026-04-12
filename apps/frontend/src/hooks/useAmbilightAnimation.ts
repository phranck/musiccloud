import { type RefObject, useEffect } from "react";

/**
 * Siri-style ambilight ring animation -- pure CSS, zero JS per frame.
 *
 * Uses CSS @property to animate the conic-gradient origin angle and
 * hue-rotate filter. Fully GPU-accelerated, no requestAnimationFrame.
 *
 * Respects `prefers-reduced-motion` and disables on touch devices.
 */
export function useAmbilightAnimation(ref: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (motionQuery.matches) {
      el.style.background =
        "conic-gradient(from 0deg, hsla(200, 75%, 60%, 0.5), hsla(320, 75%, 60%, 0.5), hsla(80, 75%, 60%, 0.5), hsla(200, 75%, 60%, 0.5))";
      return;
    }

    if (window.matchMedia("(pointer: coarse)").matches) return;

    el.style.background = [
      "conic-gradient(from var(--ambilight-angle),",
      "transparent 0deg,",
      "hsla(200, 75%, 60%, 0.8) 30deg,",
      "hsla(200, 75%, 60%, 0.8) 60deg,",
      "transparent 90deg,",
      "transparent 120deg,",
      "hsla(320, 75%, 60%, 0.8) 150deg,",
      "hsla(320, 75%, 60%, 0.8) 180deg,",
      "transparent 210deg,",
      "transparent 240deg,",
      "hsla(80, 75%, 60%, 0.4) 270deg,",
      "hsla(80, 75%, 60%, 0.4) 330deg,",
      "transparent 360deg)",
    ].join(" ");

    el.style.filter = "hue-rotate(var(--ambilight-hue))";
    el.style.animation = "ambilight-spin 12s linear infinite";
  }, [ref]);
}
