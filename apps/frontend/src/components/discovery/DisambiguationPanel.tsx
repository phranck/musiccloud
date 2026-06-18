import { useGSAP } from "@gsap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";
import { CandidateRowContent } from "@/components/ui/CandidateRowContent";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { FadeInOnMount } from "@/components/ui/FadeInOnMount";
import { useT } from "@/i18n/localeContext";
import { animateSlideUp, killEntranceTweens } from "@/lib/motion/entrances";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";
import { cn } from "@/lib/utils";

interface DisambiguationPanelProps {
  candidates: DisambiguationCandidate[];
  onSelect: (candidate: DisambiguationCandidate) => void;
  onCancel: () => void;
  selectedId?: string | null;
  loading?: boolean;
}

const ANIM_MS = 520;
const ANIM_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const CANDIDATES_PER_PAGE = 8;

/**
 * Per-index stagger step of the candidate-card entrance in seconds (was the
 * CSS `animation-delay: index * 50ms` on the `animate-slide-up` class).
 * Uncapped: a page holds at most {@link CANDIDATES_PER_PAGE} cards.
 */
const CARD_ENTRANCE_STAGGER_SECONDS = 0.05;

export function DisambiguationPanel({
  candidates,
  onSelect,
  onCancel,
  selectedId,
  loading = false,
}: DisambiguationPanelProps) {
  const t = useT();

  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const pageCount = Math.max(1, Math.ceil(candidates.length / CANDIDATES_PER_PAGE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleCandidates = candidates.slice(
    safePageIndex * CANDIDATES_PER_PAGE,
    safePageIndex * CANDIDATES_PER_PAGE + CANDIDATES_PER_PAGE,
  );
  const canGoPrevious = safePageIndex > 0;
  const canGoNext = safePageIndex < pageCount - 1;

  const listRef = useRef<HTMLDivElement>(null);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grouped-corner radii for the candidate rows (AGENTS.md): rows default to the
  // ≤5px inner radius; the first row's top corners and the last row's bottom
  // corners promote to the full control radius, and the artwork frame follows.
  // The list has no header in its well, so `promoteTop` stays true. Merged onto
  // the same node as `listRef` (which the FLIP choreography measures).
  const groupedListRef = useGroupedCorners<HTMLDivElement>({
    itemSelector: ":scope > * > button",
    frameSelector: ".mc-row-art",
    frameInset: 4,
  });
  const setListEl = useCallback(
    (el: HTMLDivElement | null) => {
      listRef.current = el;
      groupedListRef.current = el;
    },
    [groupedListRef],
  );

  const clearResolveTimer = useCallback(() => {
    if (resolveTimer.current === null) return;
    clearTimeout(resolveTimer.current);
    resolveTimer.current = null;
  }, []);

  useEffect(() => {
    return clearResolveTimer;
  }, [clearResolveTimer]);

  // Staggered card entrance (GSAP port of the removed `animate-slide-up`
  // class): one batch over the freshly mounted page slice, replayed when the
  // user pages (the slice's cards remount via their candidate keys).
  useGSAP(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    animateSlideUp(listEl.querySelectorAll("[data-disambiguation-card]"), {
      staggerEachSeconds: CARD_ENTRANCE_STAGGER_SECONDS,
    });
  }, [candidates, safePageIndex]);

  const handleClick = useCallback(
    (candidate: DisambiguationCandidate) => {
      if (animatingId || loading) return;
      clearResolveTimer();

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
      Object.assign(listEl.style, {
        height: `${listHeight}px`,
        position: "relative",
        transition: "none",
      });

      // Stop in-flight entrance tweens — they would keep writing
      // transform/opacity per frame and fight this manual choreography (the
      // CSS-era equivalent was `animation: "none"`). The inline values below
      // overwrite any residue the kill leaves behind.
      killEntranceTweens(allCardEls);
      allCardEls.forEach((el) => {
        const id = el.dataset.disambiguationCard!;
        const pos = positions.get(id);
        if (!pos) return;
        Object.assign(el.style, {
          left: "0",
          margin: "0",
          opacity: "1",
          position: "absolute",
          right: "0",
          top: `${pos.top}px`,
          transform: "translateY(0)",
          transition: "none",
        });
      });

      // ── REFLOW: force browser to commit the setup before transitions ────────
      listEl.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions

      // ── PLAY: all transitions start at the same instant ────────────────────
      const moveT = `transform ${ANIM_MS}ms ${ANIM_EASE}, opacity ${ANIM_MS}ms ${ANIM_EASE}`;

      // Container shrinks to selected card height
      Object.assign(listEl.style, {
        height: `${selectedCardHeight}px`,
        transition: `height ${ANIM_MS}ms ${ANIM_EASE}`,
      });

      // Heading stays visible -- content swaps via React state (isAnimating)

      allCardEls.forEach((el) => {
        const id = el.dataset.disambiguationCard!;
        const pos = positions.get(id);
        if (!pos) return;
        if (id === candidate.id) {
          // Selected card floats up to y = 0 (top of the list)
          Object.assign(el.style, {
            opacity: "1",
            transform: `translateY(${-pos.top}px)`,
            transition: moveT,
          });
        } else {
          // All others converge toward the selected card's original position, fading out
          Object.assign(el.style, {
            opacity: "0",
            transform: `translateY(${selectedPos.top - pos.top}px)`,
            transition: moveT,
          });
        }
      });

      // Fire resolve only after the animation finishes
      resolveTimer.current = setTimeout(() => {
        resolveTimer.current = null;
        onSelect(candidate);
      }, ANIM_MS + 30);
    },
    [animatingId, clearResolveTimer, loading, onSelect],
  );

  const isAnimating = animatingId !== null;
  const isLoadingSelected = loading && !!selectedId;

  return (
    <FadeInOnMount className="w-full max-w-full sm:max-w-[480px] mx-auto mt-8">
      <EmbossedCard>
        <EmbossedCard.Header className="text-center mb-4">
          {isAnimating || isLoadingSelected ? (
            <FadeInOnMount>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">
                {t("disambiguation.resolving.title")}
              </h2>
              <p className="text-sm text-text-secondary mt-1">{t("disambiguation.resolving.subtitle")}</p>
            </FadeInOnMount>
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
          <RecessedCard className={recessedControlInsetClassName}>
            <RecessedCard.Body>
              <div ref={setListEl} className="flex flex-col gap-[var(--mc-gap-list,0.125rem)]">
                {visibleCandidates.map((candidate) => {
                  const isThisSelected =
                    (isAnimating && animatingId === candidate.id) || (isLoadingSelected && selectedId === candidate.id);

                  return (
                    <div key={candidate.id} data-disambiguation-card={candidate.id}>
                      <EmbossedButton
                        as="button"
                        type="button"
                        onClick={() => handleClick(candidate)}
                        disabled={isAnimating || loading}
                        className={cn(
                          "w-full flex items-center text-left",
                          "gap-[var(--mc-gap-rowitem,0.75rem)] py-[var(--mc-pad-track,0.25rem)] pl-[var(--mc-pad-track,0.25rem)] pr-[var(--mc-pad-tracktime,0.5rem)]",
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
                          artworkUrl={candidate.artworkUrl}
                          slideArtwork={isThisSelected}
                          slideArtworkActive={isThisSelected}
                          primary={candidate.title}
                          secondary={candidate.artists.join(", ")}
                          tertiary={candidate.albumName}
                        />
                      </EmbossedButton>
                    </div>
                  );
                })}
              </div>
            </RecessedCard.Body>
          </RecessedCard>
        </EmbossedCard.Body>

        <EmbossedCard.Footer>
          {!isAnimating && !loading && (
            <div className="mt-4 flex flex-col gap-3">
              {pageCount > 1 && (
                <div className="grid grid-cols-2 gap-2">
                  <EmbossedButton
                    as="button"
                    type="button"
                    onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                    disabled={!canGoPrevious}
                    className="flex min-h-10 items-center justify-center px-3 py-0 text-sm font-medium text-text-primary"
                  >
                    {t("disambiguation.previous")}
                  </EmbossedButton>
                  <EmbossedButton
                    as="button"
                    type="button"
                    onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                    disabled={!canGoNext}
                    className="flex min-h-10 items-center justify-center px-3 py-0 text-sm font-medium text-text-primary"
                  >
                    {t("disambiguation.next")}
                  </EmbossedButton>
                </div>
              )}
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
    </FadeInOnMount>
  );
}
