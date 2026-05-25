import { type CSSProperties, createContext, type ReactNode, use, useLayoutEffect, useRef, useState } from "react";
import { recessedControlInsetClassName, recessedControlSizeClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { VFD_GLYPHS, VfdDisplay, type VfdDisplaySection } from "@/components/ui/VfdDisplay";
import { cn } from "@/lib/utils";

interface PlayerContextValue {
  isPlaying: boolean;
  isDisabled: boolean;
  timeText: string;
  progressRatio?: number;
  ariaLabel: string;
  title?: string;
  spectrumBands?: PlayerSpectrumBands | null;
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
}

interface PlayerTimeProps {
  className?: string;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const PLAYER_DEFAULT_VFD_CELLS = 44;
// Matches VfdDisplay's fixed 5-column glyph plus 1-column spacing at 1px dot/1px gap.
const PLAYER_VFD_CELL_PITCH_PX = 12;
const PLAYER_VFD_FIRST_CELL_WIDTH_PX = 9;
const PLAYER_SPECTRUM_CELLS = 30;
const PLAYER_STEREO_CHANNEL_CELLS = 12;
const PLAYER_STEREO_CHANNEL_GAP_CELLS = 3;
const PLAYER_TIME_SPACER_CELLS = 2;
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

function sectionFor(
  content: string,
  brightness: VfdDisplaySection["brightness"],
  cells: VfdDisplaySection["cells"] = Array.from(content).length,
  key?: string,
): VfdDisplaySection | null {
  if (!content) return null;
  return { content, cells, align: "left", brightness, key };
}

function compactSections(sections: Array<VfdDisplaySection | null>): VfdDisplaySection[] {
  return sections.filter((section): section is VfdDisplaySection => Boolean(section));
}

function spectrumGlyphForLevel(level: number): string {
  const safeLevel = Math.max(0, Math.min(PLAYER_SPECTRUM_LEVEL_GLYPHS.length - 1, level));
  return PLAYER_SPECTRUM_LEVEL_GLYPHS[safeLevel] ?? VFD_GLYPHS.spectrumLevel0;
}

function isStereoSpectrumBands(bands: PlayerSpectrumBands): bands is StereoSpectrumBands {
  if (Array.isArray(bands)) return false;
  const candidate = bands as Partial<StereoSpectrumBands>;
  return Array.isArray(candidate.left) && Array.isArray(candidate.right);
}

function renderBandContent(bands: readonly number[], cells: number): string {
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
  const fixedStereoCells = 2 + PLAYER_STEREO_CHANNEL_GAP_CELLS;
  return Math.min(PLAYER_STEREO_CHANNEL_CELLS, Math.max(0, Math.floor((analyzerCells - fixedStereoCells) / 2)));
}

function renderSpectrumSections(
  bands: PlayerSpectrumBands,
  displayCells = PLAYER_DEFAULT_VFD_CELLS,
  timeText = "",
  cells = PLAYER_SPECTRUM_CELLS,
): VfdDisplaySection[] {
  if (isStereoSpectrumBands(bands)) {
    const channelCells = stereoChannelBandCells(displayCells, timeText);
    const timeCells = Math.max(1, Array.from(timeText).length);
    const analyzerCells = Math.max(0, displayCells - PLAYER_TIME_SPACER_CELLS - timeCells);
    const gapCells = Math.min(PLAYER_STEREO_CHANNEL_GAP_CELLS, Math.max(0, analyzerCells - 2 - channelCells * 2));
    const fillerCells = Math.max(0, analyzerCells - 2 - channelCells * 2 - gapCells);
    const leftFillerCells = Math.floor(fillerCells / 2);
    const rightFillerCells = fillerCells - leftFillerCells;

    return compactSections([
      sectionFor("L", "normal", 1, "spectrum-left-label"),
      channelCells > 0
        ? sectionFor(renderBandContent(bands.left, channelCells), "bright", channelCells, "spectrum-left")
        : null,
      leftFillerCells > 0
        ? sectionFor(" ".repeat(leftFillerCells), "ghost", leftFillerCells, "spectrum-left-fill")
        : null,
      gapCells > 0 ? sectionFor(" ".repeat(gapCells), "ghost", gapCells, "spectrum-gap") : null,
      sectionFor("R", "normal", 1, "spectrum-right-label"),
      channelCells > 0
        ? sectionFor(renderBandContent(bands.right, channelCells), "bright", channelCells, "spectrum-right")
        : null,
      rightFillerCells > 0
        ? sectionFor(" ".repeat(rightFillerCells), "ghost", rightFillerCells, "spectrum-right-fill")
        : null,
    ]);
  }

  const content = renderBandContent(bands, cells);

  return compactSections([sectionFor(content, "bright")]);
}

function PlayerRoot({
  children,
  className,
  isPlaying,
  isDisabled,
  timeText,
  progressRatio = 0,
  ariaLabel,
  title,
  spectrumBands,
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
    spectrumBands,
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

function PlayerButton({ className }: PlayerButtonProps) {
  const { isPlaying, isDisabled, onTogglePlay, ariaLabel, title } = usePlayerContext();
  const accentColor = isDisabled ? "var(--color-player-control-disabled)" : "var(--color-vfd-phosphor)";

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
  const { isDisabled, isPlaying, timeText, progressRatio, phosphorColor, spectrumBands } = usePlayerContext();
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [displayCells, setDisplayCells] = useState(PLAYER_DEFAULT_VFD_CELLS);
  const isStereoAnalyzer =
    !children && spectrumBands !== null && spectrumBands !== undefined && isStereoSpectrumBands(spectrumBands);
  const analyzerSections = renderSpectrumSections(spectrumBands ?? [], displayCells, timeText);
  const safeProgressRatio = Math.max(0, Math.min(1, progressRatio ?? 0));
  const progressStyle = {
    "--mc-player-progress": safeProgressRatio,
    "--mc-player-progress-color": isDisabled ? "var(--mc-vfd-dim-color)" : "var(--mc-vfd-normal-color)",
    "--mc-player-progress-right": `${(Array.from(timeText).length + 2) * PLAYER_VFD_CELL_PITCH_PX}px`,
  } as CSSProperties;
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

  const progressSections = children
    ? [
        {
          content: children,
          cells: "fill",
          align: "left",
          brightness: isDisabled ? "dim" : "bright",
        } satisfies VfdDisplaySection,
      ]
    : analyzerSections.map((section) => ({
        ...section,
        marquee: false,
        brightness: isDisabled ? "dim" : section.brightness,
      }));

  return (
    <div ref={progressRef} className={cn("flex-1 min-w-0", className)} style={progressStyle}>
      <VfdDisplay
        sizingMode="container"
        rows={1}
        phosphorColor={phosphorColor}
        className={cn(!children && "mc-player-progress-vfd")}
        ariaLabel={`Preview progress ${timeText}`}
        lines={[
          {
            brightness: isDisabled ? "dim" : "normal",
            transition: "none",
            sections: [
              // VfdDisplay is a dumb hardware renderer. The Player owns this
              // layout contract: analyzer cells keep their own brightness, mono
              // progress gets a blank fill section, stereo analyzer channels
              // split the available fill area evenly, and playtime remains the
              // trailing auto-sized right section.
              ...progressSections,
              ...(isStereoAnalyzer
                ? []
                : [
                    {
                      content: "",
                      cells: "fill",
                      align: "left",
                      brightness: "ghost",
                      marquee: false,
                      key: "progress-fill",
                    } satisfies VfdDisplaySection,
                  ]),
              { content: "  ", cells: 2, align: "left", brightness: "dim", marquee: false },
              {
                content: timeText,
                cells: "auto",
                align: "right",
                marquee: false,
                brightness: isPlaying && !isDisabled ? "bright" : "dim",
              },
            ],
          },
        ]}
      />
    </div>
  );
}

function PlayerTime({ className }: PlayerTimeProps) {
  const { timeText } = usePlayerContext();
  return <span className={className}>{timeText}</span>;
}

export const Player = Object.assign(PlayerRoot, {
  Button: PlayerButton,
  Progress: PlayerProgress,
  Time: PlayerTime,
});
