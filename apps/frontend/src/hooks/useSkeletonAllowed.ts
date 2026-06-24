import { useEffect, useReducer } from "react";

/** Grace window after mount during which loading skeletons stay suppressed. */
const SKELETON_DELAY_MS = 300;

/**
 * Skeleton render gate: suppresses the loading skeleton for the first
 * {@link SKELETON_DELAY_MS} after mount, so a fast/null fetch (cache hit, 5xx)
 * never produces the "empty card flashes in then disappears" effect. If the
 * fetch is still pending past the threshold, the skeleton appears as before.
 *
 * @returns `true` once the grace window has elapsed and skeletons may render.
 */
export function useSkeletonAllowed() {
  const [skeletonAllowed, allowSkeleton] = useReducer(() => true, false);
  useEffect(() => {
    const timer = setTimeout(allowSkeleton, SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return skeletonAllowed;
}
