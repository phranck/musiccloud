import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getSpectrumFrame,
  isSpectrumActive,
  type SpectrumFrame,
  subscribeSpectrum,
} from "@/components/audio/spectrumStore";
import { recessedControlInsetClassName, recessedControlSizeClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { AnalyzerMode, toggleAnalyzerMode, useAnalyzerMode } from "@/components/playback/analyzerMode";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import {
  VfdBarAnchor,
  VfdBrightness,
  VfdContentTransition,
  VfdDisplay,
  type VfdDisplayHandle,
  type VfdDisplayLine,
  type VfdDisplaySection,
  type VfdPixelBarSegment,
  type VfdProgress,
  VfdSectionAlign,
  VfdSectionCells,
  VfdSizingMode,
} from "@/components/ui/VfdDisplay";
import { VfdGlyph } from "@/components/ui/VfdGlyphs";
import { useT } from "@/i18n/localeContext";
import { cn } from "@/lib/utils";

interface PlayerStereoLevels {
  left: number;
  right: number;
}

interface PlayerStereoPeakHold {
  left: number;
  right: number;
}

interface PlayerContextValue {
  isPlaying: boolean;
  isDisabled: boolean;
  timeText: string;
  progressRatio?: number;
  ariaLabel: string;
  title?: string;
  phosphorColor?: string;
  onTogglePlay: () => void;
}

interface StereoSpectrumBands {
  left: readonly number[];
  right: readonly number[];
}

type PlayerSpectrumBands = readonly number[] | StereoSpectrumBands;

interface PlayerProps extends PlayerContextValue {
  children?: ReactNode;
  className?: string;
}

interface PlayerButtonProps {
  className?: string;
}

interface PlayerProgressProps {
  className?: string;
  children?: ReactNode;
  /**
   * Optional control rendered as a sibling directly BELOW the analyzer display
   * (the CC format selector). When set, the progress block becomes a column so
   * the control stacks under the VFD instead of nesting inside the analyzer
   * button — a click on it must never toggle the analyzer mode.
   */
  belowDisplay?: ReactNode;
}

interface PlayerTimeProps {
  className?: string;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const PLAYER_DEFAULT_VFD_CELLS = 44;
// Matches VfdDisplay's fixed 5-column glyph plus 1-column spacing at 1px dot/1px gap.
const PLAYER_VFD_CELL_PITCH_PX = 12;
const PLAYER_VFD_FIRST_CELL_WIDTH_PX = 9;
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

function usePlayerContext(): PlayerContextValue {
  const ctx = use(PlayerContext);
  if (!ctx) throw new Error("Player compound components must be rendered inside <Player>.");
  return ctx;
}

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

function playerVfdCellCountForContentWidth(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  if (availableWidth <= PLAYER_VFD_FIRST_CELL_WIDTH_PX) return 1;
  return Math.max(
    1,
    Math.floor((Math.floor(availableWidth) - PLAYER_VFD_FIRST_CELL_WIDTH_PX) / PLAYER_VFD_CELL_PITCH_PX) + 1,
  );
}

function elementContentWidth(element: HTMLElement): number {
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
interface PlayerLineParams {
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
function buildPlayerLines(params: PlayerLineParams, frame: SpectrumFrame, spectrumActive: boolean): VfdDisplayLine[] {
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

export function PlayerRoot({
  children,
  className,
  isPlaying,
  isDisabled,
  timeText,
  progressRatio = 0,
  ariaLabel,
  title,
  phosphorColor,
  onTogglePlay,
}: PlayerProps) {
  const value: PlayerContextValue = {
    isPlaying,
    isDisabled,
    timeText,
    progressRatio,
    ariaLabel,
    title,
    phosphorColor,
    onTogglePlay,
  };

  return (
    <PlayerContext.Provider value={value}>
      <section className={cn("flex items-center gap-3", className)} aria-label={ariaLabel}>
        {children ?? (
          <>
            <PlayerButton />
            <PlayerProgress />
          </>
        )}
      </section>
    </PlayerContext.Provider>
  );
}

export function PlayerButton({ className }: PlayerButtonProps) {
  const { isPlaying, isDisabled, onTogglePlay, ariaLabel, title } = usePlayerContext();
  const accentColor = isDisabled ? "var(--color-player-control-disabled)" : "#ffffff";

  return (
    <RecessedCard className={cn("flex-none", recessedControlSizeClassName, recessedControlInsetClassName, className)}>
      <RecessedCard.Body className="h-full">
        <EmbossedButton
          as="button"
          type="button"
          onClick={onTogglePlay}
          disabled={isDisabled}
          aria-label={ariaLabel}
          aria-pressed={isPlaying}
          title={title}
          pressed={isPlaying && !isDisabled}
          className="relative flex size-full items-center justify-center px-0 py-0"
        >
          <svg
            className={cn("block", isPlaying ? "size-6" : "size-7 -translate-x-px -translate-y-[0.5px]")}
            viewBox="0 0 24 24"
            fill={accentColor}
            aria-hidden="true"
          >
            {isPlaying ? (
              <>
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </>
            ) : (
              <path d="M8 5.14v14l11-7-11-7z" />
            )}
          </svg>
        </EmbossedButton>
      </RecessedCard.Body>
    </RecessedCard>
  );
}

export function PlayerProgress({ className, children, belowDisplay }: PlayerProgressProps) {
  const { isDisabled, isPlaying, timeText, progressRatio, phosphorColor, title } = usePlayerContext();
  const t = useT();
  const analyzerMode = useAnalyzerMode();
  const progressRef = useRef<HTMLElement | null>(null);
  const vfdControllerRef = useRef<VfdDisplayHandle | null>(null);
  const [displayCells, setDisplayCells] = useState(PLAYER_DEFAULT_VFD_CELLS);
  const hasAnalyzer = !children;
  const isStereoVuMode = hasAnalyzer && analyzerMode === AnalyzerMode.StereoVu;

  // Memoised on the STRUCTURAL inputs only — not on the spectrum and not on
  // the 60 Hz progressRatio. So a playback-position re-render reuses the same
  // params and line objects, VfdDisplay's memo/effect stay cached, and the
  // analyzer is never recomputed off the progress loop. The live 20 Hz
  // spectrum reaches the canvas through the store subscription below, never
  // through a React commit (the dominant 50 ms-cadence churn before Task 5.1).
  const lineParams: PlayerLineParams = useMemo(
    () => ({ hasAnalyzer, childrenContent: children, analyzerMode, displayCells, timeText, isDisabled, isPlaying }),
    [hasAnalyzer, children, analyzerMode, displayCells, timeText, isDisabled, isPlaying],
  );
  // Latest-value mirror so the off-React store subscription rebuilds the
  // analyzer with the current params without re-subscribing every frame.
  const lineParamsRef = useRef(lineParams);
  useLayoutEffect(() => {
    lineParamsRef.current = lineParams;
  }, [lineParams]);

  // The React `lines` prop seeds VfdDisplay's initial frame and updates on
  // structural changes; the spectrum value captured here is just the current
  // snapshot, kept live afterwards by the imperative subscription.
  const lines = useMemo(() => buildPlayerLines(lineParams, getSpectrumFrame(), isSpectrumActive()), [lineParams]);

  useEffect(() => {
    if (!hasAnalyzer) return;
    return subscribeSpectrum(() => {
      vfdControllerRef.current?.setLines(
        buildPlayerLines(lineParamsRef.current, getSpectrumFrame(), isSpectrumActive()),
      );
    });
  }, [hasAnalyzer]);

  const safeProgressRatio = Math.max(0, Math.min(1, progressRatio ?? 0));
  const rowWidthPx = PLAYER_VFD_FIRST_CELL_WIDTH_PX + Math.max(0, displayCells - 1) * PLAYER_VFD_CELL_PITCH_PX;
  const progressRightPx = (Array.from(timeText).length + 2) * PLAYER_VFD_CELL_PITCH_PX;
  const progressTrackWidthPx = Math.max(0, rowWidthPx - progressRightPx);
  const progressWidthPx = Math.min(
    progressTrackWidthPx,
    Math.floor((progressTrackWidthPx * safeProgressRatio) / 2) * 2,
  );
  // The progress bar is rendered by the VFD display itself (it owns the track +
  // fill geometry). The player hands in only the data: the filled pixel width
  // and the brightness-matched colour. Only the analyzer variant carries a bar;
  // the custom-children variant renders its own progress content instead.
  const progress: VfdProgress | undefined = hasAnalyzer
    ? {
        fillWidthPx: progressWidthPx,
        color: isDisabled ? "var(--mc-vfd-dim-color)" : "var(--mc-vfd-normal-color)",
      }
    : undefined;

  useLayoutEffect(() => {
    const root = progressRef.current;
    const display = root?.querySelector<HTMLElement>(".mc-vfd");
    if (!display || typeof ResizeObserver === "undefined") return;

    const updateDisplayCells = () => {
      const nextDisplayCells = playerVfdCellCountForContentWidth(elementContentWidth(display));
      setDisplayCells((currentDisplayCells) =>
        currentDisplayCells === nextDisplayCells ? currentDisplayCells : nextDisplayCells,
      );
    };

    updateDisplayCells();
    const observer = new ResizeObserver(updateDisplayCells);
    observer.observe(display);
    return () => observer.disconnect();
  }, []);

  const wrapperTitle = title ?? (hasAnalyzer ? t("audio.previewAnalyzerToggleTooltip") : undefined);
  const handleDisplayClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (!hasAnalyzer) return;
      event.preventDefault();
      toggleAnalyzerMode();
    },
    [hasAnalyzer],
  );
  const setProgressRef = useCallback((element: HTMLElement | null) => {
    progressRef.current = element;
  }, []);

  const vfd = (
    <VfdDisplay
      controllerRef={vfdControllerRef}
      sizingMode={VfdSizingMode.Container}
      rows={1}
      phosphorColor={phosphorColor}
      progress={progress}
      ariaLabel={`Playback progress ${timeText}`}
      lines={lines}
    />
  );

  // When a `belowDisplay` control is present, the progress block stacks into a
  // column (display on top, control below) and the ResizeObserver ref + flex-1
  // sizing move to the outer wrapper; the display fills the wrapper width. The
  // control is a sibling of the analyzer button so activating it never reaches
  // the button's analyzer-toggle handler.
  const stacked = !!belowDisplay;

  const display = hasAnalyzer ? (
    <button
      ref={stacked ? undefined : setProgressRef}
      type="button"
      className={cn(
        "cursor-pointer appearance-none border-0 bg-transparent p-0 text-left",
        stacked ? "block w-full" : "flex-1 min-w-0",
        !stacked && className,
      )}
      aria-pressed={isStereoVuMode}
      aria-label={wrapperTitle}
      title={wrapperTitle}
      onClick={handleDisplayClick}
    >
      {vfd}
    </button>
  ) : (
    <div
      ref={stacked ? undefined : setProgressRef}
      className={cn(stacked ? "w-full" : "flex-1 min-w-0", !stacked && className)}
      title={stacked ? undefined : wrapperTitle}
    >
      {vfd}
    </div>
  );

  if (!stacked) return display;

  return (
    <div ref={setProgressRef} className={cn("flex min-w-0 flex-1 flex-col gap-2", className)} title={wrapperTitle}>
      {display}
      {belowDisplay}
    </div>
  );
}

export function PlayerTime({ className }: PlayerTimeProps) {
  const { timeText } = usePlayerContext();
  return <span className={className}>{timeText}</span>;
}
