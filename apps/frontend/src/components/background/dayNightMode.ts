/**
 * Day-night mode store of the night-sky background (plan MC-030).
 *
 * One module-level store shared between the header island (the DayNightSwitcher
 * writes) and the background island (BackgroundScene subscribes) via the common
 * ES-module graph. The store only manages WHICH mode is active plus its
 * persistence (via the shared {@link createModeStore} factory); translating a
 * mode into a dayness value is `dayNightPolicy.ts`, applying it to the scene is
 * `BackgroundScene.tsx`.
 */

import { createModeStore } from "@/lib/createModeStore";

/** The four user-selectable sky modes of the day-night switcher. */
export const DayNightMode = {
  /** Fixed day sky (`dayness: 1`). */
  Day: "day",
  /** Fixed night sky (`dayness: 0`). */
  Night: "night",
  /** Follows the OS `prefers-color-scheme`: dark = night, light = day. The default until the user picks a mode. */
  System: "system",
  /** Follows the local clock with the fixed twilight defaults. */
  Automatic: "automatic",
} as const;

export type DayNightMode = (typeof DayNightMode)[keyof typeof DayNightMode];

const store = createModeStore<DayNightMode>({
  storageKey: "mc.background.dayNightMode",
  // The DayNightSwitcher's persisted selection always wins; on the very first
  // visit — with an empty store — the sky follows the OS colour scheme via System.
  defaultMode: DayNightMode.System,
  isValid: (value): value is DayNightMode =>
    typeof value === "string" && (Object.values(DayNightMode) as readonly string[]).includes(value),
});

/**
 * Returns the active day-night mode (SSR-safe: the default before any
 * client-side initialisation).
 */
export const getDayNightMode = store.getMode;

/**
 * Activates a mode, persists it and notifies all subscribers. Setting the
 * already-active mode is a no-op — re-selecting the current entry never
 * re-triggers a fade.
 */
export const setDayNightMode = store.setMode;

/**
 * Subscribes to mode changes (fires on actual changes only, not on
 * subscription). Returns an unsubscribe function.
 */
export const subscribeDayNightMode = store.subscribe;
