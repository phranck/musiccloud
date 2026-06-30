/**
 * Resolve-mode store (plan 2026-06-21-cc-pfad-frontend, Task 1).
 *
 * One module-level store shared across all islands that need to know or change
 * the active resolve mode. The store manages WHICH mode is active and its
 * localStorage persistence (via the shared {@link createModeStore} factory);
 * routing to the correct API endpoint is the consumer's responsibility.
 *
 * Default is `ResolveMode.Commercial` so that first-time visitors get the
 * standard commercial flow without any stored preference.
 */

import { createModeStore } from "@/lib/createModeStore";
import { ResolveMode } from "../types/app.js";

const store = createModeStore<ResolveMode>({
  storageKey: "mc:resolveMode",
  // Mode used before the user has made any choice (nothing persisted yet);
  // commercial keeps the primary user journey unchanged on first visit.
  defaultMode: ResolveMode.Commercial,
  isValid: (value): value is ResolveMode =>
    typeof value === "string" && (Object.values(ResolveMode) as readonly string[]).includes(value),
});

/**
 * Returns the currently active resolve mode (SSR-safe: returns the default
 * before any client-side initialisation has occurred).
 */
export const getResolveMode = store.getMode;

/**
 * Activates a resolve mode, persists it to localStorage, and notifies all
 * subscribers. Setting the already-active mode is a no-op.
 */
export const setResolveMode = store.setMode;

/**
 * Subscribes to resolve-mode changes (fires on actual changes only, not on
 * subscription). Compatible with `React.useSyncExternalStore` — pass this as
 * the `subscribe` argument and {@link getResolveMode} as the snapshot getter.
 */
export const subscribeResolveMode = store.subscribe;
