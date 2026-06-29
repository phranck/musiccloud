import type { ReactNode } from "react";
import type { SpectrumFrame } from "@/components/audio/spectrumStore";
import { AnalyzerMode } from "@/components/playback/analyzerMode";
import {
  VfdBarAnchor,
  VfdBrightness,
  VfdContentTransition,
  type VfdDisplayLine,
  type VfdDisplaySection,
  type VfdPixelBarSegment,
  VfdSectionAlign,
  VfdSectionCells,
} from "@/components/ui/VfdDisplay";
import { VfdGlyph } from "@/components/ui/VfdGlyphs";

/** Per-channel live VU levels (0..1) for the stereo VU analyzer mode. */
interface PlayerStereoLevels {
  left: number;
  right: number;
}

/** Per-channel peak-hold levels (0..1) for the stereo VU analyzer mode. */
interface PlayerStereoPeakHold {
  left: number;
  right: number;
}

/** Per-channel frequency-band buffers for the multi-band analyzer mode. */
interface StereoSpectrumBands {
  left: readonly number[];
  right: readonly number[];
}

/** Either a mono band list or the stereo per-channel band pair. */
type PlayerSpectrumBands = readonly number[] | StereoSpectrumBands;

export const PLAYER_DEFAULT_VFD_CELLS = 44;
// Matches VfdDisplay's fixed 5-column glyph plus 1-column spacing at 1px dot/1px gap.
export const PLAYER_VFD_CELL_PITCH_PX = 12;
export const PLAYER_VFD_FIRST_CELL_WIDTH_PX = 9;
// Pixel columns per cell inside the VFD canvas (5 glyph + 1 spacing).
const PLAYER_VFD_COLUMNS_PER_CELL = 6;
const PLAYER_SPECTRUM_CELLS = 30;
const PLAYER_STEREO_CHANNEL_CELLS = 13;
const PLAYER_STEREO_CHANNEL_GAP_CELLS = 3;
// Centre gap between the two stereo VU bars in pixel columns. Five columns
// match the width of one glyph segment (the user-visible reference), so the
// gap reads as exactly one missing segment between the two bars.
const PLAYER_STEREO_VU_GAP_COLUMNS = 5;
const PLAYER_TIME_SPACER_CELLS = 2;
const PLAYER_SPECTRUM_LEVEL_GLYPHS = [
  VfdGlyph.SpectrumLevel0,
  VfdGlyph.SpectrumLevel1,
  VfdGlyph.SpectrumLevel2,
  VfdGlyph.SpectrumLevel3,
  VfdGlyph.SpectrumLevel4,
  VfdGlyph.SpectrumLevel5,
  VfdGlyph.SpectrumLevel6,
  VfdGlyph.SpectrumLevel7,
] as const;

function sectionFor(
  content: string,
  brightness: VfdDisplaySection["brightness"],
  cells: VfdDisplaySection["cells"] = Array.from(content).length,
  key?: string,
): VfdDisplaySection | null {
  if (!content) return null;
  return { content, cells, align: VfdSectionAlign.Left, brightness, key };
}

function compactSections(sections: Array<VfdDisplaySection | null>): VfdDisplaySection[] {
  return sections.filter((section): section is VfdDisplaySection => Boolean(section));
}

function spectrumGlyphForLevel(level: number): string {
  const safeLevel = Math.max(0, Math.min(PLAYER_SPECTRUM_LEVEL_GLYPHS.length - 1, level));
  return PLAYER_SPECTRUM_LEVEL_GLYPHS[safeLevel] ?? VfdGlyph.SpectrumLevel0;
}

function isStereoSpectrumBands(bands: PlayerSpectrumBands): bands is StereoSpectrumBands {
  if (Array.isArray(bands)) return false;
  const candidate = bands as Partial<StereoSpectrumBands>;
  return Array.isArray(candidate.left) && Array.isArray(candidate.right);
}

function renderBandContent(bands: ArrayLike<number>, cells: number): string {
  const safeCells = Math.max(1, cells);
  return Array.from({ length: safeCells }, (_, index) => {
    const sourceIndex = Math.min(bands.length - 1, Math.floor((index / safeCells) * bands.length));
    const level = Math.round((bands[sourceIndex] ?? 0) * (PLAYER_SPECTRUM_LEVEL_GLYPHS.length - 1));
    return spectrumGlyphForLevel(level);
  }).join("");
}

export function playerVfdCellCountForContentWidth(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  if (availableWidth <= PLAYER_VFD_FIRST_CELL_WIDTH_PX) return 1;
  return Math.max(
    1,
    Math.floor((Math.floor(availableWidth) - PLAYER_VFD_FIRST_CELL_WIDTH_PX) / PLAYER_VFD_CELL_PITCH_PX) + 1,
  );
}

export function elementContentWidth(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  return Math.max(0, Math.floor(element.getBoundingClientRect().width - paddingLeft - paddingRight));
}

function stereoChannelBandCells(displayCells: number, timeText: string): number {
  const timeCells = Math.max(1, Array.from(timeText).length);
  const analyzerCells = Math.max(0, displayCells - PLAYER_TIME_SPACER_CELLS - timeCells);
  const fixedStereoCells = PLAYER_STEREO_CHANNEL_GAP_CELLS;
  return Math.min(PLAYER_STEREO_CHANNEL_CELLS, Math.max(0, Math.floor((analyzerCells - fixedStereoCells) / 2)));
}

function playerAnalyzerCells(displayCells: number, timeText: string): number {
  const timeCells = Math.max(1, Array.from(timeText).length);
  return Math.max(0, displayCells - PLAYER_TIME_SPACER_CELLS - timeCells);
}

function playerVfdColumnCountForCells(cellCount: number): number {
  return Math.max(0, cellCount * PLAYER_VFD_COLUMNS_PER_CELL - 1);
}

/**
 * Builds the single-section pixel-bar descriptor for the stereo VU display
 * mode. Each channel renders one horizontal bar growing outward from the
 * centre of the analyzer area, with a bright peak column at the leading
 * edge and a dim trail behind it. The centre gap reserves exactly
 * `PLAYER_STEREO_VU_GAP_COLUMNS` pixel columns; any leftover odd column
 * (when the available track width is not evenly divisible) is added to the
 * right channel so the bar pair remains symmetric to the eye on every
 * common display width.
 *
 * When a peak hold level is supplied, each channel additionally renders a
 * single bright pixel column at the peak hold position — but only if that
 * column sits beyond the live bar's leading edge. Otherwise the bar's own
 * peak column already covers it and the extra segment would visually fight
 * with it.
 */
function renderStereoVuSections(
  levels: PlayerStereoLevels | null,
  peakHold: PlayerStereoPeakHold | null,
  displayCells: number,
  timeText: string,
): VfdDisplaySection[] {
  const analyzerCells = playerAnalyzerCells(displayCells, timeText);
  if (analyzerCells <= 0) return [];

  const analyzerColumns = playerVfdColumnCountForCells(analyzerCells);
  const gapColumns = Math.min(analyzerColumns, PLAYER_STEREO_VU_GAP_COLUMNS);
  const trackTotal = Math.max(0, analyzerColumns - gapColumns);
  const leftTrackColumns = Math.floor(trackTotal / 2);
  const rightTrackColumns = trackTotal - leftTrackColumns;

  const safeLevel = (value: number) => Math.max(0, Math.min(1, value));
  const leftFill = levels ? Math.round(safeLevel(levels.left) * leftTrackColumns) : 0;
  const rightFill = levels ? Math.round(safeLevel(levels.right) * rightTrackColumns) : 0;
  const leftHoldCols = peakHold ? Math.round(safeLevel(peakHold.left) * leftTrackColumns) : 0;
  const rightHoldCols = peakHold ? Math.round(safeLevel(peakHold.right) * rightTrackColumns) : 0;

  const leftEnd = leftTrackColumns - 1;
  const rightStart = leftTrackColumns + gapColumns;
  const rightEnd = analyzerColumns - 1;

  const pixelBars: VfdPixelBarSegment[] = [];
  if (leftTrackColumns > 0) {
    pixelBars.push({
      startColumn: 0,
      endColumn: leftEnd,
      fillColumns: leftFill,
      anchor: VfdBarAnchor.Right,
      trailBrightness: VfdBrightness.Dim,
      peakBrightness: VfdBrightness.Bright,
    });
    if (leftHoldCols > leftFill) {
      // Peak hold sits one column past the live bar's outer edge. The left
      // channel grows leftward, so the hold pixel is `leftHoldCols - 1`
      // columns into the track measured from the right (centre-facing)
      // edge. Single-column segment, bright, no trail.
      const holdColumn = leftEnd - (leftHoldCols - 1);
      pixelBars.push({
        startColumn: holdColumn,
        endColumn: holdColumn,
        fillColumns: 1,
        anchor: VfdBarAnchor.Left,
        trailBrightness: VfdBrightness.Bright,
        peakBrightness: VfdBrightness.Bright,
      });
    }
  }
  if (rightTrackColumns > 0) {
    pixelBars.push({
      startColumn: rightStart,
      endColumn: rightEnd,
      fillColumns: rightFill,
      anchor: VfdBarAnchor.Left,
      trailBrightness: VfdBrightness.Dim,
      peakBrightness: VfdBrightness.Bright,
    });
    if (rightHoldCols > rightFill) {
      const holdColumn = rightStart + (rightHoldCols - 1);
      pixelBars.push({
        startColumn: holdColumn,
        endColumn: holdColumn,
        fillColumns: 1,
        anchor: VfdBarAnchor.Left,
        trailBrightness: VfdBrightness.Bright,
        peakBrightness: VfdBrightness.Bright,
      });
    }
  }

  return [
    {
      content: "",
      cells: analyzerCells,
      align: VfdSectionAlign.Left,
      brightness: VfdBrightness.Bright,
      key: "stereo-vu",
      marquee: false,
      pixelBars,
    },
  ];
}

/**
 * Builds the per-channel frequency-band sections for the multi-band analyzer
 * mode. Accepts `ArrayLike<number>` so it can read the live store's
 * `Float32Array` band buffers directly — no per-frame array copy.
 *
 * @param left - Left-channel band levels (0..1).
 * @param right - Right-channel band levels (0..1).
 * @param displayCells - Total glyph cells available in the VFD row.
 * @param timeText - Playtime text, reserved on the right.
 * @returns The compacted left/filler/gap/filler/right section list.
 */
function renderStereoBandSections(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  displayCells: number,
  timeText: string,
): VfdDisplaySection[] {
  const channelCells = stereoChannelBandCells(displayCells, timeText);
  const timeCells = Math.max(1, Array.from(timeText).length);
  const analyzerCells = Math.max(0, displayCells - PLAYER_TIME_SPACER_CELLS - timeCells);
  const gapCells = Math.min(PLAYER_STEREO_CHANNEL_GAP_CELLS, Math.max(0, analyzerCells - channelCells * 2));
  const fillerCells = Math.max(0, analyzerCells - channelCells * 2 - gapCells);
  const leftFillerCells = Math.floor(fillerCells / 2);
  const rightFillerCells = fillerCells - leftFillerCells;

  return compactSections([
    channelCells > 0
      ? sectionFor(renderBandContent(left, channelCells), VfdBrightness.Bright, channelCells, "spectrum-left")
      : null,
    leftFillerCells > 0
      ? sectionFor(" ".repeat(leftFillerCells), VfdBrightness.Ghost, leftFillerCells, "spectrum-left-fill")
      : null,
    gapCells > 0 ? sectionFor(" ".repeat(gapCells), VfdBrightness.Ghost, gapCells, "spectrum-gap") : null,
    rightFillerCells > 0
      ? sectionFor(" ".repeat(rightFillerCells), VfdBrightness.Ghost, rightFillerCells, "spectrum-right-fill")
      : null,
    channelCells > 0
      ? sectionFor(renderBandContent(right, channelCells), VfdBrightness.Bright, channelCells, "spectrum-right")
      : null,
  ]);
}

function renderSpectrumSections(
  bands: PlayerSpectrumBands,
  displayCells = PLAYER_DEFAULT_VFD_CELLS,
  timeText = "",
  cells = PLAYER_SPECTRUM_CELLS,
): VfdDisplaySection[] {
  if (isStereoSpectrumBands(bands)) {
    return renderStereoBandSections(bands.left, bands.right, displayCells, timeText);
  }

  const content = renderBandContent(bands, cells);

  return compactSections([sectionFor(content, VfdBrightness.Bright)]);
}

/**
 * Stable, low-frequency inputs to {@link buildPlayerLines}. Everything here
 * changes on a real React render (resize, playtime, mode, phase) — never at
 * the 20 Hz spectrum cadence, which arrives through the store instead.
 */
export interface PlayerLineParams {
  /** True when this player renders the analyzer (no custom `children`). */
  hasAnalyzer: boolean;
  /** Custom progress content rendered instead of the analyzer. */
  childrenContent: ReactNode;
  /** Active analyzer display mode. */
  analyzerMode: AnalyzerMode;
  /** Glyph cells available in the VFD row. */
  displayCells: number;
  /** Playtime text pinned to the right. */
  timeText: string;
  /** Whether the player is disabled (dims the whole row). */
  isDisabled: boolean;
  /** Whether playback is active (brightens the playtime). */
  isPlaying: boolean;
}

/**
 * Builds the complete VFD line model for the player progress row from stable
 * params plus the live spectrum frame (plan MC-029 Task 5.1). Pure — the same
 * call backs both render paths: the React `lines` prop (low-frequency
 * changes) and the imperative store-subscription repaint (20 Hz spectrum). It
 * renders the idle empty-analyzer state when no frame is active.
 *
 * @param params - Low-frequency layout inputs.
 * @param frame - Live spectrum buffers (read, never retained).
 * @param spectrumActive - Whether a published frame is current; when false the
 *   multi-band analyzer renders its idle empty state instead of zeroed stereo
 *   bands.
 * @returns A single-line model ready for {@link VfdDisplay}.
 */
export function buildPlayerLines(
  params: PlayerLineParams,
  frame: SpectrumFrame,
  spectrumActive: boolean,
): VfdDisplayLine[] {
  const { hasAnalyzer, childrenContent, analyzerMode, displayCells, timeText, isDisabled, isPlaying } = params;
  const isStereoVuMode = hasAnalyzer && analyzerMode === AnalyzerMode.StereoVu;

  let progressSections: VfdDisplaySection[];
  let isStereoAnalyzer = false;
  if (!hasAnalyzer) {
    progressSections = [
      {
        content: childrenContent,
        cells: VfdSectionCells.Fill,
        align: VfdSectionAlign.Left,
        brightness: isDisabled ? VfdBrightness.Dim : VfdBrightness.Bright,
      },
    ];
  } else {
    let analyzerSections: VfdDisplaySection[];
    if (isStereoVuMode) {
      analyzerSections = renderStereoVuSections(
        { left: frame.levels[0], right: frame.levels[1] },
        { left: frame.peakHold[0], right: frame.peakHold[1] },
        displayCells,
        timeText,
      );
    } else if (spectrumActive) {
      analyzerSections = renderStereoBandSections(frame.leftBands, frame.rightBands, displayCells, timeText);
      isStereoAnalyzer = true;
    } else {
      analyzerSections = renderSpectrumSections([], displayCells, timeText);
    }
    progressSections = analyzerSections.map((section) => ({
      ...section,
      marquee: false,
      brightness: isDisabled ? VfdBrightness.Dim : section.brightness,
    }));
  }

  return [
    {
      brightness: isDisabled ? VfdBrightness.Dim : VfdBrightness.Normal,
      transition: VfdContentTransition.None,
      sections: [
        // VfdDisplay is a dumb hardware renderer. The Player owns this layout
        // contract: analyzer cells keep their own brightness, mono progress
        // gets a blank fill section, stereo analyzer channels split the fill
        // area evenly, and playtime stays the trailing auto-sized right section.
        ...progressSections,
        ...(isStereoAnalyzer || isStereoVuMode
          ? []
          : [
              {
                content: "",
                cells: VfdSectionCells.Fill,
                align: VfdSectionAlign.Left,
                brightness: VfdBrightness.Ghost,
                marquee: false,
                key: "progress-fill",
              } satisfies VfdDisplaySection,
            ]),
        {
          content: "  ",
          cells: 2,
          align: VfdSectionAlign.Left,
          brightness: VfdBrightness.Dim,
          marquee: false,
        },
        {
          content: timeText,
          cells: VfdSectionCells.Auto,
          align: VfdSectionAlign.Right,
          marquee: false,
          brightness: isPlaying && !isDisabled ? VfdBrightness.Bright : VfdBrightness.Dim,
        },
      ],
    },
  ];
}
