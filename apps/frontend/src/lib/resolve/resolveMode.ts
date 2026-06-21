/**
 * Resolve-mode store (plan 2026-06-21-cc-pfad-frontend, Task 1).
 *
 * One module-level store shared across all islands that need to know or
 * change the active resolve mode — cloned from the `dayNightMode.ts` pattern.
 * The store manages WHICH mode is active and its localStorage persistence;
 * routing to the correct API endpoint is the consumer's responsibility.
 *
 * Default is `ResolveMode.Commercial` so that first-time visitors get the
 * standard commercial flow without any stored preference.
 */

import { ResolveMode } from "../types/app.js";

const STORAGE_KEY = "mc:resolveMode";

/**
 * Mode used before the user has made any choice (nothing persisted yet). Falls
 * back to commercial so the primary user journey is unchanged on first visit.
 */
const DEFAULT_MODE: ResolveMode = ResolveMode.Commercial;

let currentMode: ResolveMode = DEFAULT_MODE;
let initialized = false;
const subscribers = new Set<(mode: ResolveMode) => void>();

/** Type guard validating a raw (storage) value against the `ResolveMode` namespace. */
function isResolveMode(value: unknown): value is ResolveMode {
  return typeof value === "string" && (Object.values(ResolveMode) as readonly string[]).includes(value);
}

/** Reads the persisted mode; invalid or missing values fall back to the default. */
function readStoredMode(): ResolveMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isResolveMode(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persists the mode; storage failures (private mode, quota exceeded) are silently ignored. */
function writeStoredMode(mode: ResolveMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // The mode lives in-memory for the session — persistence is a convenience,
    // not a requirement.
  }
}

/** Lazily hydrates the in-memory mode from localStorage on first client access. */
function ensureClientInit(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  currentMode = readStoredMode();
}

/**
 * Returns the currently active resolve mode (SSR-safe: returns the default
 * before any client-side initialisation has occurred).
 *
 * @returns The active `ResolveMode` value.
 */
export function getResolveMode(): ResolveMode {
  ensureClientInit();
  return currentMode;
}

/**
 * Activates a resolve mode, persists it to localStorage, and notifies all
 * subscribers. Setting the already-active mode is a no-op — consumers never
 * see duplicate transitions.
 *
 * @param mode - The `ResolveMode` value to activate.
 */
export function setResolveMode(mode: ResolveMode): void {
  ensureClientInit();
  if (mode === currentMode) return;
  currentMode = mode;
  writeStoredMode(mode);
  for (const subscriber of subscribers) subscriber(mode);
}

/**
 * Subscribes to resolve-mode changes. The subscriber is called with the new
 * mode after every change; it is NOT called immediately on subscription.
 *
 * Compatible with `React.useSyncExternalStore` — pass this as the
 * `subscribe` argument and `getResolveMode` as the snapshot getter.
 *
 * @param subscriber - Callback invoked with the new mode on each change.
 * @returns An unsubscribe function that removes the subscriber.
 */
export function subscribeResolveMode(subscriber: (mode: ResolveMode) => void): () => void {
  ensureClientInit();
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}
