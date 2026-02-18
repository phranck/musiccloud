import { useT } from "../i18n/context";
import { cn } from "../lib/utils";
import { GlassCard } from "./GlassCard";

export interface DisambiguationCandidate {
  id: string;
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
}

interface DisambiguationPanelProps {
  candidates: DisambiguationCandidate[];
  onSelect: (candidate: DisambiguationCandidate) => void;
  onCancel: () => void;
  selectedId?: string | null;
  loading?: boolean;
}

export function DisambiguationPanel({
  candidates,
  onSelect,
  onCancel,
  selectedId,
  loading = false,
}: DisambiguationPanelProps) {
  const t = useT();
  return (
    <div className={cn("w-full max-w-full sm:max-w-[480px] mx-auto mt-8", "animate-zoom-in")}>
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{t("disambiguation.title")}</h2>
        <p className="text-sm text-text-secondary mt-1">{t("disambiguation.subtitle")}</p>
      </div>

      {/* Candidate list */}
      <div className="flex flex-col">
        {candidates.map((candidate, index) => {
          const isSelected = loading && selectedId === candidate.id;
          const isHiding = loading && !isSelected;
          const isDisabled = loading;

          return (
            <div
              key={candidate.id}
              className={cn(
                "overflow-hidden transition-all ease-in-out",
                isHiding ? "max-h-0 mb-0 duration-300 delay-150" : "max-h-40 mb-3 duration-300",
              )}
            >
            <GlassCard
              className={cn(
                "group",
                "transition-[opacity,transform] duration-200",
                isHiding && "opacity-0 scale-[0.97]",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(candidate)}
                disabled={isDisabled}
                className={cn(
                  "w-full flex items-center gap-4 p-4 text-left",
                  "transition-all duration-150",
                  "rounded-2xl",
                  !isDisabled && "hover:bg-white/[0.04]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isDisabled && "cursor-default",
                )}
                style={{ animationDelay: `${index * 80}ms` }}
                aria-label={
                  isSelected
                    ? t("disambiguation.loading")
                    : `Select "${candidate.title}" by ${candidate.artists.join(", ")}`
                }
              >
                {/* Artwork */}
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-md overflow-hidden shadow-md flex-shrink-0 bg-surface">
                  {candidate.artworkUrl ? (
                    <img
                      src={candidate.artworkUrl}
                      alt={`"${candidate.title}" by ${candidate.artists.join(", ")} - album artwork`}
                      className="w-full h-full object-cover"
                      width={64}
                      height={64}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/og/default.jpg";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface-elevated">
                      <svg
                        className="w-6 h-6 text-text-muted"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium tracking-[-0.01em] text-text-primary truncate">
                    {candidate.title}
                  </p>
                  <p className="text-sm text-text-secondary truncate mt-0.5">{candidate.artists.join(", ")}</p>
                  {candidate.albumName && (
                    <p className="text-xs text-text-muted truncate mt-0.5">{candidate.albumName}</p>
                  )}
                </div>

                {/* Spinner (selected + loading) or arrow */}
                <div
                  className={cn(
                    "flex-shrink-0 w-9 h-9 rounded-full",
                    "flex items-center justify-center",
                    "transition-all duration-150",
                    isSelected
                      ? "bg-accent/50"
                      : ["bg-accent/10 text-accent", !isDisabled && "group-hover:bg-accent group-hover:text-white"],
                  )}
                >
                  {isSelected ? (
                    <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  )}
                </div>
              </button>
            </GlassCard>
            </div>
          );
        })}
      </div>

      {/* Cancel link (hidden during loading) */}
      {!loading && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "text-sm text-text-muted hover:text-text-secondary",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded",
            )}
          >
            {t("disambiguation.cancel")}
          </button>
        </div>
      )}

      {/* Screen reader announcement */}
      <p className="sr-only" aria-live="polite">
        {loading
          ? t("disambiguation.loading")
          : t("disambiguation.found", { count: String(candidates.length) })}
      </p>
    </div>
  );
}
