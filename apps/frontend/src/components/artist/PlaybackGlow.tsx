import { type RefObject, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { NowPlayingStatus } from "@/components/artist/nowPlayingTrack";
import { useIsClient } from "@/hooks/useIsClient";

/** Geometry and playback identity of the single track row whose halo is visible. */
interface PlaybackGlowProps {
  /** The scroll viewport whose first child contains the track rows. */
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Matching row index, or -1 when this list does not contain the held track. */
  rowIndex: number;
  /** Drives the same pulse as the inset frame; absent when nothing is held. */
  playback?: NowPlayingStatus;
}

/**
 * Paints the active row's outward halo above page surfaces through a body portal.
 * The list and its swap containers clip their children, so the halo cannot live
 * inside them. It mirrors the row's measured bounds and grouped corner radii,
 * follows scrolling and resizing, and clips only the hidden portion of a row.
 * It is decorative and never participates in pointer or keyboard interaction.
 * All measurement listeners and observers are released when the target changes.
 *
 * @param props - The viewport, matching row index, and current playback state.
 * @returns A body-level halo after hydration, or null during server rendering.
 */
export function PlaybackGlow({ viewportRef, rowIndex, playback }: PlaybackGlowProps) {
  const isClient = useIsClient();
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const glow = glowRef.current;
    const row = viewport?.firstElementChild?.children.item(rowIndex);
    if (!isClient || !viewport || !glow) return;
    if (!(row instanceof HTMLElement) || !playback) {
      glow.hidden = true;
      return;
    }

    /** Copies live geometry without introducing a second React playback state. */
    const update = () => {
      const bounds = row.getBoundingClientRect();
      const visible = viewport.getBoundingClientRect();
      glow.hidden =
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        visible.width <= 0 ||
        visible.height <= 0 ||
        bounds.bottom <= visible.top ||
        bounds.top >= visible.bottom ||
        bounds.right <= visible.left ||
        bounds.left >= visible.right;
      if (glow.hidden) return;

      const corners = getComputedStyle(row);
      glow.style.left = `${bounds.left}px`;
      glow.style.top = `${bounds.top}px`;
      glow.style.width = `${bounds.width}px`;
      glow.style.height = `${bounds.height}px`;
      glow.style.borderTopLeftRadius = corners.borderTopLeftRadius;
      glow.style.borderTopRightRadius = corners.borderTopRightRadius;
      glow.style.borderBottomLeftRadius = corners.borderBottomLeftRadius;
      glow.style.borderBottomRightRadius = corners.borderBottomRightRadius;
      // Visible edges let light escape; a scrolled-away edge must not cast a
      // detached halo over the hidden part of its track.
      const clip = [
        visible.top - bounds.top,
        bounds.right - visible.right,
        bounds.bottom - visible.bottom,
        visible.left - bounds.left,
      ].map((inset) => (inset > 0 ? `${inset}px` : "calc(-2 * var(--mc-focus-halo-blur))"));
      glow.style.clipPath = `inset(${clip.join(" ")})`;
    };

    /** Ignores animations elsewhere on the page, which cannot move this row. */
    const settle = (event: Event) => {
      if (event.target instanceof Element && event.target.contains(row)) update();
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(row);
    observer.observe(document.body);
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("transitionend", settle, true);
    window.addEventListener("animationend", settle, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.removeEventListener("transitionend", settle, true);
      window.removeEventListener("animationend", settle, true);
    };
  }, [isClient, viewportRef, rowIndex, playback]);

  return isClient
    ? createPortal(
        <div ref={glowRef} className="mc-playback-glow" data-playback={playback} aria-hidden="true" hidden />,
        document.body,
      )
    : null;
}
