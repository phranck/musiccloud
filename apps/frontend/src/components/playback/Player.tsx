import { createContext, type ReactNode, use, useLayoutEffect, useRef } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { VFD_GLYPHS, VfdDisplay, type VfdDisplaySection } from "@/components/ui/VfdDisplay";
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

const PLAYER_PROGRESS_CELLS = 30;
const PLAYER_SPECTRUM_LEVEL_GLYPHS = [
  VFD_GLYPHS.spectrumLevel0,
  VFD_GLYPHS.spectrumLevel1,
  VFD_GLYPHS.spectrumLevel2,
  VFD_GLYPHS.spectrumLevel3,
  VFD_GLYPHS.spectrumLevel4,
  VFD_GLYPHS.spectrumLevel5,
  VFD_GLYPHS.spectrumLevel6,
  VFD_GLYPHS.spectrumLevel7,
] as const;

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

function spectrumGlyphForLevel(level: number): string {
  const safeLevel = Math.max(0, Math.min(PLAYER_SPECTRUM_LEVEL_GLYPHS.length - 1, level));
  return PLAYER_SPECTRUM_LEVEL_GLYPHS[safeLevel] ?? VFD_GLYPHS.spectrumLevel0;
}

function renderSpectrumSections(bands: readonly number[], cells = PLAYER_PROGRESS_CELLS): VfdDisplaySection[] {
  const safeCells = Math.max(1, cells);
  const content = Array.from({ length: safeCells }, (_, index) => {
    const sourceIndex = Math.min(bands.length - 1, Math.floor((index / safeCells) * bands.length));
    const level = Math.round((bands[sourceIndex] ?? 0) * (PLAYER_SPECTRUM_LEVEL_GLYPHS.length - 1));
    return spectrumGlyphForLevel(level);
  }).join("");

  return compactSections([sectionFor(content, "bright")]);
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
  cells = PLAYER_PROGRESS_CELLS,
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
  cells = PLAYER_PROGRESS_CELLS,
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
  const accentColor = isDisabled ? "rgba(255,255,255,0.2)" : "#7aebff";

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
  const renderedProgressSections =
    progressVariant === "marker" && isPlaying && spectrumBands && spectrumBands.length > 0
      ? renderSpectrumSections(spectrumBands)
      : renderProgressSections(progressVariant, progressGranularity, progress);
  const progressSections = children
    ? [
        {
          content: children,
          cells: "fill",
          align: "left",
          brightness: isDisabled ? "dim" : "bright",
        } satisfies VfdDisplaySection,
      ]
    : renderedProgressSections.map((section) => ({
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
