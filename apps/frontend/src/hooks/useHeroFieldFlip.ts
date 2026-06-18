import { type RefObject, useLayoutEffect, useRef } from "react";

interface HeroFieldFlipOptions {
  /** Whether the field is in its compact (collapsed) layout. */
  showCompact: boolean;
  /** Whether the return-to-center flip is in flight (it owns the field then). */
  isReturning: boolean;
}

/**
 * FLIP glide for the hero search field as it collapses into its compact position.
 *
 * The first time the field becomes compact, this measures the top delta from its
 * previous position and animates it from the old position to the new one
 * (`transform` seeded with `transition: none`, then released to a timed
 * `transform` transition), so the collapse reads as a smooth glide instead of a
 * jump. It is skipped while the return-to-center flip is running, which owns the
 * field's transform during that phase.
 *
 * @param searchFieldRef Ref to the field wrapper that is measured and transformed.
 * @param options Compact + returning flags that gate the glide.
 */
export function useHeroFieldFlip(
  searchFieldRef: RefObject<HTMLDivElement | null>,
  { showCompact, isReturning }: HeroFieldFlipOptions,
): void {
  const previousSearchTop = useRef<number | null>(null);
  const previousShowCompact = useRef(showCompact);

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchFieldRef is a stable ref — reading `.current` must not become a dependency; the flip must re-run only on the showCompact / isReturning transition.
  useLayoutEffect(() => {
    const el = searchFieldRef.current;
    if (!el) return;
    let transitionEndCleanup: (() => void) | undefined;

    const nextTop = el.getBoundingClientRect().top;
    const becameCompact = showCompact && !previousShowCompact.current;
    const previousTop = previousSearchTop.current;

    if (becameCompact && previousTop !== null && !isReturning) {
      const delta = previousTop - nextTop;
      if (Math.abs(delta) >= 2) {
        Object.assign(el.style, {
          transform: `translateY(${delta}px)`,
          transition: "none",
        });
        void el.offsetHeight;
        Object.assign(el.style, {
          transform: "",
          transition: "transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)",
        });

        const cleanup = () => {
          Object.assign(el.style, { transform: "", transition: "" });
          el.removeEventListener("transitionend", cleanup);
          transitionEndCleanup = undefined;
        };
        transitionEndCleanup = cleanup;
        el.addEventListener("transitionend", cleanup);
      }
    }

    previousSearchTop.current = nextTop;
    previousShowCompact.current = showCompact;

    return () => {
      if (!transitionEndCleanup) return;
      Object.assign(el.style, { transform: "", transition: "" });
      el.removeEventListener("transitionend", transitionEndCleanup);
    };
  }, [isReturning, showCompact]);
}
