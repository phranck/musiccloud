/**
 * Generic cross-island "mode" store factory.
 *
 * Several features keep a single user-selected mode shared across Astro islands
 * through the common ES-module graph (resolve mode, day/night sky mode, analyzer
 * display mode). They all need the same machinery: hold the active mode, persist
 * it to localStorage, hydrate lazily on the client, and notify subscribers on
 * change. This factory owns that machinery once; each feature module supplies
 * only its storage key, default, and value guard, then re-exports the result
 * under its own names (and layers feature-specific behaviour on top where
 * needed, e.g. the analyzer store's keybinding + analytics).
 */

/**
 * Configuration for {@link createModeStore}.
 *
 * @typeParam T - The mode union, typically the members of a string-literal
 *   `as const` namespace.
 */
export interface ModeStoreOptions<T extends string> {
  /** localStorage key the active mode is persisted under. */
  storageKey: string;
  /** Mode returned before client init and whenever nothing valid is stored. */
  defaultMode: T;
  /** Type guard validating a raw stored value against the mode union. */
  isValid: (value: unknown) => value is T;
}

/**
 * A module-level mode store: get/set the active mode and subscribe to changes.
 *
 * @typeParam T - The mode union.
 */
export interface ModeStore<T extends string> {
  /** The active mode (SSR-safe: returns the default before client init). */
  getMode: () => T;
  /** Activates a mode, persists it, and notifies subscribers. No-op if unchanged. */
  setMode: (mode: T) => void;
  /**
   * Subscribes to mode changes. The subscriber fires with the new mode on every
   * change (NOT immediately on subscription) — compatible with
   * `React.useSyncExternalStore`.
   *
   * @returns An unsubscribe function.
   */
  subscribe: (subscriber: (mode: T) => void) => () => void;
}

/**
 * Builds a {@link ModeStore} shared across every island that imports the calling
 * module through the common ES-module graph.
 *
 * Every storage access is guarded with a `typeof window` check and the store
 * hydrates lazily on first client access, so it is SSR-safe. The SSR server
 * snapshot is intentionally NOT the store's concern: `useSyncExternalStore`
 * consumers pass their own server snapshot at the call site, leaving this store
 * to own only the client-side default.
 *
 * @param options - {@link ModeStoreOptions}.
 * @returns The store's get/set/subscribe trio.
 */
export function createModeStore<T extends string>({
  storageKey,
  defaultMode,
  isValid,
}: ModeStoreOptions<T>): ModeStore<T> {
  let currentMode: T = defaultMode;
  let initialized = false;
  const subscribers = new Set<(mode: T) => void>();

  /** Reads the persisted mode; invalid/missing values fall back to the default. */
  function readStoredMode(): T {
    if (typeof window === "undefined") return defaultMode;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return isValid(raw) ? raw : defaultMode;
    } catch {
      return defaultMode;
    }
  }

  /** Persists the mode; storage failures (private mode, quota) stay silent. */
  function writeStoredMode(mode: T): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      // The mode then lives in-memory for the session — persistence is a
      // convenience, not a requirement.
    }
  }

  /** Lazily hydrates the in-memory mode from storage on first client access. */
  function ensureClientInit(): void {
    if (initialized || typeof window === "undefined") return;
    initialized = true;
    currentMode = readStoredMode();
  }

  function getMode(): T {
    ensureClientInit();
    return currentMode;
  }

  function setMode(mode: T): void {
    ensureClientInit();
    if (mode === currentMode) return;
    currentMode = mode;
    writeStoredMode(mode);
    for (const subscriber of subscribers) subscriber(mode);
  }

  function subscribe(subscriber: (mode: T) => void): () => void {
    ensureClientInit();
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  }

  return { getMode, setMode, subscribe };
}
