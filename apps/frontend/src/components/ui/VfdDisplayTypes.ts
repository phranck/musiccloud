import type { ReactNode } from "react";

/** Phosphor intensity for one VFD row or section. */
export type VfdBrightness = "bright" | "normal" | "dim" | "ghost";

/** Horizontal alignment inside an already allocated integer glyph-cell range. */
export type VfdSectionAlign = "left" | "center" | "right";

/**
 * Cell allocation for a row section.
 *
 * `number` is a fixed integer glyph-cell count, `auto` uses the text length, and
 * `fill` receives remaining integer glyph cells after fixed and auto sections.
 * Alignment is applied after this allocation. A right-aligned auto section has
 * no spare cells by design, but it still stays right-pinned when previous
 * sections absorb row-width changes or overflow pressure.
 */
export type VfdSectionCells = number | "auto" | "fill";

/** Enables VFD marquee rendering for strings wider than their allocated glyph-cell range. */
export type VfdMarqueeMode = boolean | "overflow";

/** Row content replacement animation mode. */
export type VfdContentTransition = "slide" | "none";

/**
 * Hardware sizing mode for the VFD module.
 *
 * - `matrix`: caller provides the physical matrix via `rows` and
 *   `charsPerLine`; the component renders exactly that many rows and glyph cells.
 * - `container`: caller provides the outer CSS size; the component derives the
 *   maximum whole-number rows and whole-number glyph cells per row that fit.
 *
 * Both modes keep the pixel geometry unchanged. Container sizing never scales a
 * pixel. It only decides how many complete glyph cells fit.
 */
export type VfdSizingMode = "matrix" | "container";

/**
 * One filled pixel bar segment drawn into a section's allocated column range.
 *
 * Coordinates are pixel columns in the section's local space, spanning the
 * full column count returned by `vfdColumnCountForCells(section.cells)`.
 * Unlike glyph rendering, the bar fills its column range CONTIGUOUSLY,
 * ignoring the inter-glyph spacing columns inside the section. This lets the
 * caller draw analog-style level meters that flow across cell boundaries.
 *
 * The leading "peak" column at the active edge of the fill receives
 * `peakBrightness`; the columns behind it down to the anchor receive
 * `trailBrightness`.
 */
export interface VfdPixelBarSegment {
  /** First column of the segment's track inside the section (inclusive, 0-based). */
  startColumn: number;
  /** Last column of the segment's track inside the section (inclusive). */
  endColumn: number;
  /** Filled length in columns. Clamped to the track range; 0 disables drawing. */
  fillColumns: number;
  /** Edge of the track that the fill is anchored at. `"left"` grows rightward (peak at the right end); `"right"` grows leftward (peak at the left end). */
  anchor: "left" | "right";
  /** Trail (non-peak filled) column brightness. Defaults to `"dim"`. */
  trailBrightness?: VfdBrightness;
  /** Peak (leading filled) column brightness. Defaults to `"bright"`. */
  peakBrightness?: VfdBrightness;
  /** Row mask `(1 << row)` selecting which of the 7 pixel rows the bar fills. Defaults to all rows (full glyph height). */
  rowMask?: number;
}

/**
 * One logical section inside a VFD row.
 *
 * The display remains hardware-generic and deliberately dumb: sections know
 * nothing about songs, playtime, titles, metadata, or caller intent. VfdDisplay
 * does not infer which section should be flexible, important, pinned, or
 * truncated. It only allocates whole glyph cells from the props it receives and
 * renders the given content into pixel columns. Callers must describe the
 * desired layout explicitly, e.g. by giving one section `fill` when another
 * section should stay right-pinned.
 *
 * A section can either render glyph content (`content`) or a list of pixel
 * bar segments (`pixelBars`). When `pixelBars` is supplied, glyph content is
 * ignored for that section.
 */
export interface VfdDisplaySection {
  /** Text or inline content for this fixed-width section inside a VFD row. */
  content: ReactNode;
  /** Optional pixel-precise bar segments rendered into the section instead of glyph content. Use for VU meters, level bars, or other column-aligned graphics. */
  pixelBars?: VfdPixelBarSegment[];
  /** Fixed integer cells, content-sized cells, or remaining available cells. Defaults to fill for the first section. */
  cells?: VfdSectionCells;
  /** Horizontal placement inside this section's own allocated integer cell grid. */
  align?: VfdSectionAlign;
  /** Scrolls this section when enabled. `overflow` only scrolls when text is wider than its allocated cells. */
  marquee?: VfdMarqueeMode;
  /** Optional per-section phosphor brightness. Defaults to the parent row brightness. */
  brightness?: VfdBrightness;
  /** Stable content identity for non-string ReactNode content. String content uses itself as identity. */
  key?: string;
  /** Optional CSS class applied to this section's rendered glyphs or wrapper. */
  className?: string;
}

/** One fixed row in the VFD module. */
export interface VfdDisplayLine {
  /** Text or inline content for one fixed display row. Keep the row height stable. */
  content?: ReactNode;
  /** Optional fixed-cell sections. Use this for pinned left/center/right regions. */
  sections?: VfdDisplaySection[];
  /** Phosphor brightness replaces font-weight so the VFD keeps one consistent dot-matrix weight. */
  brightness?: VfdBrightness;
  /** Horizontal placement for non-sectioned string content. */
  align?: VfdSectionAlign;
  /** Enables pixel-column marquee movement for the whole line. */
  marquee?: VfdMarqueeMode;
  /** Content replacement mode. Use `none` for high-frequency updates like progress meters. */
  transition?: VfdContentTransition;
  /** Stable content identity for non-string ReactNode content. String content uses itself as identity. */
  key?: string;
  /** Optional CSS class applied to the row content wrapper. */
  className?: string;
}

/**
 * Configuration for the generic VFD hardware emulator.
 *
 * There are exactly two supported rendering modes:
 *
 * 1. Matrix mode, the default: provide `rows` and `charsPerLine`. The component
 *    renders exactly that many rows and exactly that many glyph cells per row.
 *    The display becomes as large as that matrix requires. Pixel columns are
 *    not auto-scaled. Never add or remove glyph cells because of spare container
 *    width.
 * 2. Container mode: provide a CSS size from the outside and set
 *    `sizingMode="container"`. The component measures the available content box
 *    and renders the maximum number of complete rows and complete glyph cells that
 *    fit. Pixel geometry is still fixed. The component never creates
 *    fractional pixels and never scales a pixel band to fill leftover space.
 *
 * All geometry is integer-only. A display contains rows, a row contains one
 * x*7 pixel band, and a glyph occupies five pixel columns. Any
 * future visual scaling must be an integer pixel scale, e.g. 1x1, 2x2,
 * 3x3. Arbitrary CSS transforms, percentage-based glyph widths, or subpixel
 * offsets are not valid for the hardware matrix.
 *
 * VfdDisplay is intentionally a dumb renderer. It must not inspect content
 * semantics or apply product-specific rules such as "playtime belongs on the
 * right". If a caller needs right-pinned content, the caller must provide the
 * correct section model, usually a preceding `fill` section and a trailing
 * `auto` section with `align: "right"`. Keeping this component dumb prevents
 * hidden Player-specific behavior from leaking into other hardware displays.
 */
export interface VfdDisplayProps {
  /** Rows to render into the fixed hardware matrix. Missing rows render as inactive/blank rows. */
  lines: VfdDisplayLine[];
  /**
   * Hardware sizing strategy. Defaults to matrix mode, where `rows` and
   * `charsPerLine` are exact physical counts.
   */
  sizingMode?: VfdSizingMode;
  /** Fixed integer row count in matrix mode. Empty rows keep the module height stable during content changes. */
  rows?: number;
  /** Fixed integer number of glyph cells per row in matrix mode. Content is clipped/padded to this grid. */
  charsPerLine?: number;
  /** Optional wrapper class for the recessed VFD card. */
  className?: string;
  /** Accessible label for the rendered hardware display. */
  ariaLabel?: string;
  /** CSS color for the VFD phosphor. Defaults to blue-green like HiFi VFD modules. */
  phosphorColor?: string;
  /** Faint inactive-cell matrix behind every row. Defaults to a custom 5x7 cell, not a font glyph. */
  ghostPattern?: string;
}

/**
 * Section after defaults have been resolved.
 *
 * Internal to the render pipeline. The render stages assume every required
 * field is set, so the normalize step must produce this shape from the
 * caller-facing {@link VfdDisplaySection}.
 */
export interface NormalizedVfdSection extends Required<Pick<VfdDisplaySection, "content" | "align">> {
  key: string;
  cells: VfdSectionCells;
  marquee?: VfdMarqueeMode;
  brightness?: VfdBrightness;
  className?: string;
  pixelBars?: VfdPixelBarSegment[];
}

/** Row after defaults have been resolved. Internal to the render pipeline. */
export interface NormalizedVfdLine {
  rowKey: string;
  content: ReactNode;
  contentKey: string;
  sections?: NormalizedVfdSection[];
  brightness: VfdBrightness;
  align: VfdSectionAlign;
  marquee?: VfdMarqueeMode;
  transition: VfdContentTransition;
  className?: string;
}

/**
 * One pixel-column of the canvas glyph band.
 *
 * Encodes which of the 7 pixel rows are lit (`mask`) and at what phosphor
 * intensity (`brightness`). A spectrum-cap column uses the secondary fields
 * to mix two intensities in the same column: the cap pixel renders bright,
 * the trail pixels render dim.
 */
export interface VfdCanvasPixelColumn {
  mask: number;
  brightness: VfdBrightness;
  secondaryMask?: number;
  secondaryBrightness?: VfdBrightness;
}

/** Per-key marquee state preserved across animation frames. */
export interface VfdMarqueeRuntimeState {
  offset: number;
  direction: number;
  holdSteps: number;
  elapsedMs: number;
  previousFrameTime: number | null;
}

/** Per-row line-swap transition in progress on the canvas. */
export interface VfdLineTransition {
  previous: NormalizedVfdLine;
  startedAt: number;
  durationMs: number;
}

/** Mutable render snapshot that the canvas pipeline reads on every animation tick. */
export interface VfdCanvasRenderState {
  lines: NormalizedVfdLine[];
  transitions: Map<number, VfdLineTransition>;
  marqueeStates: Map<string, VfdMarqueeRuntimeState>;
  cellCount: number;
  rowCount: number;
  prefersReducedMotion: boolean;
}

/** Resolved CSS colors for each phosphor-intensity bucket. */
export type VfdCanvasColors = Record<VfdBrightness, string>;
