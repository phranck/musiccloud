import { useCallback, useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/cards/GlassCard";
import { useT } from "@/i18n/context";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";
import { cn } from "@/lib/utils";

interface DisambiguationPanelProps {
  candidates: DisambiguationCandidate[];
  onSelect: (candidate: DisambiguationCandidate) => void;
  onCancel: () => void;
  selectedId?: string | null;
  loading?: boolean;
}

const ANIM_MS = 420;
const ANIM_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

export function DisambiguationPanel({
  candidates,
  onSelect,
  onCancel,
  selectedId,
  loading = false,
}: DisambiguationPanelProps) {
  const t = useT();

  const [animatingId, setAnimatingId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resolveTimer.current !== null) clearTimeout(resolveTimer.current);
    };
  }, []);

  const handleClick = useCallback(
    (candidate: DisambiguationCandidate) => {
      if (animatingId || loading) return;

      const listEl = listRef.current;
      if (!listEl) return;

      // Query all card wrapper divs via data attribute — no React ref callbacks needed
      const allCardEls = Array.from(listEl.querySelectorAll<HTMLDivElement>("[data-disambiguation-card]"));
      const selectedEl = allCardEls.find((el) => el.dataset.disambiguationCard === candidate.id);
      if (!selectedEl) return;

      // ── MEASURE: snapshot all positions before anything changes ────────────
      const listRect = listEl.getBoundingClientRect();
      const positions = new Map<string, { top: number; height: number }>();
      allCardEls.forEach((el) => {
        const id = el.dataset.disambiguationCard!;
        const r = el.getBoundingClientRect();
        positions.set(id, { top: r.top - listRect.top, height: r.height });
      });

      const selectedPos = positions.get(candidate.id);
      if (!selectedPos) return;

      const listHeight = listEl.offsetHeight;
      const selectedCardHeight = selectedEl.offsetHeight;

      // Block further clicks (async React state — doesn't affect DOM yet)
      setAnimatingId(candidate.id);

      // ── SETUP: freeze list height, switch all cards to absolute flow ────────
      listEl.style.transition = "none";
      listEl.style.position = "relative";
      listEl.style.height = `${listHeight}px`;

      allCardEls.forEach((el) => {
        const id = el.dataset.disambiguationCard!;
        const pos = positions.get(id);
        if (!pos) return;
        // Cancel the slide-up animation fill — CSS animations outrank inline styles in the
        // cascade, so without this, transform and opacity would be locked at their "to" values.
        el.style.animation = "none";
        el.style.position = "absolute";
        el.style.top = `${pos.top}px`;
        el.style.left = "0";
        el.style.right = "0";
        el.style.margin = "0";
        el.style.transition = "none";
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      });

      const headingEl = headingRef.current;
      if (headingEl) {
        headingEl.style.transition = "none";
        headingEl.style.opacity = "1";
      }

      // ── REFLOW: force browser to commit the setup before transitions ────────
      listEl.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions

      // ── PLAY: all transitions start at the same instant ────────────────────
      const moveT = `transform ${ANIM_MS}ms ${ANIM_EASE}, opacity ${ANIM_MS}ms ${ANIM_EASE}`;

      // Container shrinks to selected card height
      listEl.style.transition = `height ${ANIM_MS}ms ${ANIM_EASE}`;
      listEl.style.height = `${selectedCardHeight}px`;

      if (headingEl) {
        headingEl.style.transition = `opacity ${ANIM_MS}ms ${ANIM_EASE}`;
        headingEl.style.opacity = "0";
      }

      allCardEls.forEach((el) => {
        const id = el.dataset.disambiguationCard!;
        const pos = positions.get(id);
        if (!pos) return;
        el.style.transition = moveT;

        if (id === candidate.id) {
          // Selected card floats up to y = 0 (top of the list)
          el.style.transform = `translateY(${-pos.top}px)`;
          el.style.opacity = "1";
        } else {
          // All others converge toward the selected card's original position, fading out
          el.style.transform = `translateY(${selectedPos.top - pos.top}px)`;
          el.style.opacity = "0";
        }
      });

      // Fire resolve only after the animation finishes
      resolveTimer.current = setTimeout(() => {
        onSelect(candidate);
      }, ANIM_MS + 30);
    },
    [animatingId, loading, onSelect],
  );

  const isAnimating = animatingId !== null;
  const isLoadingSelected = loading && !!selectedId;

  return (
    <div className="w-full max-w-full sm:max-w-[480px] mx-auto mt-8 animate-fade-in">
      <div ref={headingRef} className="text-center mb-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{t("disambiguation.title")}</h2>
        <p className="text-sm text-text-secondary mt-1">{t("disambiguation.subtitle")}</p>
      </div>

      <div ref={listRef} className="flex flex-col gap-3">
        {candidates.map((candidate, index) => {
          const isThisSelected =
            (isAnimating && animatingId === candidate.id) || (isLoadingSelected && selectedId === candidate.id);

          return (
            <div
              key={candidate.id}
              data-disambiguation-card={candidate.id}
              className="animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <GlassCard className={cn("group", isThisSelected && "ring-1 ring-accent/20")}>
                <button
                  type="button"
                  onClick={() => handleClick(candidate)}
                  disabled={isAnimating || loading}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 text-left",
                    "rounded-2xl",
                    !isAnimating && !loading && "hover:bg-white/[0.04] transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    (isAnimating || loading) && "cursor-default",
                  )}
                  aria-label={
                    isThisSelected
                      ? t("disambiguation.loading")
                      : `Select "${candidate.title}" by ${candidate.artists.join(", ")}`
                  }
                >
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

                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium tracking-[-0.01em] text-text-primary truncate">
                      {candidate.title}
                    </p>
                    <p className="text-sm text-text-secondary truncate mt-0.5">{candidate.artists.join(", ")}</p>
                    {candidate.albumName && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{candidate.albumName}</p>
                    )}
                  </div>

                  <div
                    className={cn(
                      "flex-shrink-0 rounded-full",
                      "flex items-center justify-center",
                      "transition-all duration-150",
                      isThisSelected
                        ? "bg-transparent w-11 h-11 md:w-12 md:h-12"
                        : [
                            "w-9 h-9 bg-accent/10 text-accent",
                            !isAnimating && !loading && "group-hover:bg-accent group-hover:text-white",
                          ],
                    )}
                  >
                    {isThisSelected ? (
                      <div className="relative w-11 h-11 md:w-12 md:h-12 animate-vinyl-spin">
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background:
                              "radial-gradient(circle at 50% 50%, #e8e8f0 0%, #a0a0b0 40%, #c8c8d0 70%, #b0b0b8 100%)",
                          }}
                        />
                        <div
                          className="absolute inset-0 rounded-full animate-cd-shimmer"
                          style={{
                            background:
                              "conic-gradient(from 30deg, #a060ff 0%, #40b0ff 20%, #40ffc0 35%, #ffe040 50%, #ff6090 65%, #a060ff 80%, transparent 95%)",
                            opacity: 0.45,
                          }}
                        />
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.7) 0%, transparent 40%)",
                          }}
                        />
                        <div
                          className="absolute rounded-full bg-[#0a0a0c]"
                          style={{ top: "38%", left: "38%", width: "24%", height: "24%" }}
                        />
                      </div>
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

      {!isAnimating && !loading && (
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

      <p className="sr-only" aria-live="polite">
        {isAnimating || loading
          ? t("disambiguation.loading")
          : t("disambiguation.found", { count: String(candidates.length) })}
      </p>
    </div>
  );
}
