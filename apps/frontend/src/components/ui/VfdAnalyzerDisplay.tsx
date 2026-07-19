import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSpectrumFrame, isSpectrumActive, subscribeSpectrum } from "@/components/audio/spectrumStore";
import { AnalyzerMode, toggleAnalyzerMode, useAnalyzerMode } from "@/components/playback/analyzerMode";
import { VfdDisplay, type VfdDisplayHandle, type VfdProgress, VfdSizingMode } from "@/components/ui/VfdDisplay";
import {
  buildPlayerLines,
  elementContentWidth,
  PLAYER_DEFAULT_VFD_CELLS,
  PLAYER_VFD_CELL_PITCH_PX,
  PLAYER_VFD_FIRST_CELL_WIDTH_PX,
  type PlayerLineParams,
  playerVfdCellCountForContentWidth,
} from "@/components/ui/vfdAnalyzerLines";
import { audioCopy } from "@/copy/audio";
import { cn } from "@/lib/utils";

/**
 * Display values the analyzer needs to render. Supplied as plain props (rather
 * than pulled from a context) so the component is testable in isolation and can
 * be re-hosted under a different player context without changing its surface.
 */
interface VfdAnalyzerDisplayProps {
  /** Whether playback is active — brightens the trailing playtime. */
  isPlaying: boolean;
  /** Whether the owning player is disabled — dims the whole row. */
  isDisabled: boolean;
  /** Playtime text pinned to the right of the row. */
  timeText: string;
  /** Playback position as a 0..1 ratio; drives the progress-bar fill width. */
  progressRatio: number;
  /** Optional phosphor colour override for the VFD glyphs and progress fill. */
  phosphorColor?: string;
  /** Accessible label forwarded to the inner {@link VfdDisplay} element. */
  ariaLabel?: string;
  /** Optional extra class names for the clickable wrapper. */
  className?: string;
}

/**
 * Analyzer/progress VFD for the audio player.
 *
 * Composes the generic {@link VfdDisplay} into the player's analyzer row: a
 * single-row spectrum/VU visualisation with a trailing playtime and an inline
 * progress bar. Clicking the row toggles between the multi-band and stereo-VU
 * analyzer modes (`aria-pressed` reflects the stereo-VU mode).
 *
 * Performance contract: the live 20 Hz spectrum never flows through React
 * state. Structural inputs (resize, playtime, mode, phase) are memoised into
 * {@link PlayerLineParams} and produce the React `lines` prop, which seeds the
 * initial frame and handles low-frequency changes. The high-frequency spectrum
 * reaches the canvas through the store subscription below, which rebuilds the
 * same pure line model with {@link buildPlayerLines} and pushes it straight
 * onto the display via {@link VfdDisplayHandle.setLines} — one imperative
 * repaint per frame, zero React commits.
 */
export function VfdAnalyzerDisplay({
  isPlaying,
  isDisabled,
  timeText,
  progressRatio,
  phosphorColor,
  ariaLabel,
  className,
}: VfdAnalyzerDisplayProps) {
  const analyzerMode = useAnalyzerMode();
  const wrapperRef = useRef<HTMLButtonElement | null>(null);
  const vfdControllerRef = useRef<VfdDisplayHandle | null>(null);
  const [displayCells, setDisplayCells] = useState(PLAYER_DEFAULT_VFD_CELLS);

  // Memoised on the STRUCTURAL inputs only — not on the spectrum and not on
  // `progressRatio`. So a playback-position re-render reuses the same params and
  // line objects, VfdDisplay's memo/effect stay cached, and the analyzer is never
  // recomputed off the progress loop. `progressRatio` still arrives on the shared
  // ticker, but the engine quantizes it (see AudioPlayer's setProgressRatioValue /
  // quantizeProgressRatio) so this re-renders on a visible progress step, not per
  // frame. The live 20 Hz spectrum reaches the canvas through the store
  // subscription below, never through a React commit. `hasAnalyzer` is always true
  // here (the analyzer row); the custom-children variant lives in PlayerProgress.
  const lineParams: PlayerLineParams = useMemo(
    () => ({
      hasAnalyzer: true,
      childrenContent: undefined,
      analyzerMode,
      displayCells,
      timeText,
      isDisabled,
      isPlaying,
    }),
    [analyzerMode, displayCells, timeText, isDisabled, isPlaying],
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
    return subscribeSpectrum(() => {
      vfdControllerRef.current?.setLines(
        buildPlayerLines(lineParamsRef.current, getSpectrumFrame(), isSpectrumActive()),
      );
    });
  }, []);

  const safeProgressRatio = Math.max(0, Math.min(1, progressRatio));
  const rowWidthPx = PLAYER_VFD_FIRST_CELL_WIDTH_PX + Math.max(0, displayCells - 1) * PLAYER_VFD_CELL_PITCH_PX;
  const progressRightPx = (Array.from(timeText).length + 2) * PLAYER_VFD_CELL_PITCH_PX;
  const progressTrackWidthPx = Math.max(0, rowWidthPx - progressRightPx);
  const progressWidthPx = Math.min(
    progressTrackWidthPx,
    Math.floor((progressTrackWidthPx * safeProgressRatio) / 2) * 2,
  );
  // The progress bar is rendered by the VFD display itself (it owns the track +
  // fill geometry). The analyzer hands in only the data: the filled pixel width
  // and the brightness-matched colour.
  const progress: VfdProgress = {
    fillWidthPx: progressWidthPx,
    color: isDisabled ? "var(--mc-vfd-dim-color)" : "var(--mc-vfd-normal-color)",
  };

  useLayoutEffect(() => {
    const root = wrapperRef.current;
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

  const wrapperTitle = audioCopy.previewAnalyzerToggleTooltip;
  const handleDisplayClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    toggleAnalyzerMode();
  }, []);

  return (
    <button
      ref={wrapperRef}
      type="button"
      className={cn("flex-1 min-w-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left", className)}
      aria-pressed={analyzerMode === AnalyzerMode.StereoVu}
      aria-label={wrapperTitle}
      title={wrapperTitle}
      onClick={handleDisplayClick}
    >
      <VfdDisplay
        controllerRef={vfdControllerRef}
        sizingMode={VfdSizingMode.Container}
        rows={1}
        phosphorColor={phosphorColor}
        progress={progress}
        ariaLabel={ariaLabel}
        lines={lines}
      />
    </button>
  );
}
