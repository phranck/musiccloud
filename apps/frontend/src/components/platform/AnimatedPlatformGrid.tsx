import { useGSAP } from "@gsap/react";
import { compareByDisplayOrder, PLATFORM_CONFIG } from "@musiccloud/shared";
import { type CSSProperties, useMemo, useRef } from "react";
import { PlatformButton } from "@/components/platform/PlatformButton";
import { animateFlipEnter, animateFlipFrom, type CapturedFlipState, captureFlipState } from "@/lib/motion/flip";
import type { PlatformLink } from "@/lib/types/platform";

/** Promoted (outer) tile corner: the button's own control radius. */
const GRID_FULL = "var(--neu-radius)";
/** Interior tile corner, capped at 5px (mirrors `--mc-control-radius-inner`). */
const GRID_INNER = "min(5px, var(--neu-radius))";
/** The grid is always two columns (`grid-cols-2`). */
const GRID_COLS = 2;

/**
 * Per-corner radii for a tile so the 2-column grid reads as one rounded block
 * inscribed in its RecessedCard: only the four grid-corner tiles get a promoted
 * outer corner, everything else stays at the small interior radius. Index-based
 * (not layout-read) so it is immune to the GSAP Flip reflow.
 */
function gridCornerStyle(index: number, count: number): CSSProperties {
  const row = Math.floor(index / GRID_COLS);
  const col = index % GRID_COLS;
  const lastRow = Math.floor((count - 1) / GRID_COLS);
  const itemsInRow = Math.min(GRID_COLS, count - row * GRID_COLS);
  const tl = row === 0 && col === 0;
  const tr = row === 0 && col === itemsInRow - 1;
  const bl = row === lastRow && col === 0;
  const br = row === lastRow && col === itemsInRow - 1;
  return {
    borderTopLeftRadius: tl ? GRID_FULL : GRID_INNER,
    borderTopRightRadius: tr ? GRID_FULL : GRID_INNER,
    borderBottomLeftRadius: bl ? GRID_FULL : GRID_INNER,
    borderBottomRightRadius: br ? GRID_FULL : GRID_INNER,
  };
}

interface AnimatedPlatformGridProps {
  /** Platform links to render; hidden platforms are filtered out, the rest sorted by display order (importance/popularity). */
  platforms: PlatformLink[];
  /** Track/album title used for the accessible labels of the tiles. */
  songTitle: string;
}

/**
 * Two-column grid of platform link tiles that animates layout changes with
 * GSAP Flip (compositor-only) instead of layout-property transitions.
 *
 * Animation model:
 * - Every effect run captures a Flip snapshot of the wrapper + tiles into a
 *   ref. When the platform set changes (e.g. an in-place track resolve on the
 *   share page swaps the config), the next run animates FROM the previous
 *   snapshot: persisting tiles glide to their new spots, entering tiles
 *   fade+scale in, and the wrapper's size change is animated via
 *   scaleX/scaleY — its layout height changes exactly once at commit, never
 *   per frame (replaces the old `height` transition).
 * - Tiles removed by React unmount instantly (parity with the previous
 *   hand-rolled FLIP, which never animated removals either).
 * - On first mount (including hydration of the SSR-rendered share page) all
 *   tiles play the entrance tween, matching the previous behavior.
 * - Reduced motion: the flip helpers skip every tween — the DOM is already in
 *   its final state after commit (see `lib/motion/flip.ts`).
 *
 * Interruption: capturing a new snapshot force-completes an in-flight flip
 * (GSAP `FlipState` semantics), so rapid successive reflows restart cleanly
 * from the latest committed layout instead of compounding transforms.
 * Unmount cleanup is handled by `useGSAP` (context revert kills the flip).
 */
export function AnimatedPlatformGrid({ platforms, songTitle }: AnimatedPlatformGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const previousFlipStateRef = useRef<CapturedFlipState | null>(null);

  const visiblePlatforms = useMemo(
    () =>
      [...platforms]
        .filter((platform) => !PLATFORM_CONFIG[platform.platform]?.hidden)
        // Sort by curated display order (major/popular services first), not
        // alphabetically — shared SERVICE_DISPLAY_ORDER, same as the dashboard.
        .sort((a, b) => compareByDisplayOrder(a.platform, b.platform)),
    [platforms],
  );

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid) return;
      const items = Array.from(grid.children);
      const targets = [grid, ...items];
      const previousState = previousFlipStateRef.current;
      // Capture BEFORE animating: the DOM already shows the new layout here
      // (layout effect after commit), so this snapshot becomes the "before"
      // state of the NEXT reflow. Capturing also force-completes a still
      // running flip, keeping the measurement untransformed.
      previousFlipStateRef.current = captureFlipState(targets);
      if (previousState) {
        // Only the tiles go position:absolute during the flip; the wrapper
        // must stay in flow so Flip can lock its layout size while its
        // visual size change is scale-animated.
        animateFlipFrom(previousState, { targets, absolute: items });
      } else if (items.length > 0) {
        animateFlipEnter(items);
      }
    },
    { scope: gridRef, dependencies: [visiblePlatforms] },
  );

  return (
    <div ref={gridRef} className="grid grid-cols-2 gap-[var(--mc-gap-grid,0.125rem)]">
      {visiblePlatforms.map((platform, index) => (
        <div key={platform.platform} className="transform-gpu">
          <PlatformButton
            platform={platform.platform}
            url={platform.url}
            songTitle={songTitle}
            displayName={platform.displayName}
            matchMethod={platform.matchMethod}
            style={gridCornerStyle(index, visiblePlatforms.length)}
          />
        </div>
      ))}
    </div>
  );
}
