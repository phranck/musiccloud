import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Returns `true` on the client after hydration, `false` during SSR.
 * Avoids the useEffect(setState, []) mount-flash pattern by letting
 * React resolve the split directly via server/client snapshots.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
