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
}

export function DisambiguationPanel({
  candidates,
  onSelect,
  onCancel,
}: DisambiguationPanelProps) {
  return (
    <div
      className={cn(
        "w-full max-w-[480px] mx-auto mt-8",
        "animate-slide-up [animation-fill-mode:both]",
      )}
    >
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">
          Did you mean?
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          We found multiple matches. Pick the right one.
        </p>
      </div>

      {/* Candidate list */}
      <div className="flex flex-col gap-3">
        {candidates.map((candidate, index) => (
          <GlassCard key={candidate.id} className="group">
            <button
              type="button"
              onClick={() => onSelect(candidate)}
              className={cn(
                "w-full flex items-center gap-4 p-4 text-left",
                "transition-all duration-150",
                "rounded-2xl",
                "hover:bg-white/[0.04]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              )}
              style={{ animationDelay: `${index * 80}ms` }}
              aria-label={`Select "${candidate.title}" by ${candidate.artists.join(", ")}`}
            >
              {/* Artwork */}
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden shadow-md flex-shrink-0 bg-surface">
                {candidate.artworkUrl ? (
                  <img
                    src={candidate.artworkUrl}
                    alt={`"${candidate.title}" by ${candidate.artists.join(", ")} - album artwork`}
                    className="w-full h-full object-cover"
                    width={64}
                    height={64}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = "/og/default.jpg"; }}
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
                <p className="text-sm text-text-secondary truncate mt-0.5">
                  {candidate.artists.join(", ")}
                </p>
                {candidate.albumName && (
                  <p className="text-xs text-text-muted truncate mt-0.5">
                    {candidate.albumName}
                  </p>
                )}
              </div>

              {/* Select arrow */}
              <div
                className={cn(
                  "flex-shrink-0 w-9 h-9 rounded-full",
                  "flex items-center justify-center",
                  "bg-accent/10 text-accent",
                  "group-hover:bg-accent group-hover:text-white",
                  "transition-all duration-150",
                )}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </div>
            </button>
          </GlassCard>
        ))}
      </div>

      {/* Cancel link */}
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
          None of these? Try a different search.
        </button>
      </div>

      {/* Screen reader announcement */}
      <p className="sr-only" aria-live="polite">
        Found {candidates.length} possible matches. Please select the correct one.
      </p>
    </div>
  );
}
