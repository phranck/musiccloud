import gsap from "gsap";
import { type CSSProperties, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DAYNESS_EVENT } from "@/components/background/glassDayness";
import { recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";
import {
  type NormalizedVfdLine,
  type VfdCanvasColors,
  type VfdCanvasRenderState,
  VfdContentTransition,
  type VfdDisplayProps,
  VfdSizingMode,
} from "@/components/ui/VfdDisplayTypes";
import { drawVfdCanvas } from "@/components/ui/vfdDisplayCanvas";
import { resolveCanvasColors } from "@/components/ui/vfdDisplayColors";
import {
  normalizePositiveInteger,
  VFD_BAND_HEIGHT,
  VFD_ROW_GAP,
  vfdCellCountForContentWidth,
  vfdContentBox,
  vfdDisplayHeight,
  vfdRowCountForContentHeight,
  vfdRowWidth,
} from "@/components/ui/vfdDisplayGeometry";
import { normalizeLine, sameLinePresentation } from "@/components/ui/vfdDisplayNormalize";
import { syncOverlayState } from "@/components/ui/vfdDisplayOverlay";
import { setupMotion } from "@/lib/motion/setup";
import { cn } from "@/lib/utils";

/**
 * Syncs a fresh set of normalized lines into the mutable canvas render state,
 * arming a swap transition for any row whose content changed (unless reduced
 * motion or `transition: none`). Shared by the React `lines` effect and the
 * imperative {@link VfdDisplayHandle.setLines} path so both behave identically.
 *
 * @param state - The mutable render snapshot the canvas reads each frame.
 * @param normalizedLines - The new line set to install.
 * @param cellCount - Current glyph-cell count.
 * @param rowCount - Current row count.
 * @param prefersReducedMotion - Whether content swaps animate.
 * @param now - Timestamp used as the transition start.
 */
function syncRenderStateLines(
  state: VfdCanvasRenderState,
  normalizedLines: NormalizedVfdLine[],
  cellCount: number,
  rowCount: number,
  prefersReducedMotion: boolean,
  now: number,
): void {
  normalizedLines.forEach((line, index) => {
    const previousLine = state.lines[index];
    if (!previousLine || sameLinePresentation(previousLine, line)) {
      // Overlays arm independently of line-text changes: a seek only bumps the
      // overlay nonce, which `sameLinePresentation` ignores, so the row takes
      // this early-return path. The `syncOverlayState` call must therefore run
      // on BOTH this path and the post-transition one below — do not hoist it
      // out as "duplicate", that would miss the unchanged-text seek case.
      syncOverlayState(state, line, index, now);
      return;
    }
    if (
      previousLine.contentKey !== line.contentKey &&
      line.transition !== VfdContentTransition.None &&
      !prefersReducedMotion
    ) {
      state.transitions.set(index, { previous: previousLine, startedAt: now, durationMs: VFD_LINE_SWAP_MS });
    } else {
      state.transitions.delete(index);
    }
    syncOverlayState(state, line, index, now);
  });
  for (const rowIndex of Array.from(state.transitions.keys())) {
    if (rowIndex >= rowCount) state.transitions.delete(rowIndex);
  }
  // Prune overlays orphaned by a row-count shrink (e.g. Container-mode resize):
  // a mid-flight overlay on a now-dropped row index is never revisited by the
  // render loop, so without this its entry would keep `overlays.size > 0` true
  // forever and the shared ticker would never deregister.
  for (const rowIndex of Array.from(state.overlays.keys())) {
    if (rowIndex >= rowCount) state.overlays.delete(rowIndex);
  }
  state.lines = normalizedLines;
  state.cellCount = cellCount;
  state.rowCount = rowCount;
  state.prefersReducedMotion = prefersReducedMotion;
}

/** Monotonic-ish frame timestamp with a Date fallback for non-DOM environments. */
function frameNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export type {
  VfdDisplayHandle,
  VfdDisplayLine,
  VfdDisplayProps,
  VfdDisplaySection,
  VfdMarqueeModeLiteral,
  VfdPixelBarSegment,
  VfdProgress,
  VfdScrollOutOverlay,
  VfdSectionCellsMode,
} from "@/components/ui/VfdDisplayTypes";
export {
  VfdBarAnchor,
  VfdBrightness,
  VfdContentTransition,
  VfdMarqueeMode,
  VfdScrollOutDirection,
  VfdSectionAlign,
  VfdSectionCells,
  VfdSizingMode,
} from "@/components/ui/VfdDisplayTypes";

/**
 * Fixed chrome around the emulated hardware module.
 *
 * Do not use font-size or container width to infer additional VFD columns.
 * The physical pixel band is configured through `rows` and `charsPerLine`.
 */
const VFD_DEVICE_CLASSES = "px-3 py-4 text-[0.82rem] sm:text-[0.92rem]";

const VFD_LINE_SWAP_MS = 650;
const DEFAULT_VFD_ROWS = 4;
const DEFAULT_VFD_CELL_COUNT = 44;

/**
 * Reusable fixed-height VFD / dot-matrix display.
 *
 * Design notes:
 * - Canvas owns the full hardware matrix. React only supplies new line props.
 * - All glyph, marquee, and content-change movement uses integer matrix columns
 *   or rows. No per-frame React state and no CSS transforms touch lit pixels.
 * - Rows may define sections for pinned left/center/right matrix ranges. The
 *   component stays generic and does not infer product-specific semantics.
 */
export function VfdDisplay({
  lines,
  sizingMode = VfdSizingMode.Matrix,
  rows,
  charsPerLine = DEFAULT_VFD_CELL_COUNT,
  className,
  ariaLabel,
  phosphorColor,
  progress,
  controllerRef,
}: VfdDisplayProps) {
  const configuredRowCount = normalizePositiveInteger(rows ?? lines.length, DEFAULT_VFD_ROWS);
  const requestedCellCount = normalizePositiveInteger(charsPerLine, DEFAULT_VFD_CELL_COUNT);
  const fallbackCellCount = sizingMode === VfdSizingMode.Container ? 1 : requestedCellCount;
  const [layout, setLayout] = useState(() => ({
    cellCount: fallbackCellCount,
    rowCount: configuredRowCount,
  }));
  const { cellCount, rowCount } = layout;
  const vfdRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestDrawRef = useRef<(() => void) | null>(null);
  // Phosphor colors resolved OUT of the per-frame path. Re-resolving them each
  // frame appended four probe spans to the DOM every tick — the documented
  // ~60-layouts/s marquee stream. They only change with `phosphorColor` (the
  // CSS vars below) or the theme, so we cache them and refresh on those events.
  const colorsRef = useRef<VfdCanvasColors | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const normalizedLines = useMemo(
    () => Array.from({ length: rowCount }, (_, index) => normalizeLine(index, lines[index])),
    [lines, rowCount],
  );

  const renderStateRef = useRef<VfdCanvasRenderState>({
    lines: normalizedLines,
    transitions: new Map(),
    marqueeStates: new Map(),
    overlays: new Map(),
    cellCount,
    rowCount,
    prefersReducedMotion,
  });

  useLayoutEffect(() => {
    syncRenderStateLines(
      renderStateRef.current,
      normalizedLines,
      cellCount,
      rowCount,
      prefersReducedMotion,
      frameNow(),
    );
    requestDrawRef.current?.();
  }, [cellCount, normalizedLines, prefersReducedMotion, rowCount]);

  // Imperative escape hatch for high-frequency consumers (the audio analyzer
  // at 20 Hz). The consumer rebuilds the same line model and pushes it straight
  // onto the canvas render state, so the spectrum repaints without a React
  // commit. The React `lines` effect above still owns the initial frame and
  // low-frequency changes (resize, playtime, mode), and both paths funnel
  // through the same sync helper to stay consistent.
  useImperativeHandle(
    controllerRef,
    () => ({
      setLines: (nextLines) => {
        const normalized = Array.from({ length: rowCount }, (_, index) => normalizeLine(index, nextLines[index]));
        syncRenderStateLines(renderStateRef.current, normalized, cellCount, rowCount, prefersReducedMotion, frameNow());
        requestDrawRef.current?.();
      },
    }),
    [cellCount, rowCount, prefersReducedMotion],
  );

  useLayoutEffect(() => {
    const element = vfdRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      setLayout({ cellCount: fallbackCellCount, rowCount: configuredRowCount });
      return;
    }

    const updateLayout = ({ width, height }: { width: number; height: number }) => {
      const nextCellCount =
        sizingMode === VfdSizingMode.Container ? vfdCellCountForContentWidth(width) : requestedCellCount;
      const nextRowCount =
        sizingMode === VfdSizingMode.Container
          ? vfdRowCountForContentHeight(height, configuredRowCount)
          : configuredRowCount;
      setLayout((currentLayout) =>
        currentLayout.cellCount === nextCellCount && currentLayout.rowCount === nextRowCount
          ? currentLayout
          : { cellCount: nextCellCount, rowCount: nextRowCount },
      );
    };

    updateLayout(vfdContentBox(element));
    const observer = new ResizeObserver(() => {
      updateLayout(vfdContentBox(element));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [configuredRowCount, fallbackCellCount, requestedCellCount, sizingMode]);

  // Resolve the phosphor colors once per mount and whenever `phosphorColor`
  // changes — never inside the frame loop. The element carries the CSS vars by
  // the time this layout effect runs, so getComputedStyle sees the right theme.
  // phosphorColor is the re-run trigger, not a value read in the body: it sets
  // the --mc-vfd-*-color CSS vars that resolveCanvasColors reads off the DOM,
  // so the cache must refresh when it changes even though the body never reads it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: phosphorColor is a CSS-var re-run trigger, not read in the body
  useLayoutEffect(() => {
    const element = vfdRef.current;
    if (element) colorsRef.current = resolveCanvasColors(element);
  }, [phosphorColor]);

  // The phosphor colours are CSS `color-mix` on `--g-dayness`; the canvas can't
  // read that live, so on a dayness change we drop the cached colours (forcing
  // a re-resolve at the new value) and request a repaint.
  useLayoutEffect(() => {
    const onDayness = () => {
      colorsRef.current = null;
      requestDrawRef.current?.();
    };
    window.addEventListener(DAYNESS_EVENT, onDayness);
    return () => window.removeEventListener(DAYNESS_EVENT, onDayness);
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const element = vfdRef.current;
    if (!canvas || !element) return;

    setupMotion(); // tune the shared ticker (lagSmoothing); idempotent

    let disposed = false;
    let scheduled = false;

    // The draw runs on the SHARED gsap.ticker (policy 3 — no private rAF
    // source). The ticker runs continuously, so we register on demand and
    // self-deregister the instant a frame reports no active animation; a
    // marquee/line-swap keeps it registered. gsap.ticker's own time is in
    // seconds from ticker start, but the marquee/transition math is stamped
    // with performance.now(), so the callback reads frameNow() itself.
    const tick = () => {
      if (disposed) return;
      const colors = colorsRef.current ?? resolveCanvasColors(element);
      const hasActiveAnimation = drawVfdCanvas(canvas, renderStateRef.current, colors, frameNow());
      if (!hasActiveAnimation) {
        scheduled = false;
        gsap.ticker.remove(tick);
      }
    };
    const requestFrame = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      gsap.ticker.add(tick);
    };

    requestDrawRef.current = requestFrame;
    requestFrame();

    return () => {
      disposed = true;
      requestDrawRef.current = null;
      gsap.ticker.remove(tick);
    };
  }, []);

  const canvasWidth = vfdRowWidth(cellCount);
  const canvasHeight = vfdDisplayHeight(rowCount);
  const style = {
    ...(phosphorColor
      ? {
          "--mc-vfd-base-color": phosphorColor,
          "--mc-vfd-color": phosphorColor,
          "--mc-vfd-bright-color": phosphorColor,
        }
      : {}),
    // The VFD IS the recessed screen (no surrounding RecessedCard, matching the
    // reference prototype): it carries the recessed surface radius itself.
    borderRadius: recessedSurfaceRadius,
    "--mc-vfd-cells": cellCount,
    "--mc-vfd-row-height": `${VFD_BAND_HEIGHT}px`,
    "--mc-vfd-row-gap": `${VFD_ROW_GAP}px`,
    "--mc-vfd-row-width": `${canvasWidth}px`,
    "--mc-vfd-display-height": `${canvasHeight}px`,
    // Progress bar (when supplied): the display draws track + fill from its own
    // row geometry; the consumer only hands in the filled pixel width + colour.
    ...(progress
      ? {
          "--mc-vfd-progress-fill": `${progress.fillWidthPx}px`,
          ...(progress.color ? { "--mc-vfd-progress-color": progress.color } : {}),
        }
      : {}),
  } as CSSProperties;

  return (
    <section
      ref={vfdRef}
      className={cn("mc-vfd", VFD_DEVICE_CLASSES, progress && "mc-vfd--with-progress", className)}
      style={style}
      aria-label={ariaLabel}
    >
      <canvas
        ref={canvasRef}
        className="mc-vfd-canvas"
        width={canvasWidth}
        height={canvasHeight}
        style={{ inlineSize: `${canvasWidth}px`, blockSize: `${canvasHeight}px` }}
      />
    </section>
  );
}
