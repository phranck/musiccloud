import { type RefObject, useCallback, useLayoutEffect, useState } from "react";
import { useFlipAnimation } from "@/hooks/useFlipAnimation";

interface UseSearchFieldReturnOptions {
  /**
   * `true` while the field sits in a compact (top) layout — the only layouts
   * a return glide makes sense from. Gates {@link UseSearchFieldReturnResult.armFieldReturn}.
   */
  showCompact: boolean;
  /** Dispatches the actual clear (`CLEAR_START`) on the app state machine. */
  onClear: () => void;
  /** Resets the hero input's controlled value to the empty string. */
  onResetInput: () => void;
}

interface UseSearchFieldReturnResult {
  /**
   * `true` while the return flip travels — the page fades the large logo
   * back in during this window. Forwarded from `useFlipAnimation`.
   */
  isReturning: boolean;
  /**
   * `true` for the single pre-paint commit in which the idle branch must
   * render (despite an active result) so the field's compact position is
   * measurable. The page excludes the result branch while this is set.
   */
  isFieldReturnStaging: boolean;
  /**
   * Arms the return flip from the field's CURRENT (compact) position — call
   * it in the same event handler as the clear, BEFORE the re-centering
   * commit (the flip hook's capture contract). Gated on `showCompact`:
   * clearing from the centered idle/error layout has no travel distance, and
   * a zero-delta flip would only re-trigger the large logo's fade-in
   * (visible flicker) without any field motion.
   */
  armFieldReturn: () => void;
  /**
   * Cancel handler for the disambiguation / genre-search panels: identical
   * to a plain clear, but lets the field glide back to center. The input
   * value is intentionally NOT reset (pre-existing cancel semantics: the
   * query stays editable).
   */
  handleCancelWithReturn: () => void;
  /**
   * Completion callback for the clearing slide-out of the results panel
   * (wired to the GSAP timeline's `onComplete`, which fires exactly once per
   * timeline — no event bubbling to guard against); hands over to the
   * staging commit described in the module-level mechanism notes. On the
   * reduced-motion path no timeline exists and the page calls this
   * synchronously — the clear flow must not depend on an animation playing.
   */
  handleClearSlideOutComplete: () => void;
}

/**
 * Clear-time choreography that glides the hero search field back to its
 * centered idle position, built on top of `useFlipAnimation` (which stays a
 * pure FLIP primitive).
 *
 * Two distinct clear shapes feed the same flip:
 *
 * 1. Compact layouts (disambiguation, genre browse/search): the field is
 *    mounted at its compact top position, so {@link UseSearchFieldReturnResult.armFieldReturn}
 *    simply captures it in the triggering event handler before the clear
 *    commits.
 * 2. Result → clear: the hero field is NOT mounted in the result layout
 *    (commit 719a656 removed it for share-page parity), so when the clearing
 *    slide-out ends there is no live geometry to capture. The
 *    {@link UseSearchFieldReturnResult.handleClearSlideOutComplete} callback
 *    therefore sets a staging flag that re-renders the idle branch in
 *    compact form while the app state is still `clearing` (the still-set
 *    active result keeps the share container's top-anchored layout). The
 *    layout effect below then measures the freshly mounted field, arms the
 *    flip, and only afterwards dispatches the actual clear. React flushes
 *    layout-effect updates before paint, so the staging frame is never
 *    visible — the field appears mid-flip, gliding from the compact top
 *    position to center.
 *
 * @param searchFieldRef - Ref to the search field wrapper that travels
 *   between the compact (top) and idle (centered) layout positions.
 * @param options - Page wiring: compact-layout flag plus the clear/reset
 *   dispatchers (see {@link UseSearchFieldReturnOptions}).
 * @returns Staging/return flags plus the three clear-path handlers (see
 *   {@link UseSearchFieldReturnResult}).
 */
export function useSearchFieldReturn(
  searchFieldRef: RefObject<HTMLDivElement | null>,
  { showCompact, onClear, onResetInput }: UseSearchFieldReturnOptions,
): UseSearchFieldReturnResult {
  const { isReturning, capturePosition, triggerReturn } = useFlipAnimation(searchFieldRef);
  const [isFieldReturnStaging, setIsFieldReturnStaging] = useState(false);

  const armFieldReturn = useCallback(() => {
    if (!showCompact) return;
    capturePosition();
    triggerReturn();
  }, [showCompact, capturePosition, triggerReturn]);

  const handleCancelWithReturn = useCallback(() => {
    armFieldReturn();
    onClear();
  }, [armFieldReturn, onClear]);

  const handleClearSlideOutComplete = useCallback(() => {
    onResetInput();
    setIsFieldReturnStaging(true);
  }, [onResetInput]);

  // Staging commit for the result → clear flow (mechanism 2 above). The
  // consumer's compact-direction layout effect does not interfere: its
  // dependencies (`isReturning`, `showCompact`) are both unchanged in the
  // staging commit, so React skips it.
  useLayoutEffect(() => {
    if (!isFieldReturnStaging) return;
    capturePosition();
    triggerReturn();
    setIsFieldReturnStaging(false);
    onClear();
  }, [isFieldReturnStaging, capturePosition, triggerReturn, onClear]);

  return { isReturning, isFieldReturnStaging, armFieldReturn, handleCancelWithReturn, handleClearSlideOutComplete };
}
