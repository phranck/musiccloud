import { createContext, type ReactNode, use, useLayoutEffect, useRef } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { iconInnerShadow } from "@/components/ui/EmbossedButton";
import { VfdDisplay, type VfdDisplaySection } from "@/components/ui/VfdDisplay";
import { cn } from "@/lib/utils";

export type PlayerProgressVariant = "blocks" | "marker" | "segments";

interface PlayerContextValue {
  isPlaying: boolean;
  isDisabled: boolean;
  currentTime: number;
  duration: number;
  timeText: string;
  ariaLabel: string;
  title?: string;
  progressVariant: PlayerProgressVariant;
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

function renderProgressSections(variant: PlayerProgressVariant, progress: number, cells = 30): VfdDisplaySection[] {
  const safeCells = Math.max(4, cells);

  if (variant === "marker") {
    const markerIndex = Math.round(progress * (safeCells - 1));
    return compactSections([
      sectionFor("━".repeat(markerIndex), "normal"),
      sectionFor("●", "bright"),
      sectionFor("─".repeat(Math.max(0, safeCells - markerIndex - 1)), "dim"),
    ]);
  }

  if (variant === "segments") {
    const innerCells = Math.max(2, safeCells - 2);
    const active = Math.round(progress * innerCells);
    return compactSections([
      sectionFor("[", "dim"),
      sectionFor("■".repeat(active), "bright"),
      sectionFor("□".repeat(Math.max(0, innerCells - active)), "dim"),
      sectionFor("]", "dim"),
    ]);
  }

  const active = Math.round(progress * safeCells);
  return compactSections([
    sectionFor("▰".repeat(active), "bright"),
    sectionFor("▱".repeat(Math.max(0, safeCells - active)), "dim"),
  ]);
}

function renderProgressCells(variant: PlayerProgressVariant, progress: number, cells = 30): string {
  return renderProgressSections(variant, progress, cells)
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
  progressVariant = "blocks",
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
      <section ref={rootRef} className={cn("flex items-start gap-3", className)} aria-label={ariaLabel}>
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
        "p-0.5 flex-none h-[var(--mc-player-control-size,3rem)] w-[var(--mc-player-control-size,3rem)]",
        className,
      )}
      radius={{ base: "0.625rem", sm: "0.875rem" }}
    >
      <RecessedCard.Body className="h-full">
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={isDisabled}
          aria-label={ariaLabel}
          aria-pressed={isPlaying}
          title={title}
          className={cn(
            "mc-player-button relative flex size-full items-center justify-center px-0 py-0",
            isPlaying && !isDisabled && "mc-player-button-active",
            isDisabled && "cursor-not-allowed opacity-50",
          )}
        >
          <svg
            className={cn("block size-6 translate-y-[1px]", !isPlaying && "-translate-x-px")}
            viewBox="0 0 24 24"
            fill={accentColor}
            aria-hidden="true"
            style={{ filter: isDisabled ? "none" : iconInnerShadow }}
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
        </button>
      </RecessedCard.Body>
    </RecessedCard>
  );
}

function PlayerProgress({ className, children }: PlayerProgressProps) {
  const { currentTime, duration, isDisabled, timeText, phosphorColor, progressVariant } = usePlayerContext();
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
    : renderProgressSections(progressVariant, progress).map((section) => ({
        ...section,
        brightness: isDisabled ? "dim" : section.brightness,
      }));

  return (
    <div className={cn("flex-1 min-w-0", className)} data-player-progress-card="true">
      <RecessedCard className="p-0.5" radius={{ base: "0.625rem", sm: "0.875rem" }}>
        <RecessedCard.Body className="relative">
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
                  { content: timeText, cells: "auto", align: "right", brightness: "dim" },
                ],
              },
            ]}
          />
        </RecessedCard.Body>
      </RecessedCard>
    </div>
  );
}

function PlayerProgressTrack({ children, className }: PlayerProgressTrackProps) {
  return <span className={className}>{children ?? <PlayerProgressFill />}</span>;
}

function PlayerProgressFill({ className }: PlayerProgressFillProps) {
  const { currentTime, duration, progressVariant } = usePlayerContext();
  const progress = clampProgress(currentTime, duration);
  return <span className={className}>{renderProgressCells(progressVariant, progress)}</span>;
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
