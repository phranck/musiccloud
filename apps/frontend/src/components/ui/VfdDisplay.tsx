import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

/** Phosphor intensity for one VFD row or section. */
export type VfdBrightness = "bright" | "normal" | "dim" | "ghost";

/** Horizontal alignment inside an already allocated integer segment range. */
export type VfdSectionAlign = "left" | "center" | "right";

/**
 * Segment allocation for a row section.
 *
 * `number` is a fixed integer segment count, `auto` uses the text length, and
 * `fill` receives remaining integer segments after fixed and auto sections.
 * Alignment is applied after this allocation. A right-aligned auto section has
 * no spare cells by design, but it still stays right-pinned when previous
 * sections absorb row-width changes or overflow pressure.
 */
export type VfdSectionCells = number | "auto" | "fill";

/** Enables VFD marquee rendering for strings wider than their allocated segment range. */
export type VfdMarqueeMode = boolean | "overflow";

/** Row content replacement animation mode. */
export type VfdContentTransition = "slide" | "none";

/**
 * Hardware sizing mode for the VFD module.
 *
 * - `matrix`: caller provides the physical matrix via `rows` and
 *   `charsPerLine`; the component renders exactly that many rows and segments.
 * - `container`: caller provides the outer CSS size; the component derives the
 *   maximum whole-number rows and whole-number segments per row that fit.
 *
 * Both modes keep the segment geometry unchanged. Container sizing never scales
 * a segment. It only decides how many complete 5x7 segments fit.
 */
export type VfdSizingMode = "matrix" | "container";

/**
 * One logical section inside a VFD row.
 *
 * The display remains hardware-generic and deliberately dumb: sections know
 * nothing about songs, playtime, titles, metadata, or caller intent. VfdDisplay
 * does not infer which section should be flexible, important, pinned, or
 * truncated. It only allocates whole segments from the props it receives and
 * renders the given content into those segment cells. Callers must describe the
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
  /** Enables segment-stepped marquee movement for the whole line. */
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
 *    renders exactly that many rows and exactly that many 5x7 segments per row.
 *    The display becomes as large as that matrix requires. Segment pixels are
 *    not auto-scaled. Never add or remove segments because of spare container
 *    width.
 * 2. Container mode: provide a CSS size from the outside and set
 *    `sizingMode="container"`. The component measures the available content box
 *    and renders the maximum number of complete rows and complete segments that
 *    fit. Segment geometry is still fixed. The component never creates
 *    fractional segment pixels and never scales a segment to fill leftover
 *    space.
 *
 * All geometry is integer-only. A display contains rows, a row contains
 * segments, and a segment contains a fixed 5x7 matrix of segment pixels. Any
 * future visual scaling must be an integer segment-pixel scale, e.g. 1x1, 2x2,
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
  /** Fixed integer number of 5x7 segments per row in matrix mode. Content is clipped/padded to this grid. */
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

interface OutgoingVfdLine {
  key: string;
  line: NormalizedVfdLine;
}

interface VfdRowProps extends NormalizedVfdLine {
  ghostPattern: string;
  cellCount: number;
  cellKeys: string[];
  symbolPrefix: string;
  outgoing?: OutgoingVfdLine | null;
}

interface CellGridOptions {
  align: VfdSectionAlign;
  marquee?: VfdMarqueeMode;
  className?: string;
}

interface VfdSegmentCell {
  glyph: string;
  className?: string;
}

/**
 * Fixed chrome around the emulated hardware module.
 *
 * Do not use font-size or container width to infer additional VFD segments.
 * The physical segment matrix is configured through `rows` and `charsPerLine`.
 */
const VFD_DEVICE_CLASSES = "px-5 py-4 text-[0.82rem] sm:text-[0.92rem]";

const BRIGHTNESS_CLASSES: Record<VfdBrightness, string> = {
  bright: "mc-vfd-bright",
  normal: "mc-vfd-normal",
  dim: "mc-vfd-dim",
  ghost: "mc-vfd-ghost",
};

const VFD_LINE_SWAP_MS = 900;
const VFD_MARQUEE_STEP_MS = 260;
const VFD_MARQUEE_EDGE_HOLD_STEPS = 4;
const DEFAULT_VFD_ROWS = 4;
const DEFAULT_VFD_CELL_COUNT = 44;
const EMPTY_CELL = "\u00A0";

export const VFD_GLYPHS = {
  ghost: "\uE000",
  progressEmpty: "\uE002",
  progressBlock1: "\uE009",
  progressBlock2: "\uE00A",
  progressBlock3: "\uE00B",
  progressBlock4: "\uE00C",
  progressBlock: "\uE008",
  progressRailEmpty: "\uE004",
  progressMarker: "\uE005",
  progressMarkerStart: "\uE00D",
  progressMarkerRight: "\uE012",
  progressMarkerEnd2: "\uE00E",
  progressMarkerEnd1: "\uE00F",
  progressMarkerNext1: "\uE010",
  progressMarkerNext2: "\uE011",
  spectrumLevel0: "\uE013",
  spectrumLevel1: "\uE014",
  spectrumLevel2: "\uE015",
  spectrumLevel3: "\uE016",
  spectrumLevel4: "\uE017",
  spectrumLevel5: "\uE018",
  spectrumLevel6: "\uE019",
  spectrumLevel7: "\uE01A",
} as const;

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
  [VFD_GLYPHS.ghost]: FULL_GLYPH,
  [VFD_GLYPHS.progressEmpty]: BLANK_GLYPH,
  [VFD_GLYPHS.progressBlock1]: ["00000", "10000", "10000", "10000", "10000", "10000", "00000"],
  [VFD_GLYPHS.progressBlock2]: ["00000", "11000", "11000", "11000", "11000", "11000", "00000"],
  [VFD_GLYPHS.progressBlock3]: ["00000", "11100", "11100", "11100", "11100", "11100", "00000"],
  [VFD_GLYPHS.progressBlock4]: ["00000", "11110", "11110", "11110", "11110", "11110", "00000"],
  [VFD_GLYPHS.progressBlock]: ["00000", "11111", "11111", "11111", "11111", "11111", "00000"],
  [VFD_GLYPHS.progressRailEmpty]: ["00000", "00000", "00000", "00000", "00000", "11111", "11111"],
  [VFD_GLYPHS.progressMarker]: ["01100", "01100", "01100", "01100", "01100", "11100", "11100"],
  [VFD_GLYPHS.progressMarkerStart]: ["11000", "11000", "11000", "11000", "11000", "11000", "11000"],
  [VFD_GLYPHS.progressMarkerRight]: ["00110", "00110", "00110", "00110", "00110", "11110", "11110"],
  [VFD_GLYPHS.progressMarkerEnd2]: ["00011", "00011", "00011", "00011", "00011", "11111", "11111"],
  [VFD_GLYPHS.progressMarkerEnd1]: ["00001", "00001", "00001", "00001", "00001", "11111", "11111"],
  [VFD_GLYPHS.progressMarkerNext1]: ["10000", "10000", "10000", "10000", "10000", "10000", "10000"],
  [VFD_GLYPHS.progressMarkerNext2]: ["11000", "11000", "11000", "11000", "11000", "11000", "11000"],
  [VFD_GLYPHS.spectrumLevel0]: BLANK_GLYPH,
  [VFD_GLYPHS.spectrumLevel1]: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  [VFD_GLYPHS.spectrumLevel2]: ["00000", "00000", "00000", "00000", "00000", "11111", "11111"],
  [VFD_GLYPHS.spectrumLevel3]: ["00000", "00000", "00000", "00000", "11111", "11111", "11111"],
  [VFD_GLYPHS.spectrumLevel4]: ["00000", "00000", "00000", "11111", "11111", "11111", "11111"],
  [VFD_GLYPHS.spectrumLevel5]: ["00000", "00000", "11111", "11111", "11111", "11111", "11111"],
  [VFD_GLYPHS.spectrumLevel6]: ["00000", "11111", "11111", "11111", "11111", "11111", "11111"],
  [VFD_GLYPHS.spectrumLevel7]: FULL_GLYPH,
};

/**
 * Segment geometry contract.
 *
 * The VFD is a hardware emulation, not a fluid text layout. The smallest
 * display has one segment. One segment is a fixed 5x7 matrix of segment
 * pixels. Every coordinate below is an integer in segment-pixel space. Avoid
 * fractions, CSS percentage sizing, or layout-derived subpixels in the glyph
 * pipeline. If the display ever needs to scale visually, scale the segment
 * pixel size by an integer factor (1x1, 2x2, 3x3, ...), then recompute these
 * derived integer dimensions from that scale. Never scale rows to arbitrary
 * container widths and never add extra segments because the container happens
 * to have spare space.
 */
const VFD_PIXEL_SIZE = 1;
const VFD_PIXEL_GAP = 1;
const VFD_DOT_PITCH = VFD_PIXEL_SIZE + VFD_PIXEL_GAP;
const VFD_SEGMENT_COLUMNS = 5;
const VFD_SEGMENT_ROWS = 7;
const VFD_SEGMENT_GAP = 3;
const VFD_SEGMENT_WIDTH = VFD_SEGMENT_COLUMNS * VFD_PIXEL_SIZE + (VFD_SEGMENT_COLUMNS - 1) * VFD_PIXEL_GAP;
const VFD_SEGMENT_HEIGHT = VFD_SEGMENT_ROWS * VFD_PIXEL_SIZE + (VFD_SEGMENT_ROWS - 1) * VFD_PIXEL_GAP;
const VFD_SEGMENT_PITCH = VFD_SEGMENT_WIDTH + VFD_SEGMENT_GAP;
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

function vfdCellCountForContentWidth(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  return Math.max(1, Math.floor((Math.floor(availableWidth) + VFD_SEGMENT_GAP) / VFD_SEGMENT_PITCH));
}

function vfdRowCountForContentHeight(availableHeight: number, fallbackRows: number): number {
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) return fallbackRows;
  return Math.max(1, Math.floor((Math.floor(availableHeight) + VFD_ROW_GAP) / (VFD_SEGMENT_HEIGHT + VFD_ROW_GAP)));
}

function vfdRowOffsetForWidth(availableWidth: number, cellCount: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 0;
  return Math.max(0, Math.floor((Math.floor(availableWidth) - vfdRowWidth(cellCount)) / 2));
}

const VFD_PIXEL_CELLS = Array.from({ length: VFD_SEGMENT_COLUMNS * VFD_SEGMENT_ROWS }, (_, pixel) => ({
  key: `vfd-pixel-${pixel}`,
  row: Math.floor(pixel / VFD_SEGMENT_COLUMNS),
  column: pixel % VFD_SEGMENT_COLUMNS,
}));

function vfdRowWidth(segmentCount: number): number {
  const safeSegmentCount = Math.max(1, segmentCount);
  return safeSegmentCount * VFD_SEGMENT_WIDTH + (safeSegmentCount - 1) * VFD_SEGMENT_GAP;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value ?? fallback));
}

function fitPatternToCells(pattern: string, cellCount: number): string {
  const chars = Array.from(pattern || VFD_GLYPHS.ghost);
  return Array.from({ length: cellCount }, (_, index) => chars[index % chars.length] ?? VFD_GLYPHS.ghost).join("");
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

function safeSvgIdPart(value: string): string {
  return Array.from(value)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "0")
    .join("-");
}

function glyphSymbolId(symbolPrefix: string, glyph: string, ghost: boolean): string {
  return `${symbolPrefix}-${ghost ? "ghost" : "glyph"}-${safeSvgIdPart(glyph || EMPTY_CELL)}`;
}

function VfdGlyphSymbol({ glyph, ghost, symbolPrefix }: { glyph: string; ghost: boolean; symbolPrefix: string }) {
  const pattern = ghost ? FULL_GLYPH : glyphPatternFor(glyph);

  return (
    <symbol id={glyphSymbolId(symbolPrefix, glyph, ghost)} viewBox={`0 0 ${VFD_SEGMENT_WIDTH} ${VFD_SEGMENT_HEIGHT}`}>
      {VFD_PIXEL_CELLS.flatMap(({ key, row, column }) =>
        pattern[row]?.[column] === "1"
          ? [
              <rect
                key={key}
                className="mc-vfd-symbol-pixel"
                x={column * VFD_DOT_PITCH}
                y={row * VFD_DOT_PITCH}
                width={VFD_PIXEL_SIZE}
                height={VFD_PIXEL_SIZE}
              />,
            ]
          : [],
      )}
    </symbol>
  );
}

function VfdSegment({
  glyph = EMPTY_CELL,
  ghost = false,
  index,
  symbolPrefix,
  className,
}: {
  glyph?: string;
  ghost?: boolean;
  index: number;
  symbolPrefix: string;
  className?: string;
}) {
  const segmentX = index * VFD_SEGMENT_PITCH;
  const href = `#${glyphSymbolId(symbolPrefix, glyph, ghost)}`;

  return (
    <g className={cn("mc-vfd-segment", className)} transform={`translate(${segmentX} 0)`}>
      <use href={href} width={VFD_SEGMENT_WIDTH} height={VFD_SEGMENT_HEIGHT} />
    </g>
  );
}

function VfdSegmentRow({
  glyphs,
  cellKeys,
  className,
  ghost = false,
  visibleCells,
  symbolPrefix,
}: {
  glyphs: Array<string | VfdSegmentCell>;
  cellKeys: string[];
  className?: string;
  ghost?: boolean;
  visibleCells: number;
  symbolPrefix: string;
}) {
  const segmentCells = glyphs.map((cell, index) => ({
    glyph: typeof cell === "string" ? cell : cell.glyph,
    className: typeof cell === "string" ? undefined : cell.className,
    key: cellKeys[index] ?? `vfd-cell-extra-${index}`,
  }));
  const renderedCellCount = Math.max(1, glyphs.length);
  const uniqueGlyphs = Array.from(new Set(segmentCells.map((cell) => cell.glyph)));
  const rowWidth = vfdRowWidth(renderedCellCount);
  const rowHeight = VFD_SEGMENT_HEIGHT;

  return (
    <svg
      className={cn("mc-vfd-segment-row", className)}
      viewBox={`0 0 ${vfdRowWidth(renderedCellCount)} ${VFD_SEGMENT_HEIGHT}`}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={
        {
          inlineSize: `${rowWidth}px`,
          blockSize: `${rowHeight}px`,
          "--mc-vfd-rendered-cells": renderedCellCount,
          "--mc-vfd-visible-cells": visibleCells,
          "--mc-vfd-grid-scale": renderedCellCount / visibleCells,
        } as CSSProperties
      }
    >
      <defs>
        {uniqueGlyphs.map((glyph) => (
          <VfdGlyphSymbol
            key={glyphSymbolId(symbolPrefix, glyph, ghost)}
            glyph={glyph}
            ghost={ghost}
            symbolPrefix={symbolPrefix}
          />
        ))}
      </defs>
      {segmentCells.map(({ glyph, key, className }, index) => (
        <VfdSegment
          key={key}
          glyph={glyph}
          ghost={ghost}
          index={index}
          symbolPrefix={symbolPrefix}
          className={className}
        />
      ))}
    </svg>
  );
}

function layoutStringGlyphs(
  content: string,
  visibleCells: number,
  align: VfdSectionAlign,
  marquee?: VfdMarqueeMode,
  marqueeOffset = 0,
): string[] {
  const chars = content === EMPTY_CELL ? [] : Array.from(content);
  const animateMarquee = shouldMarquee(content, marquee, visibleCells);
  const displayChars = animateMarquee
    ? chars.slice(marqueeOffset, marqueeOffset + visibleCells)
    : chars.slice(0, visibleCells);
  const startIndex = animateMarquee
    ? 0
    : align === "center"
      ? Math.max(0, Math.floor((visibleCells - displayChars.length) / 2))
      : align === "right"
        ? Math.max(0, visibleCells - displayChars.length)
        : 0;

  return Array.from({ length: visibleCells }, (_, index) => displayChars[index - startIndex] ?? EMPTY_CELL);
}

function defaultMarqueeMode(content: ReactNode, marquee: VfdMarqueeMode | undefined): VfdMarqueeMode | undefined {
  if (marquee !== undefined) return marquee;
  return typeof content === "string" ? "overflow" : undefined;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function useVfdMarqueeOffset(content: string, visibleCells: number, animateMarquee: boolean): number {
  const overflowCells = Math.max(0, stringLength(content) - visibleCells);
  const [state, setState] = useState({ offset: 0, direction: 1, holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS });

  useEffect(() => {
    if (!animateMarquee || overflowCells <= 0) return;

    const timer = window.setInterval(() => {
      setState(({ offset, direction, holdSteps }) => {
        if (holdSteps > 0) return { offset, direction, holdSteps: holdSteps - 1 };

        const nextOffset = offset + direction;
        if (nextOffset >= overflowCells) {
          return { offset: overflowCells, direction: -1, holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS };
        }
        if (nextOffset <= 0) {
          return { offset: 0, direction: 1, holdSteps: VFD_MARQUEE_EDGE_HOLD_STEPS };
        }
        return { offset: nextOffset, direction, holdSteps: 0 };
      });
    }, VFD_MARQUEE_STEP_MS);

    return () => window.clearInterval(timer);
  }, [animateMarquee, overflowCells]);

  return animateMarquee ? Math.min(state.offset, overflowCells) : 0;
}

function VfdStringCells({
  content,
  visibleCells,
  cellKeys,
  align,
  marquee,
  className,
  symbolPrefix,
}: {
  content: string;
  visibleCells: number;
  cellKeys: string[];
  align: VfdSectionAlign;
  marquee?: VfdMarqueeMode;
  className?: string;
  symbolPrefix: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const effectiveMarquee = defaultMarqueeMode(content, marquee);
  const animateMarquee = !prefersReducedMotion && shouldMarquee(content, effectiveMarquee, visibleCells);
  const marqueeOffset = useVfdMarqueeOffset(content, visibleCells, animateMarquee);
  const glyphs = layoutStringGlyphs(content, visibleCells, align, effectiveMarquee, marqueeOffset);

  return (
    <VfdSegmentRow
      glyphs={glyphs}
      cellKeys={cellKeys}
      className={className}
      visibleCells={visibleCells}
      symbolPrefix={symbolPrefix}
    />
  );
}

function buildVfdCells(
  content: ReactNode,
  visibleCells: number,
  cellKeys: string[],
  { align, marquee, className }: CellGridOptions,
  symbolPrefix: string,
): ReactNode {
  if (typeof content !== "string") return content;

  return (
    <VfdStringCells
      key={`${symbolPrefix}:${content}:${visibleCells}:${String(marquee)}`}
      content={content}
      visibleCells={visibleCells}
      cellKeys={cellKeys}
      align={align}
      marquee={marquee}
      className={className}
      symbolPrefix={symbolPrefix}
    />
  );
}

function buildSectionedContent(
  line: Pick<NormalizedVfdLine, "content" | "sections" | "align" | "marquee">,
  cellCount: number,
  cellKeys: string[],
  symbolPrefix: string,
): ReactNode {
  if (!line.sections?.length) {
    return buildVfdCells(
      line.content,
      cellCount,
      cellKeys,
      {
        align: line.align,
        marquee: line.marquee,
      },
      `${symbolPrefix}-line`,
    );
  }

  const sectionCells = resolveSectionCells(line.sections, cellCount);
  const hasScrollingSection = line.sections.some((section, index) => {
    const cells = sectionCells[index] ?? 0;
    return (
      typeof section.content === "string" &&
      shouldMarquee(section.content, defaultMarqueeMode(section.content, section.marquee), cells)
    );
  });
  const canRenderHardwareRow =
    !hasScrollingSection && line.sections.every((section) => typeof section.content === "string");

  if (canRenderHardwareRow) {
    const glyphs = line.sections.flatMap((section, index): VfdSegmentCell[] => {
      const cells = sectionCells[index] ?? 0;
      if (cells <= 0 || typeof section.content !== "string") return [];
      const className = cn(section.brightness && BRIGHTNESS_CLASSES[section.brightness], section.className);
      return layoutStringGlyphs(
        section.content,
        cells,
        section.align,
        defaultMarqueeMode(section.content, section.marquee),
      ).map((glyph) => ({
        glyph,
        className,
      }));
    });
    const rowGlyphs = glyphs.slice(0, cellCount);
    while (rowGlyphs.length < cellCount) rowGlyphs.push({ glyph: EMPTY_CELL });

    return (
      <VfdSegmentRow
        glyphs={rowGlyphs}
        cellKeys={cellKeys}
        visibleCells={cellCount}
        symbolPrefix={`${symbolPrefix}-sections`}
      />
    );
  }

  return (
    <span className="mc-vfd-section-layout" style={{ "--mc-vfd-section-gap": `${VFD_SEGMENT_GAP}px` } as CSSProperties}>
      {line.sections.map((section, index) => {
        const cells = sectionCells[index] ?? 0;
        if (cells <= 0) return null;
        return (
          <span
            key={section.key}
            className={cn(
              "mc-vfd-section",
              section.brightness && BRIGHTNESS_CLASSES[section.brightness],
              section.className,
            )}
            style={{ "--mc-vfd-section-width": `${vfdRowWidth(cells)}px` } as CSSProperties}
          >
            {buildVfdCells(
              section.content,
              cells,
              cellKeys,
              {
                align: section.align,
                marquee: section.marquee,
                className: section.className,
              },
              `${symbolPrefix}-section-${index}`,
            )}
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
  transition,
  className,
  ghostPattern,
  cellCount,
  cellKeys,
  symbolPrefix,
  outgoing,
}: VfdRowProps) {
  const line = { content, sections, align, marquee };

  return (
    <div className={cn("mc-vfd-line", BRIGHTNESS_CLASSES[brightness])} data-row={rowKey}>
      <span className="mc-vfd-line-matrix" aria-hidden="true">
        <VfdSegmentRow
          glyphs={Array.from(ghostPattern)}
          cellKeys={cellKeys}
          ghost
          visibleCells={cellCount}
          symbolPrefix={`${symbolPrefix}-ghost`}
        />
      </span>
      {outgoing && (
        <span key={outgoing.key} className="mc-vfd-line-content-out" aria-hidden="true">
          <span className="mc-vfd-line-content-inner">
            {buildSectionedContent(outgoing.line, cellCount, cellKeys, `${symbolPrefix}-out`)}
          </span>
        </span>
      )}
      <span
        key={contentKey}
        className={cn("mc-vfd-line-content", transition === "none" && "mc-vfd-line-content-static")}
      >
        <span className={cn("mc-vfd-line-content-inner", className)}>
          {buildSectionedContent(line, cellCount, cellKeys, `${symbolPrefix}-in`)}
        </span>
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
 * - Content replacement animations are compositor-friendly translate3d movements.
 * - Marquee text advances in whole segment steps, never across segment gaps.
 * - Content changes are routed through `setLineContent(index, line)` below.
 *   Updating only the affected row keeps unchanged VFD rows mounted and still.
 * - Inactive background cells are custom 5x7 pixel matrices, so the ghost
 *   layer represents the actual hardware cell geometry instead of a font "8".
 */
export function VfdDisplay({
  lines,
  sizingMode = "matrix",
  rows,
  charsPerLine = DEFAULT_VFD_CELL_COUNT,
  className,
  ariaLabel,
  phosphorColor = "#7aebff",
  ghostPattern = VFD_GLYPHS.ghost,
}: VfdDisplayProps) {
  const reactId = useId();
  const symbolPrefix = useMemo(() => `mc-vfd-${reactId.replace(/[^a-zA-Z0-9_-]/g, "") || "display"}`, [reactId]);
  const configuredRowCount = normalizePositiveInteger(rows ?? lines.length, DEFAULT_VFD_ROWS);
  const requestedCellCount = normalizePositiveInteger(charsPerLine, DEFAULT_VFD_CELL_COUNT);
  const fallbackCellCount = sizingMode === "container" ? 1 : requestedCellCount;
  const [layout, setLayout] = useState(() => ({
    cellCount: fallbackCellCount,
    rowCount: configuredRowCount,
    rowOffset: 0,
  }));
  const { cellCount, rowCount, rowOffset } = layout;
  const cellKeys = useMemo(() => Array.from({ length: cellCount }, (_, index) => `vfd-cell-${index}`), [cellCount]);
  const ghostCells = useMemo(() => fitPatternToCells(ghostPattern, cellCount), [cellCount, ghostPattern]);
  const vfdRef = useRef<HTMLElement | null>(null);
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

        if (previousLine && previousLine.contentKey !== nextLine.contentKey && nextLine.transition !== "none") {
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
    normalizedLines.forEach((line, index) => {
      if (line.transition === "none") return;
      setLineContent(index, line);
    });
  }, [normalizedLines, setLineContent]);

  useLayoutEffect(() => {
    const element = vfdRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      setLayout({ cellCount: fallbackCellCount, rowCount: configuredRowCount, rowOffset: 0 });
      return;
    }

    const updateLayout = ({ width, height }: { width: number; height: number }) => {
      const nextCellCount = sizingMode === "container" ? vfdCellCountForContentWidth(width) : requestedCellCount;
      const nextRowCount =
        sizingMode === "container" ? vfdRowCountForContentHeight(height, configuredRowCount) : configuredRowCount;
      const nextRowOffset = vfdRowOffsetForWidth(width, nextCellCount);
      setLayout((currentLayout) =>
        currentLayout.cellCount === nextCellCount &&
        currentLayout.rowCount === nextRowCount &&
        currentLayout.rowOffset === nextRowOffset
          ? currentLayout
          : { cellCount: nextCellCount, rowCount: nextRowCount, rowOffset: nextRowOffset },
      );
    };

    updateLayout(vfdContentBox(element));
    const observer = new ResizeObserver(() => {
      updateLayout(vfdContentBox(element));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [configuredRowCount, fallbackCellCount, requestedCellCount, sizingMode]);

  useEffect(() => {
    return () => {
      clearTimers.current.forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const style = {
    "--mc-vfd-color": phosphorColor,
    "--mc-vfd-cells": cellCount,
    "--mc-vfd-row-height": `${VFD_SEGMENT_HEIGHT}px`,
    "--mc-vfd-row-gap": `${VFD_ROW_GAP}px`,
    "--mc-vfd-row-width": `${vfdRowWidth(cellCount)}px`,
    "--mc-vfd-row-offset": `${rowOffset}px`,
  } as CSSProperties;

  return (
    <RecessedCard className={cn("p-0.5", className)} radius={{ base: "0.75rem", sm: "0.875rem" }}>
      <RecessedCard.Body>
        <section ref={vfdRef} className={cn("mc-vfd", VFD_DEVICE_CLASSES)} style={style} aria-label={ariaLabel}>
          <div className="mc-vfd-row-group">
            {Array.from({ length: rowCount }, (_, index) => {
              const stateLine = displayLines[index] ?? normalizeLine(index, undefined);
              const liveLine = normalizedLines[index]?.transition === "none" ? normalizedLines[index] : stateLine;
              return (
                <VfdRow
                  key={liveLine.rowKey}
                  {...liveLine}
                  ghostPattern={ghostCells}
                  cellCount={cellCount}
                  cellKeys={cellKeys}
                  symbolPrefix={`${symbolPrefix}-row-${index}`}
                  outgoing={liveLine.transition === "none" ? null : outgoingLines[index]}
                />
              );
            })}
          </div>
        </section>
      </RecessedCard.Body>
    </RecessedCard>
  );
}
