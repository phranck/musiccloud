import type { ReactNode } from "react";
import type {
  NormalizedVfdLine,
  NormalizedVfdSection,
  VfdDisplayLine,
  VfdDisplaySection,
} from "@/components/ui/VfdDisplayTypes";
import { EMPTY_CELL } from "@/components/ui/VfdGlyphPatterns";
import { normalizePositiveInteger } from "@/components/ui/vfdDisplayGeometry";

/**
 * Returns the rendered character count of string content, excluding the
 * `EMPTY_CELL` sentinel which represents an intentional blank cell rather
 * than a renderable glyph. Non-string `ReactNode` content returns 0
 * because the matrix does not measure it: section sizing for JSX must
 * come from the caller via explicit `cells`.
 */
export function stringLength(content: ReactNode): number {
  return typeof content === "string" && content !== EMPTY_CELL ? Array.from(content).length : 0;
}

/**
 * Derives a stable React-style key for one section.
 *
 * Prefers the caller-provided `key`, falls back to the literal string
 * content (which is itself a stable identity for the common
 * "static text in a section" case), and finally to an index-based key. The
 * key participates in marquee state lookup, so it must remain identical
 * across rerenders of the same logical section.
 */
function sectionKeyFor(index: number, section: VfdDisplaySection): string {
  if (section.key) return section.key;
  return typeof section.content === "string" ? section.content : `vfd-section-${index}`;
}

/**
 * Applies defaults to every section in a row, producing the
 * {@link NormalizedVfdSection} shape that the render pipeline assumes.
 *
 * Defaults are deliberately tuned so the common "leading flex, trailing
 * pinned" layout requires no explicit `cells`/`align`: the first section
 * becomes `fill`/`left`, every subsequent section becomes `auto`/`right`.
 * Returns `undefined` for empty or missing section arrays so callers can
 * detect "use the line-level content" without inspecting an empty array.
 */
function normalizeSections(sections: VfdDisplaySection[] | undefined): NormalizedVfdSection[] | undefined {
  if (!sections || sections.length === 0) return undefined;
  return sections.map((section, index) => ({
    content: section.content || EMPTY_CELL,
    key: sectionKeyFor(index, section),
    cells: section.cells ?? (index === 0 ? "fill" : "auto"),
    align: section.align ?? (index === 0 ? "left" : "right"),
    marquee: section.marquee,
    brightness: section.brightness,
    className: section.className,
    pixelBars: section.pixelBars,
  }));
}

/**
 * Allocates whole glyph cells to each section of a row.
 *
 * The allocation algorithm runs in two passes:
 *
 * 1. Compute each section's "desired" cell count. Fixed counts pass through
 *    the positive-integer normalizer; `"auto"` sections take their string
 *    length; `"fill"` sections request `null` (placeholder for "decide
 *    later").
 * 2. If the fixed/auto total already meets or exceeds the row width, walk
 *    backwards through the sections so trailing-pinned content (a clock,
 *    a level readout) keeps its space; fill sections collapse to zero
 *    instead of stealing cells from those pins.
 * 3. Otherwise, distribute the remaining cells across all fill sections
 *    using floor-division so the rightmost fill absorbs any remainder.
 *
 * Always returns one number per section, summing to at most `totalCells`.
 */
export function resolveSectionCells(sections: NormalizedVfdSection[], totalCells: number): number[] {
  const desired: Array<number | null> = sections.map((section) => {
    if (typeof section.cells === "number") return normalizePositiveInteger(section.cells, 1);
    if (section.cells === "fill") return null;
    return Math.max(1, stringLength(section.content));
  });

  const nonFillTotal = desired.reduce<number>((sum, cells) => sum + (cells ?? 0), 0);

  if (nonFillTotal >= totalCells) {
    let remaining = totalCells;
    const cells = Array.from({ length: sections.length }, () => 0);
    // Preserve trailing/pinned fixed and auto sections first. Fill sections are
    // elastic by definition: when fixed/auto content already fills or exceeds
    // the row, they collapse to zero instead of stealing cells from pinned
    // sections such as a trailing readout.
    for (let index = sections.length - 1; index >= 0; index -= 1) {
      const requested = desired[index] ?? 0;
      cells[index] = Math.min(requested, remaining);
      remaining -= cells[index];
    }
    return cells;
  }

  const fillIndexes = desired.flatMap((cells, index) => (cells === null ? [index] : []));
  const cells = desired.map((value) => value ?? 0);
  let remaining = totalCells - nonFillTotal;

  if (fillIndexes.length === 0) return cells;

  fillIndexes.forEach((index, fillPosition) => {
    const share = Math.floor(remaining / (fillIndexes.length - fillPosition));
    cells[index] = share;
    remaining -= share;
  });

  return cells;
}

/**
 * Derives a stable content identity for one row, used to detect when a
 * line-swap transition should fire.
 *
 * Prefers an explicit caller-provided `key`. For sectioned lines the key
 * concatenates each section's stable identity, so a transition triggers
 * whenever any section's content changes. For non-sectioned string lines
 * the string itself is the identity, and React-node content falls back to
 * a row-index marker so a parent re-render does not spuriously animate
 * unchanged JSX.
 */
function lineKeyFor(index: number, line: VfdDisplayLine): string {
  if (line.key) return line.key;
  if (line.sections?.length)
    return line.sections.map((section, sectionIndex) => sectionKeyFor(sectionIndex, section)).join("|");
  return typeof line.content === "string" ? line.content : `vfd-row-${index}`;
}

/**
 * Applies defaults to one row, producing the {@link NormalizedVfdLine}
 * shape the render pipeline assumes. Missing rows render as a dim blank
 * line (the inactive-matrix appearance), unset alignment falls back to
 * `left`, and unset transition becomes `slide`. The function never
 * returns `undefined`, so the canvas pipeline can iterate over the full
 * row count even when the caller passed fewer lines than the configured
 * row count.
 */
export function normalizeLine(index: number, line: VfdDisplayLine | undefined): NormalizedVfdLine {
  const safeLine = line ?? { content: EMPTY_CELL, brightness: "dim" };
  const content = safeLine.content || EMPTY_CELL;
  const sections = normalizeSections(safeLine.sections);
  return {
    rowKey: `vfd-row-${index}`,
    content,
    sections,
    contentKey: lineKeyFor(index, { ...safeLine, content }),
    brightness: safeLine.brightness ?? "normal",
    align: safeLine.align ?? "left",
    marquee: safeLine.marquee,
    transition: safeLine.transition ?? "slide",
    className: safeLine.className,
  };
}

/**
 * Shallow structural equality for two section arrays.
 *
 * Compares the presentation-relevant fields only (key, cells, align,
 * marquee, brightness, className). Content is intentionally not compared
 * here because changes in content drive the line-swap transition through
 * the line-level `contentKey`, not through this section check.
 */
function sameSections(a: NormalizedVfdSection[] | undefined, b: NormalizedVfdSection[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const section = a[index];
    const other = b[index];
    if (
      section.key === other.key &&
      section.cells === other.cells &&
      section.align === other.align &&
      section.marquee === other.marquee &&
      section.brightness === other.brightness &&
      section.className === other.className
    ) {
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Decides whether two normalized lines look identical from the renderer's
 * perspective, used to skip starting a line-swap transition when only
 * non-visual fields changed.
 */
export function sameLinePresentation(a: NormalizedVfdLine, b: NormalizedVfdLine): boolean {
  return (
    a.contentKey === b.contentKey &&
    sameSections(a.sections, b.sections) &&
    a.brightness === b.brightness &&
    a.align === b.align &&
    a.marquee === b.marquee &&
    a.transition === b.transition &&
    a.className === b.className
  );
}
