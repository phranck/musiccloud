import { type CSSProperties, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";
import {
  type NormalizedVfdLine,
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
    if (!previousLine || sameLinePresentation(previousLine, line)) return;
    if (
      previousLine.contentKey !== line.contentKey &&
      line.transition !== VfdContentTransition.None &&
      !prefersReducedMotion
    ) {
      state.transitions.set(index, { previous: previousLine, startedAt: now, durationMs: VFD_LINE_SWAP_MS });
    } else {
      state.transitions.delete(index);
    }
  });
  for (const rowIndex of Array.from(state.transitions.keys())) {
    if (rowIndex >= rowCount) state.transitions.delete(rowIndex);
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
  VfdSectionCellsMode,
} from "@/components/ui/VfdDisplayTypes";
export {
  VfdBarAnchor,
  VfdBrightness,
  VfdContentTransition,
  VfdMarqueeMode,
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
  const frameRef = useRef<number | null>(null);
  const requestDrawRef = useRef<(() => void) | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const normalizedLines = useMemo(
    () => Array.from({ length: rowCount }, (_, index) => normalizeLine(index, lines[index])),
    [lines, rowCount],
  );

  const renderStateRef = useRef<VfdCanvasRenderState>({
    lines: normalizedLines,
    transitions: new Map(),
    marqueeStates: new Map(),
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

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const element = vfdRef.current;
    if (!canvas || !element) return;

    let disposed = false;
    const draw = (now: number) => {
      frameRef.current = null;
      if (disposed) return;
      const colors = resolveCanvasColors(element);
      const hasActiveAnimation = drawVfdCanvas(canvas, renderStateRef.current, colors, now);
      if (hasActiveAnimation) requestFrame();
    };
    const requestFrame = () => {
      if (frameRef.current !== null || disposed) return;
      frameRef.current = window.requestAnimationFrame(draw);
    };

    requestDrawRef.current = requestFrame;
    requestFrame();

    return () => {
      disposed = true;
      requestDrawRef.current = null;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
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
    "--mc-vfd-cells": cellCount,
    "--mc-vfd-row-height": `${VFD_BAND_HEIGHT}px`,
    "--mc-vfd-row-gap": `${VFD_ROW_GAP}px`,
    "--mc-vfd-row-width": `${canvasWidth}px`,
    "--mc-vfd-display-height": `${canvasHeight}px`,
  } as CSSProperties;

  return (
    <RecessedCard className={cn("p-0.5", className)} radius={recessedSurfaceRadius}>
      <RecessedCard.Body>
        <section ref={vfdRef} className={cn("mc-vfd", VFD_DEVICE_CLASSES)} style={style} aria-label={ariaLabel}>
          <canvas
            ref={canvasRef}
            className="mc-vfd-canvas"
            width={canvasWidth}
            height={canvasHeight}
            style={{ inlineSize: `${canvasWidth}px`, blockSize: `${canvasHeight}px` }}
          />
        </section>
      </RecessedCard.Body>
    </RecessedCard>
  );
}
