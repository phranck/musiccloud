import { useCallback, useRef, useState, useSyncExternalStore } from "react";

/** Empty subscribe for the mount-flag store — the value never changes after hydration. */
const subscribeNever = (): (() => void) => () => {};
const getMountedSnapshot = (): boolean => true;
const getMountedServerSnapshot = (): boolean => false;

/**
 * Reads a persisted disclosure flag, SSR-safe. Returns `fallback` when storage is
 * unavailable or the key is unset; otherwise `"1"` → open, anything else → closed.
 *
 * @param key - localStorage key.
 * @param fallback - Value when no preference is stored.
 */
function readStoredDisclosure(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

/**
 * Persists a disclosure flag as `"1"`/`"0"`, swallowing storage errors.
 *
 * @param key - localStorage key.
 * @param open - The flag to persist.
 */
function persistDisclosure(key: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, open ? "1" : "0");
  } catch {
    // Ignore — preference persistence is best-effort.
  }
}

/**
 * A disclosure (open/closed) flag persisted in localStorage, SSR-safe and free of
 * hydration mismatches.
 *
 * Returns `defaultOpen` during SSR and the hydration render (so the server markup
 * matches), then the persisted value once mounted; toggling updates both state and
 * storage. The persisted read happens only on the client (via a mount flag from
 * `useSyncExternalStore` + a lazy ref), so the value is derived during render
 * rather than synced in through an effect.
 *
 * @param storageKey - localStorage key holding the persisted `"1"`/`"0"`.
 * @param defaultOpen - The value before any preference is stored (and during SSR).
 * @returns A tuple `[open, toggle]`.
 */
export function usePersistedDisclosure(storageKey: string, defaultOpen: boolean): readonly [boolean, () => void] {
  const mounted = useSyncExternalStore(subscribeNever, getMountedSnapshot, getMountedServerSnapshot);
  const storedRef = useRef<boolean>(readStoredDisclosure(storageKey, defaultOpen));
  const [userValue, setUserValue] = useState<boolean | null>(null);

  const open = mounted ? (userValue ?? storedRef.current) : defaultOpen;

  const toggle = useCallback(() => {
    setUserValue((previous) => {
      const next = !(previous ?? storedRef.current);
      persistDisclosure(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return [open, toggle] as const;
}
