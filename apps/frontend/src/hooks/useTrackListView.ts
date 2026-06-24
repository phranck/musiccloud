import { useCallback, useRef, useState, useSyncExternalStore } from "react";

/**
 * How an artist-track section presents its rows. `List` is the stacked-row
 * default; `Grid` is the cover-only grid. PascalCase namespace per the
 * domain-literals rule — never compare against the raw `"list"`/`"grid"`.
 */
export const TrackListView = {
  List: "list",
  Grid: "grid",
} as const;
export type TrackListView = (typeof TrackListView)[keyof typeof TrackListView];

/** Rows per page in list view (matches usePagedList's own default). */
const LIST_PAGE_SIZE = 5;
/**
 * Cover tiles per page in grid view. A multiple of both three and four so a full
 * page fills the responsive 3-4 column track without leaving an orphan row.
 */
const GRID_PAGE_SIZE = 12;

/**
 * The `usePagedList` page size for a track section in the given view: a short
 * list page, or a larger grid page that fills the 3-4 column track. Shared by
 * the desktop card and the mobile section so both page identically per view.
 *
 * @param view - The current presentation.
 * @returns Items per page.
 */
export function getTrackPageSize(view: TrackListView): number {
  return view === TrackListView.Grid ? GRID_PAGE_SIZE : LIST_PAGE_SIZE;
}

/** Empty subscribe for the mount-flag store — the value never changes after hydration. */
const subscribeNever = (): (() => void) => () => {};
const getMountedSnapshot = (): boolean => true;
const getMountedServerSnapshot = (): boolean => false;

/** Narrows a raw stored string to a {@link TrackListView}, rejecting anything else. */
function isTrackListView(value: string | null): value is TrackListView {
  return value === TrackListView.List || value === TrackListView.Grid;
}

/**
 * Reads a persisted track view, SSR-safe. Returns `fallback` when storage is
 * unavailable or holds an unrecognized value.
 *
 * @param key - localStorage key.
 * @param fallback - View when no valid preference is stored.
 */
function readStoredView(key: string, fallback: TrackListView): TrackListView {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return isTrackListView(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persists the chosen track view, swallowing storage errors.
 *
 * @param key - localStorage key.
 * @param view - The view to persist.
 */
function persistView(key: string, view: TrackListView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, view);
  } catch {
    // Ignore — preference persistence is best-effort.
  }
}

/**
 * A per-card list/grid view preference persisted in localStorage, SSR-safe and
 * free of hydration mismatches — the same shape as {@link import("@/components/ui/usePersistedDisclosure").usePersistedDisclosure},
 * but holding a {@link TrackListView} rather than a boolean.
 *
 * Returns `defaultView` during SSR and the hydration render (so the server
 * markup matches), then the persisted value once mounted; setting it updates
 * both state and storage. The persisted read happens only on the client (via a
 * mount flag from `useSyncExternalStore` + a lazy ref), so the value is derived
 * during render rather than synced in through an effect. Each card passes its
 * own `storageKey`, so popular and similar remember their views independently.
 *
 * @param storageKey - localStorage key holding the persisted view.
 * @param defaultView - The view before any preference is stored (and during SSR).
 * @returns A tuple `[view, setView]`.
 */
export function useTrackListView(
  storageKey: string,
  defaultView: TrackListView = TrackListView.List,
): readonly [TrackListView, (view: TrackListView) => void] {
  const mounted = useSyncExternalStore(subscribeNever, getMountedSnapshot, getMountedServerSnapshot);
  const storedRef = useRef<TrackListView>(readStoredView(storageKey, defaultView));
  const [userValue, setUserValue] = useState<TrackListView | null>(null);

  const view = mounted ? (userValue ?? storedRef.current) : defaultView;

  const setView = useCallback(
    (next: TrackListView) => {
      persistView(storageKey, next);
      setUserValue(next);
    },
    [storageKey],
  );

  return [view, setView] as const;
}
