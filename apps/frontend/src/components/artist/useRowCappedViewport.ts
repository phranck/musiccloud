import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * Caps a scroll viewport at a fractional number of its content's rows/tiles, so the
 * card wraps its content exactly but never grows past `units` rows. The fractional
 * part leaves a half-row "peek" below the fold that signals the content scrolls;
 * sub-cap content shrinks the viewport to fit with no empty filler.
 *
 * The unit height is MEASURED from the live first row/tile, not a static CSS `calc`:
 * grid tiles are responsive (aspect-square at `1fr` column width), so their height
 * depends on the rendered column width and can only be read from layout. It is
 * re-measured on every reflow (column count / item changes) via a ResizeObserver on
 * the row/tile track.
 *
 * @param units - rows/tiles to show before scrolling (e.g. `4.5` list, `2.5` grid).
 *   A change re-applies the cap, so the same viewport can switch its own limit.
 * @returns A ref for the scroll viewport; its first child must be the row/tile track
 *   (the flex column / grid), whose first child is one row/tile.
 */
export function useRowCappedViewport<T extends HTMLElement = HTMLDivElement>(units: number): RefObject<T | null> {
  const ref = useRef<T>(null);

  // useLayoutEffect, not useEffect: the cap must be written before paint, so the
  // browser never shows one frame at the uncapped (full-content) height before
  // the cap applies — that one-frame "flash" is what useEffect would let through.
  useLayoutEffect(() => {
    const viewport = ref.current;
    const track = viewport?.firstElementChild as HTMLElement | null;
    if (!viewport || !track) return;

    const apply = () => {
      const first = track.firstElementChild as HTMLElement | null;
      if (!first) return;
      const unit = first.getBoundingClientRect().height;
      const gap = Number.parseFloat(getComputedStyle(track).rowGap) || 0;
      // `units` rows of content plus the gaps between the whole rows below the peek.
      viewport.style.maxHeight = `${units * unit + Math.floor(units) * gap}px`;
    };

    apply();
    // The track grows when items load and the tiles resize when the column count
    // changes; both surface as a track resize, so observe it for re-measurement.
    const observer = new ResizeObserver(apply);
    observer.observe(track);
    return () => observer.disconnect();
  }, [units]);

  return ref;
}
