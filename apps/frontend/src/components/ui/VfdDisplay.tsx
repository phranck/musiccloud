import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export type VfdBrightness = "bright" | "normal" | "dim";
export type VfdDisplaySize = "compact" | "regular" | "large";
export type VfdSectionAlign = "left" | "center" | "right";
export type VfdSectionCells = number | "auto" | "fill";
export type VfdMarqueeMode = boolean | "overflow";

export interface VfdDisplaySection {
  /** Text or inline content for one fixed-width section inside a VFD row. */
  content: ReactNode;
  /** Fixed cell count, content-sized cells, or remaining available cells. Defaults to fill for the first section. */
  cells?: VfdSectionCells;
  /** Horizontal placement inside this section's own cell grid. */
  align?: VfdSectionAlign;
  /** Scrolls this section when enabled. `overflow` only scrolls when text is wider than its allocated cells. */
  marquee?: VfdMarqueeMode;
  /** Optional per-section phosphor brightness. Defaults to the parent row brightness. */
  brightness?: VfdBrightness;
  /** Stable content identity for non-string ReactNode content. String content uses itself as identity. */
  key?: string;
  className?: string;
}

export interface VfdDisplayLine {
  /** Text or inline content for one fixed display row. Keep the row height stable. */
  content?: ReactNode;
  /** Optional fixed-cell sections. Use this for rows with pinned right/center/left regions. */
  sections?: VfdDisplaySection[];
  /** Phosphor brightness replaces font-weight so the VFD keeps one consistent dot-matrix weight. */
  brightness?: VfdBrightness;
  /** Horizontal placement for non-sectioned string content. */
  align?: VfdSectionAlign;
  /** Enables compositor-only marquee movement for the whole line. */
  marquee?: VfdMarqueeMode;
  /** Enables a subtle compositor-only opacity pulse, useful for loading states. */
  pulse?: boolean;
  /** Stable content identity for non-string ReactNode content. String content uses itself as identity. */
  key?: string;
  className?: string;
}

export interface VfdDisplayProps {
  lines: VfdDisplayLine[];
  /** Fixed row count. Empty rows keep the module height stable during content changes. */
  rows?: number;
  /** Fixed number of VFD cells per row. String content is clipped/padded to this grid. */
  charsPerLine?: number;
  size?: VfdDisplaySize;
  className?: string;
  ariaLabel?: string;
  /** CSS color for the VFD phosphor. Defaults to blue-green like HiFi VFD modules. */
  phosphorColor?: string;
  /** Faint inactive-cell glyphs behind every row. Uses the same font, so dots line up with live text. */
  ghostPattern?: string;
}

interface NormalizedVfdSection extends Required<Pick<VfdDisplaySection, "content" | "align">> {
  key: string;
  cells: VfdSectionCells;
  marquee?: VfdMarqueeMode;
  brightness?: VfdBrightness;
  className?: string;
}

interface NormalizedVfdLine {
  rowKey: string;
  content: ReactNode;
  contentKey: string;
  sections?: NormalizedVfdSection[];
  brightness: VfdBrightness;
  align: VfdSectionAlign;
  marquee?: VfdMarqueeMode;
  pulse?: boolean;
  className?: string;
}

interface OutgoingVfdLine {
  key: string;
  line: NormalizedVfdLine;
}

interface VfdRowProps extends NormalizedVfdLine {
  ghostPattern: string;
  cellCount: number;
  cellKeys: string[];
  outgoing?: OutgoingVfdLine | null;
}

interface CellGridOptions {
  align: VfdSectionAlign;
  marquee?: VfdMarqueeMode;
  className?: string;
}

const SIZE_CLASSES: Record<VfdDisplaySize, string> = {
  compact: "px-4 py-3 gap-1.5 text-[0.72rem] sm:text-[0.78rem]",
  regular: "px-5 py-4 gap-2 text-[0.82rem] sm:text-[0.92rem]",
  large: "px-6 py-5 gap-2.5 text-[0.92rem] sm:text-[1.05rem]",
};

const BRIGHTNESS_CLASSES: Record<VfdBrightness, string> = {
  bright: "mc-vfd-bright",
  normal: "mc-vfd-normal",
  dim: "mc-vfd-dim",
};

const VFD_LINE_SWAP_MS = 900;
const DEFAULT_VFD_ROWS = 4;
const DEFAULT_VFD_CELL_COUNT = 44;
const EMPTY_CELL = "\u00A0";

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value ?? fallback));
}

function fitPatternToCells(pattern: string, cellCount: number): string {
  const chars = Array.from(pattern || "8");
  return Array.from({ length: cellCount }, (_, index) => chars[index % chars.length] ?? "8").join("");
}

function stringLength(content: ReactNode): number {
  return typeof content === "string" && content !== EMPTY_CELL ? Array.from(content).length : 0;
}

function sectionKeyFor(index: number, section: VfdDisplaySection): string {
  if (section.key) return section.key;
  return typeof section.content === "string" ? section.content : `vfd-section-${index}`;
}

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
  }));
}

function resolveSectionCells(sections: NormalizedVfdSection[], totalCells: number): number[] {
  const desired: Array<number | null> = sections.map((section) => {
    if (typeof section.cells === "number") return normalizePositiveInteger(section.cells, 1);
    if (section.cells === "fill") return null;
    return Math.max(1, stringLength(section.content));
  });

  const nonFillTotal = desired.reduce<number>((sum, cells) => sum + (cells ?? 0), 0);

  if (nonFillTotal >= totalCells) {
    let remaining = totalCells;
    const cells = Array.from({ length: sections.length }, () => 0);
    // Preserve trailing/pinned sections first. For title + right meta, the
    // meta block stays visible and the title receives the remaining cells.
    for (let index = sections.length - 1; index >= 0; index -= 1) {
      const requested = desired[index] ?? remaining;
      cells[index] = Math.min(requested, remaining);
      remaining -= cells[index];
    }
    return cells;
  }

  const fillIndexes = desired.flatMap((cells, index) => (cells === null ? [index] : []));
  const cells = desired.map((value) => value ?? 0);
  let remaining = totalCells - nonFillTotal;

  if (fillIndexes.length === 0) {
    cells[0] = (cells[0] ?? 0) + remaining;
    return cells;
  }

  fillIndexes.forEach((index, fillPosition) => {
    const share = Math.floor(remaining / (fillIndexes.length - fillPosition));
    cells[index] = share;
    remaining -= share;
  });

  return cells;
}

function lineKeyFor(index: number, line: VfdDisplayLine): string {
  if (line.key) return line.key;
  if (line.sections?.length)
    return line.sections.map((section, sectionIndex) => sectionKeyFor(sectionIndex, section)).join("|");
  return typeof line.content === "string" ? line.content : `vfd-row-${index}`;
}

function normalizeLine(index: number, line: VfdDisplayLine | undefined): NormalizedVfdLine {
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
    pulse: safeLine.pulse,
    className: safeLine.className,
  };
}

function sameSections(a: NormalizedVfdSection[] | undefined, b: NormalizedVfdSection[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((section, index) => {
    const other = b[index];
    return (
      section.key === other.key &&
      section.cells === other.cells &&
      section.align === other.align &&
      section.marquee === other.marquee &&
      section.brightness === other.brightness &&
      section.className === other.className
    );
  });
}

function sameLinePresentation(a: NormalizedVfdLine, b: NormalizedVfdLine): boolean {
  return (
    a.contentKey === b.contentKey &&
    sameSections(a.sections, b.sections) &&
    a.brightness === b.brightness &&
    a.align === b.align &&
    a.marquee === b.marquee &&
    a.pulse === b.pulse &&
    a.className === b.className
  );
}

function shouldMarquee(content: ReactNode, mode: VfdMarqueeMode | undefined, visibleCells: number): boolean {
  if (!mode) return false;
  if (mode === true) return stringLength(content) > visibleCells;
  return stringLength(content) > visibleCells;
}

function buildVfdCells(
  content: ReactNode,
  visibleCells: number,
  cellKeys: string[],
  { align, marquee, className }: CellGridOptions,
): ReactNode {
  if (typeof content !== "string") return content;

  const chars = content === EMPTY_CELL ? [] : Array.from(content);
  const animateMarquee = shouldMarquee(content, marquee, visibleCells);
  const renderedCellCount = animateMarquee ? Math.max(chars.length, visibleCells) : visibleCells;
  const displayChars = animateMarquee ? chars : chars.slice(0, visibleCells);
  const startIndex = animateMarquee
    ? 0
    : align === "center"
      ? Math.max(0, Math.floor((visibleCells - displayChars.length) / 2))
      : align === "right"
        ? Math.max(0, visibleCells - displayChars.length)
        : 0;
  const marqueeShift =
    animateMarquee && renderedCellCount > visibleCells
      ? `${-((renderedCellCount - visibleCells) / renderedCellCount) * 100}%`
      : "0%";

  return (
    <span
      className={cn("mc-vfd-cell-grid", animateMarquee && "mc-vfd-marquee", className)}
      style={
        {
          "--mc-vfd-cells": renderedCellCount,
          "--mc-vfd-rendered-cells": renderedCellCount,
          "--mc-vfd-visible-cells": visibleCells,
          "--mc-vfd-grid-scale": renderedCellCount / visibleCells,
          "--mc-vfd-marquee-shift": marqueeShift,
        } as CSSProperties
      }
    >
      {Array.from({ length: renderedCellCount }, (_, index) => {
        const char = displayChars[index - startIndex] ?? EMPTY_CELL;
        return (
          <span key={cellKeys[index] ?? `vfd-cell-${index}`} className="mc-vfd-cell">
            {char}
          </span>
        );
      })}
    </span>
  );
}

function buildSectionedContent(
  line: Pick<NormalizedVfdLine, "content" | "sections" | "align" | "marquee">,
  cellCount: number,
  cellKeys: string[],
): ReactNode {
  if (!line.sections?.length) {
    return buildVfdCells(line.content, cellCount, cellKeys, {
      align: line.align,
      marquee: line.marquee,
    });
  }

  const sectionCells = resolveSectionCells(line.sections, cellCount);
  const template = sectionCells.map((cells) => `${cells}fr`).join(" ");

  return (
    <span className="mc-vfd-section-layout" style={{ gridTemplateColumns: template }}>
      {line.sections.map((section, index) => {
        const cells = sectionCells[index] ?? 0;
        if (cells <= 0) return null;
        return (
          <span
            key={section.key}
            className={cn("mc-vfd-section", section.brightness && BRIGHTNESS_CLASSES[section.brightness])}
          >
            {buildVfdCells(section.content, cells, cellKeys, {
              align: section.align,
              marquee: section.marquee,
              className: section.className,
            })}
          </span>
        );
      })}
    </span>
  );
}

const VfdRow = memo(function VfdRow({
  rowKey,
  content,
  contentKey,
  sections,
  brightness,
  align,
  marquee,
  pulse,
  className,
  ghostPattern,
  cellCount,
  cellKeys,
  outgoing,
}: VfdRowProps) {
  const line = { content, sections, align, marquee };

  return (
    <div
      className={cn("mc-vfd-line", BRIGHTNESS_CLASSES[brightness], pulse && "mc-vfd-line-pulse", className)}
      data-row={rowKey}
    >
      <span className="mc-vfd-line-matrix" aria-hidden="true">
        {buildVfdCells(ghostPattern, cellCount, cellKeys, { align: "left" })}
      </span>
      {outgoing && (
        <span key={outgoing.key} className="mc-vfd-line-content-out" aria-hidden="true">
          {buildSectionedContent(outgoing.line, cellCount, cellKeys)}
        </span>
      )}
      <span key={contentKey} className="mc-vfd-line-content">
        {buildSectionedContent(line, cellCount, cellKeys)}
      </span>
    </div>
  );
});

/**
 * Reusable fixed-height VFD / dot-matrix display.
 *
 * Design notes:
 * - The display always renders a fixed number of rows, so text changes never
 *   resize the surrounding card. Empty rows render a non-breaking-space cell.
 * - `rows` and `charsPerLine` define the fixed VFD matrix. String content is
 *   rendered into exact cells, so clipping happens between cells, not through
 *   a glyph.
 * - Rows may define `sections` for pinned left/center/right regions. This is
 *   intentionally generic: the title row can reserve a right meta section,
 *   but VfdDisplay itself does not know about titles, durations, or years.
 * - Font weight stays visually constant. Hierarchy is expressed via phosphor
 *   brightness (opacity + text-shadow), matching real VFD modules.
 * - Runtime animations are compositor-friendly only: opacity and translate3d.
 * - Content changes are routed through `setLineContent(index, line)` below.
 *   Updating only the affected row keeps unchanged VFD rows mounted and still.
 * - Inactive background cells are rendered with the same dot-matrix font as
 *   the live text. This keeps the ghost dots aligned to the glyph dots instead
 *   of approximating them with an unrelated radial CSS grid.
 */
export function VfdDisplay({
  lines,
  rows = DEFAULT_VFD_ROWS,
  charsPerLine = DEFAULT_VFD_CELL_COUNT,
  size = "regular",
  className,
  ariaLabel,
  phosphorColor = "#7feaff",
  ghostPattern = "8",
}: VfdDisplayProps) {
  const rowCount = normalizePositiveInteger(rows, DEFAULT_VFD_ROWS);
  const cellCount = normalizePositiveInteger(charsPerLine, DEFAULT_VFD_CELL_COUNT);
  const cellKeys = useMemo(() => Array.from({ length: cellCount }, (_, index) => `vfd-cell-${index}`), [cellCount]);
  const ghostCells = useMemo(() => fitPatternToCells(ghostPattern, cellCount), [cellCount, ghostPattern]);
  const generationRef = useRef(0);
  const clearTimers = useRef<Array<ReturnType<typeof setTimeout> | null>>([]);
  const [displayLines, setDisplayLines] = useState<NormalizedVfdLine[]>(() =>
    Array.from({ length: rowCount }, (_, index) => normalizeLine(index, lines[index])),
  );
  const [outgoingLines, setOutgoingLines] = useState<Array<OutgoingVfdLine | null>>(() =>
    Array.from({ length: rowCount }, () => null),
  );

  const normalizedLines = useMemo(
    () => Array.from({ length: rowCount }, (_, index) => normalizeLine(index, lines[index])),
    [lines, rowCount],
  );

  const setLineContent = useCallback(
    (rowIndex: number, nextLine: NormalizedVfdLine) => {
      setDisplayLines((currentLines) => {
        const previousLine = currentLines[rowIndex];
        if (previousLine && sameLinePresentation(previousLine, nextLine)) return currentLines;

        const nextLines = Array.from({ length: rowCount }, (_, index) =>
          index === rowIndex ? nextLine : (currentLines[index] ?? normalizeLine(index, undefined)),
        );

        if (previousLine && previousLine.contentKey !== nextLine.contentKey) {
          if (clearTimers.current[rowIndex]) clearTimeout(clearTimers.current[rowIndex] ?? undefined);
          const outgoingKey = `${previousLine.contentKey}:${generationRef.current}`;
          generationRef.current += 1;
          setOutgoingLines((currentOutgoing) => {
            const nextOutgoing = Array.from({ length: rowCount }, (_, index) => currentOutgoing[index] ?? null);
            nextOutgoing[rowIndex] = { key: outgoingKey, line: previousLine };
            return nextOutgoing;
          });
          clearTimers.current[rowIndex] = setTimeout(() => {
            setOutgoingLines((currentOutgoing) => {
              const nextOutgoing = Array.from({ length: rowCount }, (_, index) => currentOutgoing[index] ?? null);
              nextOutgoing[rowIndex] = null;
              return nextOutgoing;
            });
            clearTimers.current[rowIndex] = null;
          }, VFD_LINE_SWAP_MS + 80);
        }

        return nextLines;
      });
    },
    [rowCount],
  );

  useLayoutEffect(() => {
    normalizedLines.forEach((line, index) => setLineContent(index, line));
  }, [normalizedLines, setLineContent]);

  useEffect(() => {
    return () => {
      clearTimers.current.forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const style = { "--mc-vfd-color": phosphorColor, "--mc-vfd-cells": cellCount } as CSSProperties;

  return (
    <section className={cn("mc-vfd", SIZE_CLASSES[size], className)} style={style} aria-label={ariaLabel}>
      <div className="mc-vfd-grid" aria-hidden="true" />
      <div className="mc-vfd-scan" aria-hidden="true" />
      <div className="relative z-10 grid gap-[inherit]">
        {displayLines.map((line, index) => (
          <VfdRow
            key={line.rowKey}
            {...line}
            ghostPattern={ghostCells}
            cellCount={cellCount}
            cellKeys={cellKeys}
            outgoing={outgoingLines[index]}
          />
        ))}
      </div>
    </section>
  );
}
