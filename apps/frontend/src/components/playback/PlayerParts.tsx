import { createContext, type ReactNode, use, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSpectrumFrame, isSpectrumActive } from "@/components/audio/spectrumStore";
import { recessedControlInsetClassName, recessedControlSizeClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { AnalyzerMode } from "@/components/playback/analyzerMode";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { VfdAnalyzerDisplay } from "@/components/ui/VfdAnalyzerDisplay";
import { VfdDisplay, type VfdDisplayHandle, VfdSizingMode } from "@/components/ui/VfdDisplay";
import {
  buildPlayerLines,
  elementContentWidth,
  PLAYER_DEFAULT_VFD_CELLS,
  type PlayerLineParams,
  playerVfdCellCountForContentWidth,
} from "@/components/ui/vfdAnalyzerLines";
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

  // The analyzer variant (no custom children) is its own specialised display:
  // it owns the controller ref, the 20 Hz spectrum subscription, the resize
  // observer, the progress geometry and the mode toggle. PlayerProgress only
  // forwards the player's display values.
  if (!children) {
    return (
      <VfdAnalyzerDisplay
        isPlaying={isPlaying}
        isDisabled={isDisabled}
        timeText={timeText}
        progressRatio={progressRatio ?? 0}
        phosphorColor={phosphorColor}
        ariaLabel={`Playback progress ${timeText}`}
        className={className}
      />
    );
  }

  return (
    <PlayerCustomProgress className={className} title={title}>
      {children}
    </PlayerCustomProgress>
  );
}

interface PlayerCustomProgressProps {
  className?: string;
  title?: string;
  children: ReactNode;
}

/**
 * Custom-content progress row for the player.
 *
 * Renders caller-supplied `children` as the progress content inside a
 * single-row {@link VfdDisplay}, sized to the available width through a resize
 * observer. Unlike {@link VfdAnalyzerDisplay} it carries no spectrum, no
 * progress bar and no mode toggle — it is the non-analyzer branch of
 * {@link PlayerProgress}.
 */
function PlayerCustomProgress({ className, title, children }: PlayerCustomProgressProps) {
  const { isDisabled, isPlaying, timeText } = usePlayerContext();
  const progressRef = useRef<HTMLElement | null>(null);
  const vfdControllerRef = useRef<VfdDisplayHandle | null>(null);
  const [displayCells, setDisplayCells] = useState(PLAYER_DEFAULT_VFD_CELLS);

  const lineParams: PlayerLineParams = useMemo(
    () => ({
      hasAnalyzer: false,
      childrenContent: children,
      analyzerMode: AnalyzerMode.MultiBand,
      displayCells,
      timeText,
      isDisabled,
      isPlaying,
    }),
    [children, displayCells, timeText, isDisabled, isPlaying],
  );

  const lines = useMemo(() => buildPlayerLines(lineParams, getSpectrumFrame(), isSpectrumActive()), [lineParams]);

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

  const setProgressRef = useCallback((element: HTMLElement | null) => {
    progressRef.current = element;
  }, []);

  return (
    <div ref={setProgressRef} className={cn("flex-1 min-w-0", className)} title={title}>
      <VfdDisplay
        controllerRef={vfdControllerRef}
        sizingMode={VfdSizingMode.Container}
        rows={1}
        ariaLabel={`Playback progress ${timeText}`}
        lines={lines}
      />
    </div>
  );
}

export function PlayerTime({ className }: PlayerTimeProps) {
  const { timeText } = usePlayerContext();
  return <span className={className}>{timeText}</span>;
}
