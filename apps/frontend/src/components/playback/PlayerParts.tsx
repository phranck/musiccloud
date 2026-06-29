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
import { getSpectrumFrame, isSpectrumActive, subscribeSpectrum } from "@/components/audio/spectrumStore";
import { recessedControlInsetClassName, recessedControlSizeClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { AnalyzerMode, toggleAnalyzerMode, useAnalyzerMode } from "@/components/playback/analyzerMode";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
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
import { useT } from "@/i18n/localeContext";
import { cn } from "@/lib/utils";

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
}

interface PlayerTimeProps {
  className?: string;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function usePlayerContext(): PlayerContextValue {
  const ctx = use(PlayerContext);
  if (!ctx) throw new Error("Player compound components must be rendered inside <Player>.");
  return ctx;
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

export function PlayerProgress({ className, children }: PlayerProgressProps) {
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

  if (hasAnalyzer) {
    return (
      <button
        ref={setProgressRef}
        type="button"
        className={cn("flex-1 min-w-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left", className)}
        aria-pressed={isStereoVuMode}
        aria-label={wrapperTitle}
        title={wrapperTitle}
        onClick={handleDisplayClick}
      >
        {vfd}
      </button>
    );
  }

  return (
    <div ref={setProgressRef} className={cn("flex-1 min-w-0", className)} title={wrapperTitle}>
      {vfd}
    </div>
  );
}

export function PlayerTime({ className }: PlayerTimeProps) {
  const { timeText } = usePlayerContext();
  return <span className={className}>{timeText}</span>;
}
