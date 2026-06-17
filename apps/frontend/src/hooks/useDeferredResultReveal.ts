import { useCallback, useState } from "react";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";
import { type ActiveResult, InputState } from "@/lib/types/app";

/**
 * Result of {@link useDeferredResultReveal}.
 *
 * @property discExitPending True while the share result is ready but its reveal
 *   is being held so the hero's spinning disc can slide out first.
 * @property onLoadingExitComplete Pass to `HeroInput`; called once the disc has
 *   slid out to release the held reveal.
 */
interface DeferredResultReveal {
  discExitPending: boolean;
  onLoadingExitComplete: () => void;
}

/**
 * Holds the share-result reveal until the hero's loading disc has slid out.
 *
 * Detects the direct-search transition (input was `Loading`, a share result is
 * now `active`) during render via the React "store previous value" pattern, so
 * no effect is needed. Only the direct search path is held: disambiguation /
 * genre flows never go through the hero's `Loading` state, so they reveal
 * immediately. Reduced motion skips the hold entirely.
 *
 * @param active The current active share result (or null).
 * @param inputState The hero input's current state.
 * @returns The hold flag plus the completion callback for `HeroInput`.
 */
export function useDeferredResultReveal(active: ActiveResult | null, inputState: InputState): DeferredResultReveal {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [discExitPending, setDiscExitPending] = useState(false);
  const [previousInputState, setPreviousInputState] = useState(inputState);

  if (inputState !== previousInputState) {
    setPreviousInputState(inputState);
    if (!prefersReducedMotion && active !== null && previousInputState === InputState.Loading) {
      setDiscExitPending(true);
    }
  }

  const onLoadingExitComplete = useCallback(() => setDiscExitPending(false), []);
  return { discExitPending, onLoadingExitComplete };
}
