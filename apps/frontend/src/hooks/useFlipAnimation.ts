import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

interface UseFlipAnimationResult {
  isReturning: boolean;
  capturePosition: () => void;
  triggerReturn: () => void;
}

/**
 * FLIP animation for the search field when transitioning back from results to idle.
 * Captures the pre-clear Y position, then animates the element from its old position
 * to its new (centered) position using a CSS transition.
 */
export function useFlipAnimation(searchFieldRef: RefObject<HTMLDivElement | null>): UseFlipAnimationResult {
  const [isReturning, setIsReturning] = useState(false);
  const prevSearchY = useRef<number | null>(null);

  const capturePosition = useCallback(() => {
    if (searchFieldRef.current) {
      prevSearchY.current = searchFieldRef.current.getBoundingClientRect().top;
    }
  }, [searchFieldRef]);

  const triggerReturn = useCallback(() => {
    setIsReturning(true);
  }, []);

  useLayoutEffect(() => {
    if (!isReturning || prevSearchY.current === null || !searchFieldRef.current) return;
    const el = searchFieldRef.current;
    const newY = el.getBoundingClientRect().top;
    const delta = prevSearchY.current - newY;
    prevSearchY.current = null;

    if (Math.abs(delta) < 2) {
      setIsReturning(false);
      return;
    }

    el.style.transform = `translateY(${delta}px)`;
    el.style.transition = "none";
    el.offsetHeight; // force reflow
    el.style.transition = "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)";
    el.style.transform = "";

    const cleanup = () => {
      el.style.transition = "";
      el.removeEventListener("transitionend", cleanup);
      setIsReturning(false);
    };
    el.addEventListener("transitionend", cleanup);
  }, [isReturning, searchFieldRef]);

  return { isReturning, capturePosition, triggerReturn };
}
