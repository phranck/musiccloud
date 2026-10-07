import { useGSAP } from "@gsap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROW_CHROME } from "@/components/artist/artistPanelRowChrome";
import { groupedListClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import {
  singleColumnGroupedArtworkCornerStyle,
  singleColumnGroupedArtworkInnerRadius,
  singleColumnGroupedCornerStyle,
} from "@/components/cards/singleColumnGroupedCornerStyle";
import { CancelButton } from "@/components/ui/CancelButton";
import { CandidateRowContent } from "@/components/ui/CandidateRowContent";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { FadeInOnMount } from "@/components/ui/FadeInOnMount";
import { PagedListFooter } from "@/components/ui/PagedListFooter";
import { PanelHeadline } from "@/components/ui/PanelHeadline";
import { discoveryCopy } from "@/copy/discovery";
import { usePagedList } from "@/hooks/usePagedList";
import { animateSlideUp, killEntranceTweens } from "@/lib/motion/entrances";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";
import { cn } from "@/lib/utils";

interface DisambiguationPanelProps {
  candidates: DisambiguationCandidate[];
  /**
   * Called the moment a candidate is clicked, so its resolve starts at once.
   * `animationDone` settles when the selection animation has finished (or the
   * panel goes away); the caller holds the result until then.
   */
  onSelect: (candidate: DisambiguationCandidate, animationDone: Promise<void>) => void;
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
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  // Reset to the first page when a new candidate set arrives (new search), not
  // when the user merely pages within the same set.
  const candidatesKey = candidates.map((candidate) => candidate.id).join("|");
  const {
    page: visibleCandidates,
    pageIndex: safePageIndex,
    pageCount,
    canGoPrevious,
    canGoNext,
    goPrevious,
    goNext,
  } = usePagedList(candidates, { pageSize: CANDIDATES_PER_PAGE, resetKey: candidatesKey });

  const listRef = useRef<HTMLDivElement | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishAnimation = useRef<(() => void) | null>(null);

  // Ends a running selection animation early, settling its promise so the
  // caller waiting on it is never left hanging when the panel goes away.
  const clearAnimationTimer = useCallback(() => {
    if (animationTimer.current !== null) clearTimeout(animationTimer.current);
    animationTimer.current = null;
    finishAnimation.current?.();
    finishAnimation.current = null;
  }, []);

  useEffect(() => {
    return clearAnimationTimer;
  }, [clearAnimationTimer]);

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
      clearAnimationTimer();

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

      // The resolve starts now, while the cards move. The animation's end is
      // handed along so the result is not shown before the choreography is done.
      const animationDone = new Promise<void>((resolve) => {
        finishAnimation.current = resolve;
      });
      animationTimer.current = setTimeout(() => {
        animationTimer.current = null;
        finishAnimation.current?.();
        finishAnimation.current = null;
      }, ANIM_MS + 30);
      onSelect(candidate, animationDone);
    },
    [animatingId, clearAnimationTimer, loading, onSelect],
  );

  const isAnimating = animatingId !== null;
  const isLoadingSelected = loading && !!selectedId;

  return (
    <FadeInOnMount className="w-full max-w-full sm:max-w-[480px] mx-auto mt-8">
      <EmbossedCard>
        <EmbossedCard.Header className="text-center mb-4">
          {isAnimating || isLoadingSelected ? (
            <FadeInOnMount>
              <PanelHeadline
                title={discoveryCopy.disambiguation.resolving.title}
                subtitle={discoveryCopy.disambiguation.resolving.subtitle}
              />
            </FadeInOnMount>
          ) : (
            <PanelHeadline
              title={discoveryCopy.disambiguation.title}
              subtitle={discoveryCopy.disambiguation.subtitle}
            />
          )}
        </EmbossedCard.Header>

        <EmbossedCard.Body>
          <RecessedCard className={recessedControlInsetClassName}>
            <RecessedCard.Body>
              {/* Grouped-corner radii for the candidate rows (AGENTS.md) come from
                  each row's list position. The rows enter scaled, so a reading of
                  the live layout on mount sees them short of the well's right edge. */}
              <div ref={listRef} className={groupedListClassName}>
                {visibleCandidates.map((candidate, index) => {
                  const isThisSelected =
                    (isAnimating && animatingId === candidate.id) || (isLoadingSelected && selectedId === candidate.id);
                  // While a pick plays out the other rows fade away, so the picked
                  // row ends up alone in the well and owns all four of its corners.
                  const cornerIndex = isThisSelected ? 0 : index;
                  const cornerCount = isThisSelected ? 1 : visibleCandidates.length;

                  return (
                    <div key={candidate.id} data-disambiguation-card={candidate.id}>
                      <EmbossedButton
                        as="button"
                        type="button"
                        onClick={() => handleClick(candidate)}
                        disabled={isAnimating || loading}
                        style={singleColumnGroupedCornerStyle(cornerIndex, cornerCount)}
                        className={cn(
                          ROW_CHROME,
                          "text-left",
                          isThisSelected && "ring-1 ring-accent/20",
                          (isAnimating || loading) && "cursor-default",
                        )}
                        aria-label={
                          isThisSelected
                            ? discoveryCopy.disambiguation.loading
                            : `Select "${candidate.title}" by ${candidate.artists.join(", ")}`
                        }
                      >
                        <CandidateRowContent
                          artworkUrl={candidate.artworkUrl}
                          slideArtwork={isThisSelected}
                          slideArtworkActive={isThisSelected}
                          artworkRadius={singleColumnGroupedArtworkInnerRadius}
                          artworkStyle={singleColumnGroupedArtworkCornerStyle(cornerIndex, cornerCount)}
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
              <PagedListFooter
                pageCount={pageCount}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                onPrevious={goPrevious}
                onNext={goNext}
              />
              <CancelButton onClick={onCancel}>{discoveryCopy.disambiguation.cancel}</CancelButton>
            </div>
          )}

          <p className="sr-only" aria-live="polite">
            {isAnimating || loading
              ? discoveryCopy.disambiguation.loading
              : discoveryCopy.disambiguation.found(candidates.length)}
          </p>
        </EmbossedCard.Footer>
      </EmbossedCard>
    </FadeInOnMount>
  );
}
