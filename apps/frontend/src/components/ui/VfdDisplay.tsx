import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { VfdGlyph } from "@/components/ui/VfdGlyphs";
import { cn } from "@/lib/utils";

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
 * One logical section inside a VFD row.
 *
 * The display remains hardware-generic and deliberately dumb: sections know
 * nothing about songs, playtime, titles, metadata, or caller intent. VfdDisplay
 * does not infer which section should be flexible, important, pinned, or
 * truncated. It only allocates whole glyph cells from the props it receives and
 * renders the given content into pixel columns. Callers must describe the
 * desired layout explicitly, e.g. by giving one section `fill` when another
 * section should stay right-pinned.
 */
export interface VfdDisplaySection {
  /** Text or inline content for this fixed-width section inside a VFD row. */
  content: ReactNode;
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
  transition: VfdContentTransition;
  className?: string;
}

interface VfdCanvasPixelColumn {
  mask: number;
  brightness: VfdBrightness;
  secondaryMask?: number;
  secondaryBrightness?: VfdBrightness;
}

interface VfdMarqueeRuntimeState {
  offset: number;
  direction: number;
  holdSteps: number;
  elapsedMs: number;
  previousFrameTime: number | null;
}

interface VfdLineTransition {
  previous: NormalizedVfdLine;
  startedAt: number;
  durationMs: number;
}

interface VfdCanvasRenderState {
  lines: NormalizedVfdLine[];
  transitions: Map<number, VfdLineTransition>;
  marqueeStates: Map<string, VfdMarqueeRuntimeState>;
  cellCount: number;
  rowCount: number;
  prefersReducedMotion: boolean;
}

/**
 * Fixed chrome around the emulated hardware module.
 *
 * Do not use font-size or container width to infer additional VFD columns.
 * The physical pixel band is configured through `rows` and `charsPerLine`.
 */
const VFD_DEVICE_CLASSES = "px-3 py-4 text-[0.82rem] sm:text-[0.92rem]";

const VFD_LINE_SWAP_MS = 650;
const VFD_MARQUEE_COLUMN_STEP_MS = 67;
const VFD_MARQUEE_EDGE_HOLD_STEPS = 4;
const DEFAULT_VFD_ROWS = 4;
const DEFAULT_VFD_CELL_COUNT = 44;
const EMPTY_CELL = "\u00A0";
const MarqueeDirection = {
  Forward: 1,
  Backward: -1,
} as const;

const SPECTRUM_GLYPH_LEVELS: Record<string, number> = {
  [VfdGlyph.SpectrumLevel0]: 0,
  [VfdGlyph.SpectrumLevel1]: 1,
  [VfdGlyph.SpectrumLevel2]: 2,
  [VfdGlyph.SpectrumLevel3]: 3,
  [VfdGlyph.SpectrumLevel4]: 4,
  [VfdGlyph.SpectrumLevel5]: 5,
  [VfdGlyph.SpectrumLevel6]: 6,
  [VfdGlyph.SpectrumLevel7]: 7,
};

const BLANK_GLYPH = ["00000", "00000", "00000", "00000", "00000", "00000", "00000"] as const;
const FULL_GLYPH = ["11111", "11111", "11111", "11111", "11111", "11111", "11111"] as const;

const VFD_GLYPH_PATTERNS: Record<string, readonly string[]> = {
  " ": BLANK_GLYPH,
  [EMPTY_CELL]: BLANK_GLYPH,
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01111", "10000", "10000", "10000", "01111"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  g: ["00000", "00000", "01111", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "11110", "10000", "10000"],
  q: ["00000", "00000", "01111", "10001", "01111", "00001", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01001", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10001", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  Ä: ["01010", "00000", "01110", "10001", "11111", "10001", "10001"],
  Ö: ["01010", "00000", "01110", "10001", "10001", "10001", "01110"],
  Ü: ["01010", "00000", "10001", "10001", "10001", "10001", "01110"],
  ä: ["01010", "00000", "01110", "00001", "01111", "10001", "01111"],
  ö: ["01010", "00000", "01110", "10001", "10001", "10001", "01110"],
  ü: ["01010", "00000", "10001", "10001", "10001", "10011", "01101"],
  ß: ["01100", "10010", "10010", "11100", "10010", "10010", "11100"],
  é: ["00010", "00100", "01110", "10001", "11111", "10000", "01110"],
  è: ["01000", "00100", "01110", "10001", "11111", "10000", "01110"],
  á: ["00010", "00100", "01110", "00001", "01111", "10001", "01111"],
  à: ["01000", "00100", "01110", "00001", "01111", "10001", "01111"],
  ó: ["00010", "00100", "01110", "10001", "10001", "10001", "01110"],
  ò: ["01000", "00100", "01110", "10001", "10001", "10001", "01110"],
  ú: ["00010", "00100", "10001", "10001", "10001", "10011", "01101"],
  ù: ["01000", "00100", "10001", "10001", "10001", "10011", "01101"],
  ñ: ["01010", "10100", "10110", "11001", "10001", "10001", "10001"],
  ç: ["00000", "00000", "01111", "10000", "10000", "01111", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "\\": ["10000", "01000", "01000", "00100", "00010", "00010", "00001"],
  "'": ["01100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "·": ["00000", "00000", "00000", "01100", "01100", "00000", "00000"],
  "…": ["00000", "00000", "00000", "00000", "00000", "10101", "10101"],
  "♪": ["00010", "00011", "00010", "00010", "01110", "11110", "01100"],
  "♫": ["00101", "00111", "00101", "00101", "11111", "11111", "01010"],
  "♬": ["01010", "01111", "01010", "01010", "11111", "11111", "01010"],
  "’": ["01100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "‘": ["00110", "00100", "00010", "00000", "00000", "00000", "00000"],
  "`": ["01000", "00100", "00010", "00000", "00000", "00000", "00000"],
  "´": ["00010", "00100", "01000", "00000", "00000", "00000", "00000"],
  "“": ["01010", "01010", "10100", "00000", "00000", "00000", "00000"],
  "”": ["01010", "01010", "00101", "00000", "00000", "00000", "00000"],
  "‚": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
  "„": ["00000", "00000", "00000", "00000", "01010", "01010", "10100"],
  "–": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "—": ["00000", "00000", "11111", "11111", "00000", "00000", "00000"],
  "•": ["00000", "00000", "01110", "01110", "01110", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "€": ["00111", "01000", "11110", "01000", "11110", "01000", "00111"],
  "°": ["01100", "10010", "10010", "01100", "00000", "00000", "00000"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000"],
  "{": ["00010", "00100", "00100", "01000", "00100", "00100", "00010"],
  "}": ["01000", "00100", "00100", "00010", "00100", "00100", "01000"],
  Ø: ["01111", "10011", "10101", "10101", "10101", "11001", "11110"],
  ø: ["00000", "00001", "01110", "10011", "10101", "11001", "01110"],
  Æ: ["01111", "10100", "10100", "11110", "10100", "10100", "10111"],
  æ: ["00000", "00000", "11010", "00101", "01111", "10100", "01011"],
  [VfdGlyph.Ghost]: FULL_GLYPH,
  [VfdGlyph.ProgressEmpty]: BLANK_GLYPH,
  [VfdGlyph.ProgressBlock1]: ["00000", "10000", "10000", "10000", "10000", "10000", "00000"],
  [VfdGlyph.ProgressBlock2]: ["00000", "11000", "11000", "11000", "11000", "11000", "00000"],
  [VfdGlyph.ProgressBlock3]: ["00000", "11100", "11100", "11100", "11100", "11100", "00000"],
  [VfdGlyph.ProgressBlock4]: ["00000", "11110", "11110", "11110", "11110", "11110", "00000"],
  [VfdGlyph.ProgressBlock]: ["00000", "11111", "11111", "11111", "11111", "11111", "00000"],
  [VfdGlyph.ProgressRailEmpty]: ["00000", "00000", "00000", "00000", "00000", "11111", "11111"],
  [VfdGlyph.ProgressMarker]: ["01100", "01100", "01100", "01100", "01100", "11100", "11100"],
  [VfdGlyph.ProgressMarkerStart]: ["11000", "11000", "11000", "11000", "11000", "11000", "11000"],
  [VfdGlyph.ProgressMarkerRight]: ["00110", "00110", "00110", "00110", "00110", "11110", "11110"],
  [VfdGlyph.ProgressMarkerEnd2]: ["00011", "00011", "00011", "00011", "00011", "11111", "11111"],
  [VfdGlyph.ProgressMarkerEnd1]: ["00001", "00001", "00001", "00001", "00001", "11111", "11111"],
  [VfdGlyph.ProgressMarkerNext1]: ["10000", "10000", "10000", "10000", "10000", "10000", "10000"],
  [VfdGlyph.ProgressMarkerNext2]: ["11000", "11000", "11000", "11000", "11000", "11000", "11000"],
  [VfdGlyph.SpectrumLevel0]: BLANK_GLYPH,
  [VfdGlyph.SpectrumLevel1]: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  [VfdGlyph.SpectrumLevel2]: ["00000", "00000", "00000", "00000", "00000", "11111", "11111"],
  [VfdGlyph.SpectrumLevel3]: ["00000", "00000", "00000", "00000", "11111", "11111", "11111"],
  [VfdGlyph.SpectrumLevel4]: ["00000", "00000", "00000", "11111", "11111", "11111", "11111"],
  [VfdGlyph.SpectrumLevel5]: ["00000", "00000", "11111", "11111", "11111", "11111", "11111"],
  [VfdGlyph.SpectrumLevel6]: ["00000", "11111", "11111", "11111", "11111", "11111", "11111"],
  [VfdGlyph.SpectrumLevel7]: FULL_GLYPH,
};

/**
 * Pixel-band geometry contract.
 *
 * The VFD is a hardware emulation, not a fluid text layout. A row is a single
 * x*7 pixel band. Glyphs are 5 columns wide and adjacent glyphs are separated
 * by one blank pixel column in that same band. Every coordinate below is an
 * integer in pixel-band space. Avoid fractions, CSS percentage sizing, or
 * layout-derived subpixels in the glyph pipeline. If the display ever needs to
 * scale visually, scale the pixel size by an integer factor (1x1, 2x2, 3x3,
 * ...), then recompute these derived integer dimensions from that scale.
 */
const VFD_PIXEL_SIZE = 1;
const VFD_PIXEL_GAP = 1;
const VFD_DOT_PITCH = VFD_PIXEL_SIZE + VFD_PIXEL_GAP;
const VFD_GLYPH_COLUMNS = 5;
const VFD_GLYPH_ROWS = 7;
const VFD_GLYPH_SPACING_COLUMNS = 1;
const VFD_CELL_COLUMNS = VFD_GLYPH_COLUMNS + VFD_GLYPH_SPACING_COLUMNS;
const VFD_BAND_HEIGHT = VFD_GLYPH_ROWS * VFD_PIXEL_SIZE + (VFD_GLYPH_ROWS - 1) * VFD_PIXEL_GAP;
const VFD_FULL_COLUMN_MASK = (1 << VFD_GLYPH_ROWS) - 1;
const VFD_ROW_GAP = 11;

function vfdContentBox(element: HTMLElement): { width: number; height: number } {
  const style = window.getComputedStyle(element);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(0, Math.floor(rect.width - paddingLeft - paddingRight)),
    height: Math.max(0, Math.floor(rect.height - paddingTop - paddingBottom)),
  };
}

function vfdColumnCountForCells(cellCount: number): number {
  const safeCellCount = Math.max(1, cellCount);
  return safeCellCount * VFD_CELL_COLUMNS - VFD_GLYPH_SPACING_COLUMNS;
}

function vfdPixelBandWidth(columnCount: number): number {
  const safeColumnCount = Math.max(1, columnCount);
  return safeColumnCount * VFD_PIXEL_SIZE + (safeColumnCount - 1) * VFD_PIXEL_GAP;
}

function vfdCellPitchWidth(): number {
  return VFD_CELL_COLUMNS * VFD_DOT_PITCH;
}

function vfdCellCountForContentWidth(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  const firstCellWidth = vfdPixelBandWidth(VFD_GLYPH_COLUMNS);
  if (availableWidth <= firstCellWidth) return 1;
  return Math.max(1, Math.floor((Math.floor(availableWidth) - firstCellWidth) / vfdCellPitchWidth()) + 1);
}

function vfdRowCountForContentHeight(availableHeight: number, fallbackRows: number): number {
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return fallbackRows;
  return Math.max(1, Math.floor((Math.floor(availableHeight) + VFD_ROW_GAP) / (VFD_BAND_HEIGHT + VFD_ROW_GAP)));
}

function vfdRowWidth(cellCount: number): number {
  return vfdPixelBandWidth(vfdColumnCountForCells(cellCount));
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value ?? fallback));
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
    transition: safeLine.transition ?? "slide",
    className: safeLine.className,
  };
}

function sameSections(a: NormalizedVfdSection[] | undefined, b: NormalizedVfdSection[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
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
    a.transition === b.transition &&
    a.className === b.className
  );
}

function shouldMarquee(content: ReactNode, mode: VfdMarqueeMode | undefined, visibleCells: number): boolean {
  if (!mode) return false;
  if (mode === true) return stringLength(content) > visibleCells;
  return stringLength(content) > visibleCells;
}

function glyphPatternFor(glyph: string): readonly string[] {
  if (VFD_GLYPH_PATTERNS[glyph]) return VFD_GLYPH_PATTERNS[glyph];
  const normalizedGlyph = glyph.toLocaleUpperCase("en-US");
  const baseGlyph = normalizedGlyph.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return VFD_GLYPH_PATTERNS[normalizedGlyph] ?? VFD_GLYPH_PATTERNS[baseGlyph] ?? VFD_GLYPH_PATTERNS["?"] ?? BLANK_GLYPH;
}

function patternColumnMask(pattern: readonly string[], column: number): number {
  return pattern.reduce((mask, rowPattern, row) => {
    if (rowPattern[column] !== "1") return mask;
    return mask | (1 << row);
  }, 0);
}

function defaultMarqueeMode(content: ReactNode, marquee: VfdMarqueeMode | undefined): VfdMarqueeMode | undefined {
  if (marquee !== undefined) return marquee;
  return typeof content === "string" ? "overflow" : undefined;
}

function readPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function nextMarqueeState(
  state: { offset: number; direction: number; holdSteps: number },
  overflowColumns: number,
): { offset: number; direction: number; holdSteps: number } {
  if (state.holdSteps > 0) return { ...state, holdSteps: state.holdSteps - 1 };

  const nextOffset = state.offset + state.direction;
  if (nextOffset >= overflowColumns) {
    return { offset: overflowColumns, direction: MarqueeDirection.Backward, holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS };
  }
  if (nextOffset <= 0) {
    return { offset: 0, direction: MarqueeDirection.Forward, holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS };
  }
  return { offset: nextOffset, direction: state.direction, holdSteps: 0 };
}

type VfdCanvasColors = Record<VfdBrightness, string>;

function vfdDisplayHeight(rowCount: number): number {
  const safeRowCount = Math.max(1, rowCount);
  return safeRowCount * VFD_BAND_HEIGHT + (safeRowCount - 1) * VFD_ROW_GAP;
}

function blankCanvasColumn(brightness: VfdBrightness): VfdCanvasPixelColumn {
  return { mask: 0, brightness };
}

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

function glyphCellsToCanvasPixelColumns(cells: string[], brightness: VfdBrightness): VfdCanvasPixelColumn[] {
  return cells.flatMap((glyph, index) => {
    const columns = glyphCanvasPixelColumns(glyph, brightness);
    if (index < cells.length - 1) columns.push(blankCanvasColumn(brightness));
    return columns;
  });
}

function contentCanvasPixelColumns(content: string, brightness: VfdBrightness): VfdCanvasPixelColumn[] {
  if (content === EMPTY_CELL) return [];
  return glyphCellsToCanvasPixelColumns(Array.from(content), brightness);
}

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

function marqueeStateFor(
  state: VfdCanvasRenderState,
  key: string,
  now: number,
  overflowColumns: number,
): VfdMarqueeRuntimeState {
  const current = state.marqueeStates.get(key);
  if (!current) {
    const next = {
      offset: 0,
      direction: 1,
      holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS,
      elapsedMs: 0,
      previousFrameTime: now,
    };
    state.marqueeStates.set(key, next);
    return next;
  }

  if (current.previousFrameTime !== null) current.elapsedMs += now - current.previousFrameTime;
  current.previousFrameTime = now;

  const steps = Math.floor(current.elapsedMs / VFD_MARQUEE_COLUMN_STEP_MS);
  if (steps > 0) {
    current.elapsedMs -= steps * VFD_MARQUEE_COLUMN_STEP_MS;
    for (let step = 0; step < steps; step += 1) {
      const next = nextMarqueeState(current, overflowColumns);
      current.offset = next.offset;
      current.direction = next.direction;
      current.holdSteps = next.holdSteps;
    }
  }

  current.offset = Math.min(current.offset, overflowColumns);
  return current;
}

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
    cellCursor += cells;
  });

  return { columns: rowColumns, hasActiveMarquee };
}

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

function drawVfdCanvas(
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

function resolveCssColor(element: HTMLElement, value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  probe.style.color = trimmed;
  element.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

function resolveCanvasColors(element: HTMLElement): VfdCanvasColors {
  const computed = window.getComputedStyle(element);
  const fallback = computed.color || "currentColor";
  return {
    bright: resolveCssColor(element, computed.getPropertyValue("--mc-vfd-bright-color"), fallback),
    normal: resolveCssColor(element, computed.getPropertyValue("--mc-vfd-normal-color"), fallback),
    dim: resolveCssColor(element, computed.getPropertyValue("--mc-vfd-dim-color"), fallback),
    ghost: resolveCssColor(element, computed.getPropertyValue("--mc-vfd-ghost-color"), fallback),
  };
}

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
  sizingMode = "matrix",
  rows,
  charsPerLine = DEFAULT_VFD_CELL_COUNT,
  className,
  ariaLabel,
  phosphorColor,
}: VfdDisplayProps) {
  const configuredRowCount = normalizePositiveInteger(rows ?? lines.length, DEFAULT_VFD_ROWS);
  const requestedCellCount = normalizePositiveInteger(charsPerLine, DEFAULT_VFD_CELL_COUNT);
  const fallbackCellCount = sizingMode === "container" ? 1 : requestedCellCount;
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
    const state = renderStateRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    normalizedLines.forEach((line, index) => {
      const previousLine = state.lines[index];
      if (!previousLine || sameLinePresentation(previousLine, line)) return;
      if (previousLine.contentKey !== line.contentKey && line.transition !== "none" && !prefersReducedMotion) {
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
    requestDrawRef.current?.();
  }, [cellCount, normalizedLines, prefersReducedMotion, rowCount]);

  useLayoutEffect(() => {
    const element = vfdRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      setLayout({ cellCount: fallbackCellCount, rowCount: configuredRowCount });
      return;
    }

    const updateLayout = ({ width, height }: { width: number; height: number }) => {
      const nextCellCount = sizingMode === "container" ? vfdCellCountForContentWidth(width) : requestedCellCount;
      const nextRowCount =
        sizingMode === "container" ? vfdRowCountForContentHeight(height, configuredRowCount) : configuredRowCount;
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
