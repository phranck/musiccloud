import type { ReactNode } from "react";
import type {
  NormalizedVfdLine,
  VfdBrightness,
  VfdCanvasColors,
  VfdCanvasPixelColumn,
  VfdCanvasRenderState,
  VfdMarqueeMode,
  VfdPixelBarSegment,
  VfdSectionAlign,
} from "@/components/ui/VfdDisplayTypes";
import { EMPTY_CELL, glyphPatternFor, SPECTRUM_GLYPH_LEVELS } from "@/components/ui/VfdGlyphPatterns";
import {
  VFD_BAND_HEIGHT,
  VFD_CELL_COLUMNS,
  VFD_DOT_PITCH,
  VFD_FULL_COLUMN_MASK,
  VFD_GLYPH_COLUMNS,
  VFD_GLYPH_ROWS,
  VFD_PIXEL_SIZE,
  VFD_ROW_GAP,
  vfdColumnCountForCells,
  vfdDisplayHeight,
  vfdRowWidth,
} from "@/components/ui/vfdDisplayGeometry";
import { defaultMarqueeMode, marqueeStateFor, shouldMarquee } from "@/components/ui/vfdDisplayMarquee";
import { normalizeLine, resolveSectionCells } from "@/components/ui/vfdDisplayNormalize";

/**
 * Reduces one column of a glyph pattern into a 7-bit row mask.
 *
 * The pattern is a 7-row array of 5-character strings where `"1"` means
 * "lit" and `"0"` means "unlit". The caller picks a column index; this
 * helper walks all rows of that column and sets the matching bit of the
 * returned mask.
 */
function patternColumnMask(pattern: readonly string[], column: number): number {
  return pattern.reduce((mask, rowPattern, row) => {
    if (rowPattern[column] !== "1") return mask;
    return mask | (1 << row);
  }, 0);
}

/** Empty pixel column with the row's phosphor brightness, used as padding fill. */
function blankCanvasColumn(brightness: VfdBrightness): VfdCanvasPixelColumn {
  return { mask: 0, brightness };
}

/**
 * Builds the 5 pixel columns of one glyph cell.
 *
 * Resolves the pattern through the glyph lookup, then applies a spectrum-cap
 * highlight when the section is rendered at `bright` and the glyph is one
 * of the spectrum levels. The cap pixel takes the row mask of the topmost
 * lit row at this spectrum height; the rest of the column renders at the
 * dim phosphor, so the cap reads as a brighter "head" on top of a trailing
 * column without needing two separate render passes.
 */
function glyphCanvasPixelColumns(glyph: string, brightness: VfdBrightness): VfdCanvasPixelColumn[] {
  const pattern = glyphPatternFor(glyph);
  const spectrumLevel = SPECTRUM_GLYPH_LEVELS[glyph];
  const highlightSpectrumCap = brightness === "bright" && spectrumLevel !== undefined && spectrumLevel > 0;
  const capRowMask = highlightSpectrumCap ? 1 << (VFD_GLYPH_ROWS - spectrumLevel) : 0;

  return Array.from({ length: VFD_GLYPH_COLUMNS }, (_, column) => {
    const mask = patternColumnMask(pattern, column);
    if (!highlightSpectrumCap) return { mask, brightness };
    return {
      mask: mask & capRowMask,
      brightness,
      secondaryMask: mask & ~capRowMask,
      secondaryBrightness: "dim",
    };
  });
}

/**
 * Concatenates several glyph cells into a contiguous pixel-column buffer,
 * inserting an inter-cell spacing column after every cell except the last.
 * This is the layer that turns "5 cells, 5 glyphs each" into the
 * "5*6-1 = 29 columns" the renderer actually draws.
 */
function glyphCellsToCanvasPixelColumns(cells: string[], brightness: VfdBrightness): VfdCanvasPixelColumn[] {
  return cells.flatMap((glyph, index) => {
    const columns = glyphCanvasPixelColumns(glyph, brightness);
    if (index < cells.length - 1) columns.push(blankCanvasColumn(brightness));
    return columns;
  });
}

/**
 * Produces the natural pixel-column representation of a content string, in
 * its full unaligned length. Used by callers that want to measure overflow
 * or scroll long content, not by the row-fitting layout path.
 */
function contentCanvasPixelColumns(content: string, brightness: VfdBrightness): VfdCanvasPixelColumn[] {
  if (content === EMPTY_CELL) return [];
  return glyphCellsToCanvasPixelColumns(Array.from(content), brightness);
}

/**
 * Renders a content string into a fixed-width column buffer, applying the
 * section's alignment.
 *
 * The string is clipped to the visible cell count, then padded with empty
 * cells on the appropriate side so the cell array is always exactly
 * `visibleCells` long before the glyph-to-column expansion runs.
 */
function layoutStringCanvasPixelColumns(
  content: string,
  visibleCells: number,
  align: VfdSectionAlign,
  brightness: VfdBrightness,
): VfdCanvasPixelColumn[] {
  const chars = content === EMPTY_CELL ? [] : Array.from(content).slice(0, visibleCells);
  const startIndex =
    align === "center"
      ? Math.max(0, Math.floor((visibleCells - chars.length) / 2))
      : align === "right"
        ? Math.max(0, visibleCells - chars.length)
        : 0;
  const cells = Array.from({ length: visibleCells }, (_, index) => chars[index - startIndex] ?? EMPTY_CELL);
  return glyphCellsToCanvasPixelColumns(cells, brightness);
}

/**
 * Renders one or more pixel bar segments into a fresh column buffer of length
 * `totalColumns`. Trail columns get `trailBrightness`, the leading peak
 * column gets `peakBrightness`. Coordinates are local to the section and
 * include inter-cell spacing columns so the bar can flow across cell
 * boundaries without visible glyph gaps. Out-of-range bars are clamped or
 * skipped silently.
 */
function pixelBarsToCanvasColumns(
  bars: VfdPixelBarSegment[],
  totalColumns: number,
  fallbackBrightness: VfdBrightness,
): VfdCanvasPixelColumn[] {
  const columns: VfdCanvasPixelColumn[] = Array.from({ length: Math.max(1, totalColumns) }, () =>
    blankCanvasColumn(fallbackBrightness),
  );
  for (const bar of bars) {
    const trailBrightness = bar.trailBrightness ?? "dim";
    const peakBrightness = bar.peakBrightness ?? "bright";
    const rowMask = bar.rowMask ?? VFD_FULL_COLUMN_MASK;
    if (rowMask === 0) continue;
    const start = Math.max(0, Math.min(columns.length - 1, bar.startColumn));
    const end = Math.max(start, Math.min(columns.length - 1, bar.endColumn));
    const trackSize = end - start + 1;
    const fill = Math.max(0, Math.min(trackSize, Math.floor(bar.fillColumns)));
    if (fill <= 0) continue;

    const peakColumn = bar.anchor === "left" ? start + fill - 1 : end - fill + 1;
    const trailStart = bar.anchor === "left" ? start : end - fill + 2;
    const trailEnd = bar.anchor === "left" ? start + fill - 2 : end;
    for (let column = trailStart; column <= trailEnd; column += 1) {
      columns[column] = { mask: rowMask, brightness: trailBrightness };
    }
    columns[peakColumn] = { mask: rowMask, brightness: peakBrightness };
  }
  return columns;
}

/**
 * Returns the visible window of a scrolled content string starting at
 * `columnOffset`. Columns past the end of the source buffer are filled
 * with blank columns so the visible width is always exactly the section's
 * column count, even when the marquee is at rest near an edge.
 */
function scrolledCanvasPixelColumns(
  content: string,
  brightness: VfdBrightness,
  visibleCells: number,
  columnOffset: number,
): VfdCanvasPixelColumn[] {
  const sourceColumns = contentCanvasPixelColumns(content, brightness);
  const visibleColumns = vfdColumnCountForCells(visibleCells);
  return Array.from(
    { length: visibleColumns },
    (_, index) => sourceColumns[columnOffset + index] ?? blankCanvasColumn(brightness),
  );
}

/**
 * Builds the full pixel-column buffer for one row, dispatching between the
 * "single content" and "sectioned" code paths.
 *
 * For sectioned rows it first allocates cells via {@link resolveSectionCells},
 * then iterates the sections and writes either glyph columns (default) or
 * pixel-bar columns (when `pixelBars` is set) into the per-section slot of
 * the row buffer.
 *
 * Reports whether at least one section is currently animating its marquee
 * so the canvas pipeline can request the next animation frame.
 */
function lineCanvasColumns(
  line: Pick<NormalizedVfdLine, "content" | "sections" | "align" | "marquee" | "brightness">,
  cellCount: number,
  rowIndex: number,
  state: VfdCanvasRenderState,
  now: number,
): { columns: VfdCanvasPixelColumn[]; hasActiveMarquee: boolean } {
  const rowColumns = Array.from({ length: vfdColumnCountForCells(cellCount) }, () =>
    blankCanvasColumn(line.brightness),
  );
  let hasActiveMarquee = false;

  const writeColumns = (startColumn: number, sourceColumns: VfdCanvasPixelColumn[]) => {
    sourceColumns.forEach((column, index) => {
      const targetIndex = startColumn + index;
      if (targetIndex >= 0 && targetIndex < rowColumns.length) rowColumns[targetIndex] = column;
    });
  };

  const sectionColumns = (
    content: ReactNode,
    visibleCells: number,
    align: VfdSectionAlign,
    marquee: VfdMarqueeMode | undefined,
    brightness: VfdBrightness,
    marqueeKey: string,
  ) => {
    if (typeof content !== "string" || visibleCells <= 0) {
      return Array.from({ length: vfdColumnCountForCells(Math.max(1, visibleCells)) }, () =>
        blankCanvasColumn(brightness),
      );
    }

    const effectiveMarquee = defaultMarqueeMode(content, marquee);
    const animateMarquee =
      !state.prefersReducedMotion &&
      shouldMarquee(content, effectiveMarquee, visibleCells) &&
      contentCanvasPixelColumns(content, brightness).length > vfdColumnCountForCells(visibleCells);

    if (!animateMarquee) return layoutStringCanvasPixelColumns(content, visibleCells, align, brightness);

    const sourceColumns = contentCanvasPixelColumns(content, brightness);
    const overflowColumns = Math.max(0, sourceColumns.length - vfdColumnCountForCells(visibleCells));
    const marqueeState = marqueeStateFor(state, marqueeKey, now, overflowColumns);
    hasActiveMarquee = true;
    return scrolledCanvasPixelColumns(content, brightness, visibleCells, marqueeState.offset);
  };

  if (!line.sections?.length) {
    writeColumns(
      0,
      sectionColumns(
        line.content,
        cellCount,
        line.align,
        line.marquee,
        line.brightness,
        `row:${rowIndex}:${line.content}`,
      ),
    );
    return { columns: rowColumns, hasActiveMarquee };
  }

  const sectionCells = resolveSectionCells(line.sections, cellCount);
  let cellCursor = 0;
  line.sections.forEach((section, sectionIndex) => {
    const cells = sectionCells[sectionIndex] ?? 0;
    if (cells <= 0) return;
    const brightness = section.brightness ?? line.brightness;
    const startColumn = cellCursor * VFD_CELL_COLUMNS;
    if (section.pixelBars && section.pixelBars.length > 0) {
      writeColumns(startColumn, pixelBarsToCanvasColumns(section.pixelBars, vfdColumnCountForCells(cells), brightness));
    } else {
      writeColumns(
        startColumn,
        sectionColumns(
          section.content,
          cells,
          section.align,
          section.marquee,
          brightness,
          `row:${rowIndex}:section:${section.key}:${typeof section.content === "string" ? section.content : sectionIndex}`,
        ),
      );
    }
    cellCursor += cells;
  });

  return { columns: rowColumns, hasActiveMarquee };
}

/**
 * Paints one row's pixel-column buffer into the canvas context.
 *
 * Iterates the columns once and tracks the active fill style across pixels
 * so the canvas state only switches when the brightness bucket changes;
 * this keeps the per-frame `fillStyle` writes down to a handful. The
 * `matrixRowOffset` shifts the rendered pixel rows vertically inside the
 * row band, used by the line-swap transition to scroll the previous and
 * current line past each other.
 */
function drawCanvasPixelColumns(
  ctx: CanvasRenderingContext2D,
  columns: VfdCanvasPixelColumn[],
  rowTop: number,
  matrixRowOffset: number,
  colors: VfdCanvasColors,
) {
  let activeBrightness: VfdBrightness | null = null;

  const drawColumnMask = (columnIndex: number, mask: number, brightness: VfdBrightness) => {
    if (mask === 0) return;
    if (activeBrightness !== brightness) {
      activeBrightness = brightness;
      ctx.fillStyle = colors[brightness];
    }

    for (let row = 0; row < VFD_GLYPH_ROWS; row += 1) {
      if (!((mask >> row) & 1)) continue;
      const y = rowTop + (row + matrixRowOffset) * VFD_DOT_PITCH;
      ctx.fillRect(columnIndex * VFD_DOT_PITCH, y, VFD_PIXEL_SIZE, VFD_PIXEL_SIZE);
    }
  };

  columns.forEach((column, columnIndex) => {
    if (column.secondaryMask !== undefined && column.secondaryBrightness) {
      drawColumnMask(columnIndex, column.secondaryMask, column.secondaryBrightness);
    }
    drawColumnMask(columnIndex, column.mask, column.brightness);
  });
}

/**
 * Renders the whole VFD frame onto the canvas, returning whether any
 * animation is still in flight so the caller knows whether to request the
 * next animation frame.
 *
 * Sequence per call:
 *
 * 1. Resync the canvas backing-store size with the configured matrix and
 *    the current devicePixelRatio.
 * 2. For every row: draw the dim "ghost" matrix first, then clip to the
 *    row band so the line-swap transition cannot bleed past the row.
 * 3. If the row has a transition in progress, render both the previous and
 *    the current line shifted vertically by the transition progress.
 * 4. Otherwise render only the current line.
 *
 * Returns `true` when at least one transition is still incomplete or at
 * least one marquee section is still animating.
 */
export function drawVfdCanvas(
  canvas: HTMLCanvasElement,
  state: VfdCanvasRenderState,
  colors: VfdCanvasColors,
  now: number,
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const width = vfdRowWidth(state.cellCount);
  const height = vfdDisplayHeight(state.rowCount);
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const backingWidth = Math.max(1, Math.round(width * ratio));
  const backingHeight = Math.max(1, Math.round(height * ratio));

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  let hasActiveMarquee = false;
  const ghostColumns = Array.from({ length: vfdColumnCountForCells(state.cellCount) }, () => ({
    mask: VFD_FULL_COLUMN_MASK,
    brightness: "ghost" as const,
  }));

  for (let rowIndex = 0; rowIndex < state.rowCount; rowIndex += 1) {
    const rowTop = rowIndex * (VFD_BAND_HEIGHT + VFD_ROW_GAP);
    drawCanvasPixelColumns(ctx, ghostColumns, rowTop, 0, colors);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rowTop, width, VFD_BAND_HEIGHT);
    ctx.clip();

    const line = state.lines[rowIndex] ?? normalizeLine(rowIndex, undefined);
    const transition = state.transitions.get(rowIndex);
    if (transition && !state.prefersReducedMotion) {
      const progress = Math.min(1, Math.max(0, (now - transition.startedAt) / transition.durationMs));
      const stepCount = VFD_GLYPH_ROWS + 1;
      const step = Math.min(stepCount, Math.floor(progress * stepCount));
      const previous = lineCanvasColumns(transition.previous, state.cellCount, rowIndex, state, now);
      const current = lineCanvasColumns(line, state.cellCount, rowIndex, state, now);
      hasActiveMarquee = hasActiveMarquee || previous.hasActiveMarquee || current.hasActiveMarquee;
      drawCanvasPixelColumns(ctx, previous.columns, rowTop, step, colors);
      drawCanvasPixelColumns(ctx, current.columns, rowTop, -stepCount + step, colors);
      if (progress >= 1) state.transitions.delete(rowIndex);
    } else {
      const current = lineCanvasColumns(line, state.cellCount, rowIndex, state, now);
      hasActiveMarquee = hasActiveMarquee || current.hasActiveMarquee;
      drawCanvasPixelColumns(ctx, current.columns, rowTop, 0, colors);
    }

    ctx.restore();
  }

  return state.transitions.size > 0 || hasActiveMarquee;
}
