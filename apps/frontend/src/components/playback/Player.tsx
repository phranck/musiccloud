import { createContext, type ReactNode, use } from "react";
import { recessedControlInsetClassName, recessedControlSizeClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { VFD_GLYPHS, VfdDisplay, type VfdDisplaySection } from "@/components/ui/VfdDisplay";
import { cn } from "@/lib/utils";

interface PlayerContextValue {
  isPlaying: boolean;
  isDisabled: boolean;
  timeText: string;
  ariaLabel: string;
  title?: string;
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

interface PlayerTimeProps {
  className?: string;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const PLAYER_SPECTRUM_CELLS = 30;
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

function renderSpectrumSections(bands: readonly number[], cells = PLAYER_SPECTRUM_CELLS): VfdDisplaySection[] {
  const safeCells = Math.max(1, cells);
  const content = Array.from({ length: safeCells }, (_, index) => {
    const sourceIndex = Math.min(bands.length - 1, Math.floor((index / safeCells) * bands.length));
    const level = Math.round((bands[sourceIndex] ?? 0) * (PLAYER_SPECTRUM_LEVEL_GLYPHS.length - 1));
    return spectrumGlyphForLevel(level);
  }).join("");

  return compactSections([sectionFor(content, "bright")]);
}

function PlayerRoot({
  children,
  className,
  isPlaying,
  isDisabled,
  timeText,
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
  const accentColor = isDisabled ? "rgba(255,255,255,0.2)" : "#7aebff";

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
  const { isDisabled, isPlaying, timeText, phosphorColor, spectrumBands } = usePlayerContext();
  const analyzerSections = renderSpectrumSections(spectrumBands ?? []);
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
    <div className={cn("flex-1 min-w-0", className)}>
      <VfdDisplay
        sizingMode="container"
        rows={1}
        phosphorColor={phosphorColor}
        ariaLabel={`Preview progress ${timeText}`}
        lines={[
          {
            brightness: isDisabled ? "dim" : "normal",
            transition: "none",
            sections: [
              // VfdDisplay is a dumb hardware renderer. The Player owns this
              // layout contract: analyzer cells keep their own section
              // brightness, the blank fill section absorbs spare cells, two dim
              // blank segments keep the hardware-style gap, and playtime is the
              // trailing auto-sized right section.
              ...progressSections,
              { content: "", cells: "fill", align: "left", brightness: "ghost", marquee: false, key: "progress-fill" },
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
