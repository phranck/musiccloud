import { useCallback, useEffect, useRef, useState } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { CandidateRowContent } from "@/components/ui/CandidateRowContent";
import { CDSpinArtwork } from "@/components/ui/CDSpinArtwork";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
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

      // ── REFLOW: force browser to commit the setup before transitions ────────
      listEl.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions

      // ── PLAY: all transitions start at the same instant ────────────────────
      const moveT = `transform ${ANIM_MS}ms ${ANIM_EASE}, opacity ${ANIM_MS}ms ${ANIM_EASE}`;

      // Container shrinks to selected card height
      listEl.style.transition = `height ${ANIM_MS}ms ${ANIM_EASE}`;
      listEl.style.height = `${selectedCardHeight}px`;

      // Heading stays visible -- content swaps via React state (isAnimating)

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
      <EmbossedCard>
        <EmbossedCard.Header className="text-center mb-4">
          {isAnimating || isLoadingSelected ? (
            <div className="animate-fade-in">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">
                {t("disambiguation.resolving.title")}
              </h2>
              <p className="text-sm text-text-secondary mt-1">{t("disambiguation.resolving.subtitle")}</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">
                {t("disambiguation.title")}
              </h2>
              <p className="text-sm text-text-secondary mt-1">{t("disambiguation.subtitle")}</p>
            </>
          )}
        </EmbossedCard.Header>

        <EmbossedCard.Body>
          <RecessedCard>
            <div ref={listRef} className="flex flex-col gap-2">
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
                    <EmbossedButton
                      as="button"
                      type="button"
                      onClick={() => handleClick(candidate)}
                      disabled={isAnimating || loading}
                      className={cn(
                        "w-full flex items-center gap-4 px-3 py-3 text-left rounded-lg",
                        isThisSelected && "ring-1 ring-accent/20",
                        (isAnimating || loading) && "cursor-default",
                      )}
                      aria-label={
                        isThisSelected
                          ? t("disambiguation.loading")
                          : `Select "${candidate.title}" by ${candidate.artists.join(", ")}`
                      }
                    >
                      <CandidateRowContent
                        artwork={
                          isThisSelected ? (
                            <CDSpinArtwork className="w-14 h-14 md:w-16 md:h-16 flex-shrink-0" />
                          ) : undefined
                        }
                        artworkUrl={candidate.artworkUrl}
                        primary={candidate.title}
                        secondary={candidate.artists.join(", ")}
                        tertiary={candidate.albumName}
                      />
                    </EmbossedButton>
                  </div>
                );
              })}
            </div>
          </RecessedCard>
        </EmbossedCard.Body>

        <EmbossedCard.Footer>
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
        </EmbossedCard.Footer>
      </EmbossedCard>
    </div>
  );
}
