import { type CSSProperties, createContext, memo, type ReactNode, use, useLayoutEffect, useRef } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { scaledVfdCellCount, VFD_GLYPHS, VfdDisplay, type VfdDisplaySection } from "@/components/ui/VfdDisplay";
import { cn } from "@/lib/utils";

export type PlayerProgressVariant = "marker" | "segments";
export type PlayerProgressGranularity = "blocks" | "pixels";

interface PlayerContextValue {
  isPlaying: boolean;
  isDisabled: boolean;
  currentTime: number;
  duration: number;
  timeText: string;
  ariaLabel: string;
  title?: string;
  progressVariant: PlayerProgressVariant;
  progressGranularity: PlayerProgressGranularity;
  spectrumBands?: readonly number[] | null;
  phosphorColor: string;
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

interface PlayerProgressTrackProps {
  className?: string;
  children?: ReactNode;
}

interface PlayerProgressFillProps {
  className?: string;
}

interface PlayerTimeProps {
  className?: string;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const PLAYER_PROGRESS_CELLS = scaledVfdCellCount(30);
const PLAYER_PROGRESS_DOT_RADIUS = 1;
const PLAYER_PROGRESS_DOT_PITCH = 3;
const PLAYER_PROGRESS_SEGMENT_COLUMNS = 5;
const PLAYER_PROGRESS_SEGMENT_ROWS = 7;
const PLAYER_PROGRESS_SEGMENT_GAP = 2;
const PLAYER_PROGRESS_SEGMENT_WIDTH = PLAYER_PROGRESS_SEGMENT_COLUMNS * PLAYER_PROGRESS_DOT_PITCH;
const PLAYER_PROGRESS_SEGMENT_HEIGHT = PLAYER_PROGRESS_SEGMENT_ROWS * PLAYER_PROGRESS_DOT_PITCH;
const PLAYER_PROGRESS_SEGMENT_PITCH = PLAYER_PROGRESS_SEGMENT_WIDTH + PLAYER_PROGRESS_SEGMENT_GAP;
const PLAYER_PROGRESS_MARKER_COLUMNS = 2;
const PLAYER_PROGRESS_MARKER_WIDTH =
  (PLAYER_PROGRESS_MARKER_COLUMNS - 1) * PLAYER_PROGRESS_DOT_PITCH + PLAYER_PROGRESS_DOT_RADIUS * 2;
const PLAYER_PROGRESS_WIDTH =
  PLAYER_PROGRESS_CELLS * PLAYER_PROGRESS_SEGMENT_WIDTH + (PLAYER_PROGRESS_CELLS - 1) * PLAYER_PROGRESS_SEGMENT_GAP;
const PLAYER_PROGRESS_MARKER_MAX_X = PLAYER_PROGRESS_WIDTH - PLAYER_PROGRESS_MARKER_WIDTH;

const PLAYER_SPECTRUM_DOTS = Array.from({ length: PLAYER_PROGRESS_CELLS }).flatMap((_, cell) =>
  Array.from({ length: PLAYER_PROGRESS_SEGMENT_ROWS }).flatMap((_, row) =>
    Array.from({ length: PLAYER_PROGRESS_SEGMENT_COLUMNS }, (_, column) => ({
      key: `spectrum-${cell}-${row}-${column}`,
      band: cell,
      row,
      cx: cell * PLAYER_PROGRESS_SEGMENT_PITCH + column * PLAYER_PROGRESS_DOT_PITCH + PLAYER_PROGRESS_DOT_RADIUS,
      cy: row * PLAYER_PROGRESS_DOT_PITCH + PLAYER_PROGRESS_DOT_RADIUS,
    })),
  ),
);

const PLAYER_PROGRESS_RAIL_DOTS = Array.from({ length: PLAYER_PROGRESS_CELLS }).flatMap((_, cell) =>
  [5, 6].flatMap((row) =>
    Array.from({ length: PLAYER_PROGRESS_SEGMENT_COLUMNS }, (_, column) => ({
      key: `rail-${cell}-${row}-${column}`,
      cx: cell * PLAYER_PROGRESS_SEGMENT_PITCH + column * PLAYER_PROGRESS_DOT_PITCH + PLAYER_PROGRESS_DOT_RADIUS,
      cy: row * PLAYER_PROGRESS_DOT_PITCH + PLAYER_PROGRESS_DOT_RADIUS,
    })),
  ),
);

const PLAYER_PROGRESS_MARKER_DOTS = Array.from({ length: PLAYER_PROGRESS_SEGMENT_ROWS }).flatMap((_, row) =>
  Array.from({ length: PLAYER_PROGRESS_MARKER_COLUMNS }, (_, column) => ({
    key: `marker-${row}-${column}`,
    cx: column * PLAYER_PROGRESS_DOT_PITCH + PLAYER_PROGRESS_DOT_RADIUS,
    cy: row * PLAYER_PROGRESS_DOT_PITCH + PLAYER_PROGRESS_DOT_RADIUS,
  })),
);

const PlayerProgressRailDots = memo(function PlayerProgressRailDots({ className }: { className: string }) {
  return (
    <g className={className}>
      {PLAYER_PROGRESS_RAIL_DOTS.map((dot) => (
        <circle key={dot.key} className="mc-vfd-symbol-pixel" cx={dot.cx} cy={dot.cy} r={PLAYER_PROGRESS_DOT_RADIUS} />
      ))}
    </g>
  );
});

const PlayerProgressMarkerDots = memo(function PlayerProgressMarkerDots() {
  return (
    <g className="mc-player-progress-marker-g">
      {PLAYER_PROGRESS_MARKER_DOTS.map((dot) => (
        <circle key={dot.key} className="mc-vfd-symbol-pixel" cx={dot.cx} cy={dot.cy} r={PLAYER_PROGRESS_DOT_RADIUS} />
      ))}
    </g>
  );
});

function PlayerSpectrumMeter({ bands }: { bands: readonly number[] }) {
  const bandLevels = Array.from({ length: PLAYER_PROGRESS_CELLS }, (_, index) => {
    const sourceIndex = Math.min(bands.length - 1, Math.floor((index / PLAYER_PROGRESS_CELLS) * bands.length));
    return Math.max(
      0,
      Math.min(PLAYER_PROGRESS_SEGMENT_ROWS, Math.round((bands[sourceIndex] ?? 0) * PLAYER_PROGRESS_SEGMENT_ROWS)),
    );
  });

  return (
    <span className="mc-player-progress-meter" aria-hidden="true">
      <svg
        className="mc-player-progress-svg"
        viewBox={`0 0 ${PLAYER_PROGRESS_WIDTH} ${PLAYER_PROGRESS_SEGMENT_HEIGHT}`}
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        <g className="mc-player-spectrum-ghost">
          {PLAYER_SPECTRUM_DOTS.map((dot) => (
            <circle
              key={dot.key}
              className="mc-vfd-symbol-pixel"
              cx={dot.cx}
              cy={dot.cy}
              r={PLAYER_PROGRESS_DOT_RADIUS}
            />
          ))}
        </g>
        <g className="mc-player-spectrum-active">
          {PLAYER_SPECTRUM_DOTS.flatMap((dot) => {
            const level = bandLevels[dot.band] ?? 0;
            if (PLAYER_PROGRESS_SEGMENT_ROWS - dot.row > level) return [];
            return [
              <circle
                key={dot.key}
                className="mc-vfd-symbol-pixel"
                cx={dot.cx}
                cy={dot.cy}
                r={PLAYER_PROGRESS_DOT_RADIUS}
              />,
            ];
          })}
        </g>
      </svg>
    </span>
  );
}

function PlayerProgressMarkerMeter({ progress }: { progress: number }) {
  const safeProgress = Math.min(1, Math.max(0, progress));
  const markerX = (safeProgress * PLAYER_PROGRESS_MARKER_MAX_X) / PLAYER_PROGRESS_WIDTH;
  const style = {
    "--mc-player-progress": safeProgress,
    "--mc-player-progress-percent": `${safeProgress * 100}%`,
    "--mc-player-progress-marker-x": `${markerX * 100}%`,
  } as CSSProperties;

  return (
    <span className="mc-player-progress-meter" style={style} aria-hidden="true">
      <svg
        className="mc-player-progress-svg"
        viewBox={`0 0 ${PLAYER_PROGRESS_WIDTH} ${PLAYER_PROGRESS_SEGMENT_HEIGHT}`}
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        <PlayerProgressRailDots className="mc-player-progress-rail-ghost" />
        <PlayerProgressRailDots className="mc-player-progress-rail-active" />
        <PlayerProgressMarkerDots />
      </svg>
    </span>
  );
}

function usePlayerContext(): PlayerContextValue {
  const ctx = use(PlayerContext);
  if (!ctx) throw new Error("Player compound components must be rendered inside <Player>.");
  return ctx;
}

function clampProgress(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, Math.max(0, currentTime / duration));
}

function sectionFor(content: string, brightness: VfdDisplaySection["brightness"]): VfdDisplaySection | null {
  if (!content) return null;
  return { content, cells: Array.from(content).length, align: "left", brightness };
}

function compactSections(sections: Array<VfdDisplaySection | null>): VfdDisplaySection[] {
  return sections.filter((section): section is VfdDisplaySection => Boolean(section));
}

function partialProgressGlyph(columns: number): string {
  switch (columns) {
    case 1:
      return VFD_GLYPHS.progressBlock1;
    case 2:
      return VFD_GLYPHS.progressBlock2;
    case 3:
      return VFD_GLYPHS.progressBlock3;
    case 4:
      return VFD_GLYPHS.progressBlock4;
    default:
      return "";
  }
}

function markerGlyphsForPixelOffset(offset: number): string[] {
  switch (offset) {
    case 0:
      return [VFD_GLYPHS.progressMarkerStart];
    case 1:
      return [VFD_GLYPHS.progressMarker];
    case 2:
      return [VFD_GLYPHS.progressMarkerRight];
    case 3:
      return [VFD_GLYPHS.progressMarkerEnd2];
    case 4:
      return [VFD_GLYPHS.progressMarkerEnd1, VFD_GLYPHS.progressMarkerNext1];
    default:
      return [VFD_GLYPHS.progressMarker];
  }
}

function renderMarkerProgressSections(
  progressGranularity: PlayerProgressGranularity,
  progress: number,
  cells: number,
): VfdDisplaySection[] {
  if (progressGranularity === "pixels") {
    const markerStart = Math.round(progress * Math.max(0, cells * 5 - 2));
    const trackBefore = Math.floor(markerStart / 5);
    const markerGlyphs = markerGlyphsForPixelOffset(markerStart % 5).join("");
    const trackAfter = cells - trackBefore - Array.from(markerGlyphs).length;
    return compactSections([
      sectionFor(VFD_GLYPHS.progressRailEmpty.repeat(trackBefore), "bright"),
      sectionFor(markerGlyphs, "bright"),
      sectionFor(VFD_GLYPHS.progressRailEmpty.repeat(Math.max(0, trackAfter)), "ghost"),
    ]);
  }

  const markerIndex = Math.round(progress * (cells - 1));
  return compactSections([
    sectionFor(VFD_GLYPHS.progressRailEmpty.repeat(markerIndex), "bright"),
    sectionFor(VFD_GLYPHS.progressMarker, "bright"),
    sectionFor(VFD_GLYPHS.progressRailEmpty.repeat(Math.max(0, cells - markerIndex - 1)), "ghost"),
  ]);
}

function renderProgressSections(
  variant: PlayerProgressVariant,
  progressGranularity: PlayerProgressGranularity,
  progress: number,
  cells = 30,
): VfdDisplaySection[] {
  const safeCells = Math.max(4, cells);

  if (variant === "marker") return renderMarkerProgressSections(progressGranularity, progress, safeCells);

  if (variant === "segments") {
    if (progressGranularity === "pixels") {
      const activeColumns = Math.round(progress * safeCells * 5);
      const fullBlocks = Math.floor(activeColumns / 5);
      const partialColumns = activeColumns % 5;
      const partialBlock = partialProgressGlyph(partialColumns);
      const filled = `${VFD_GLYPHS.progressBlock.repeat(fullBlocks)}${partialBlock}`;
      const empty = safeCells - fullBlocks - (partialBlock ? 1 : 0);
      return compactSections([
        sectionFor(filled, "bright"),
        sectionFor(VFD_GLYPHS.progressEmpty.repeat(Math.max(0, empty)), "dim"),
      ]);
    }

    const active = Math.round(progress * safeCells);
    return compactSections([
      sectionFor(VFD_GLYPHS.progressBlock.repeat(active), "bright"),
      sectionFor(VFD_GLYPHS.progressEmpty.repeat(Math.max(0, safeCells - active)), "dim"),
    ]);
  }

  return [];
}

function renderProgressCells(
  variant: PlayerProgressVariant,
  progressGranularity: PlayerProgressGranularity,
  progress: number,
  cells = 30,
): string {
  return renderProgressSections(variant, progressGranularity, progress, cells)
    .map((section) => (typeof section.content === "string" ? section.content : ""))
    .join("");
}

function PlayerRoot({
  children,
  className,
  isPlaying,
  isDisabled,
  currentTime,
  duration,
  timeText,
  ariaLabel,
  title,
  progressVariant = "segments",
  progressGranularity = "pixels",
  spectrumBands,
  phosphorColor,
  onTogglePlay,
}: PlayerProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const value: PlayerContextValue = {
    isPlaying,
    isDisabled,
    currentTime,
    duration,
    timeText,
    ariaLabel,
    title,
    progressVariant,
    progressGranularity,
    spectrumBands,
    phosphorColor,
    onTogglePlay,
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    const progressCard = root?.querySelector<HTMLElement>("[data-player-progress-card]");
    if (!root || !progressCard) return;

    const syncControlSize = () => {
      const height = progressCard.getBoundingClientRect().height;
      if (height > 0) root.style.setProperty("--mc-player-control-size", `${height}px`);
    };

    syncControlSize();
    const observer = new ResizeObserver(syncControlSize);
    observer.observe(progressCard);
    return () => observer.disconnect();
  }, []);

  return (
    <PlayerContext.Provider value={value}>
      <section ref={rootRef} className={cn("flex items-center gap-3", className)} aria-label={ariaLabel}>
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

function PlayerButton({ className }: PlayerButtonProps) {
  const { isPlaying, isDisabled, onTogglePlay, ariaLabel, title } = usePlayerContext();
  const accentColor = isDisabled ? "rgba(255,255,255,0.2)" : "rgb(var(--color-accent-rgb-resolved, 255 255 255))";

  return (
    <RecessedCard
      className={cn(
        "mc-player-button-recess flex-none h-[calc(var(--mc-player-control-size,3rem)-2px)] w-[calc(var(--mc-player-control-size,3rem)-2px)]",
        className,
      )}
      padding="0.1875rem"
      radius={{ base: "0.625rem", sm: "0.875rem" }}
    >
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
          noScale
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

function PlayerProgress({ className, children }: PlayerProgressProps) {
  const {
    currentTime,
    duration,
    isDisabled,
    isPlaying,
    timeText,
    phosphorColor,
    progressVariant,
    progressGranularity,
    spectrumBands,
  } = usePlayerContext();
  const progress = clampProgress(currentTime, duration);
  const progressSections = children
    ? [
        {
          content: children,
          cells: "fill",
          align: "left",
          brightness: isDisabled ? "dim" : "bright",
        } satisfies VfdDisplaySection,
      ]
    : progressVariant === "marker"
      ? [
          {
            content:
              isPlaying && spectrumBands && spectrumBands.length > 0 ? (
                <PlayerSpectrumMeter bands={spectrumBands} />
              ) : (
                <PlayerProgressMarkerMeter progress={progress} />
              ),
            cells: 30,
            align: "left",
            brightness: isDisabled ? "dim" : "bright",
            key: "player-progress-marker-meter",
            className: "mc-player-progress-section",
          } satisfies VfdDisplaySection,
        ]
      : renderProgressSections(progressVariant, progressGranularity, progress).map((section) => ({
          ...section,
          brightness: isDisabled ? "dim" : section.brightness,
        }));

  return (
    <div className={cn("flex-1 min-w-0", className)} data-player-progress-card="true">
      <VfdDisplay
        rows={1}
        charsPerLine={36}
        phosphorColor={phosphorColor}
        ariaLabel={`Preview progress ${timeText}`}
        lines={[
          {
            brightness: isDisabled ? "dim" : "normal",
            transition: "none",
            sections: [
              ...progressSections,
              { content: "  ", cells: 2, align: "left", brightness: "dim" },
              {
                content: timeText,
                cells: "auto",
                align: "right",
                brightness: isPlaying && !isDisabled ? "bright" : "dim",
              },
            ],
          },
        ]}
      />
    </div>
  );
}

function PlayerProgressTrack({ children, className }: PlayerProgressTrackProps) {
  return <span className={className}>{children ?? <PlayerProgressFill />}</span>;
}

function PlayerProgressFill({ className }: PlayerProgressFillProps) {
  const { currentTime, duration, progressVariant, progressGranularity } = usePlayerContext();
  const progress = clampProgress(currentTime, duration);
  return <span className={className}>{renderProgressCells(progressVariant, progressGranularity, progress)}</span>;
}

function PlayerTime({ className }: PlayerTimeProps) {
  const { timeText } = usePlayerContext();
  return <span className={className}>{timeText}</span>;
}

export const Player = Object.assign(PlayerRoot, {
  Button: PlayerButton,
  Progress: Object.assign(PlayerProgress, {
    Track: PlayerProgressTrack,
    Fill: PlayerProgressFill,
  }),
  Time: PlayerTime,
});
