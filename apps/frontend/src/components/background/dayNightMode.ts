/**
 * Day-night mode store of the night-sky background (plan MC-030).
 *
 * One module-level store shared between the header island (the
 * DayNightSwitcher writes) and the background island (BackgroundScene
 * subscribes) via the common ES-module graph — the same cross-island
 * pattern `playback/analyzerMode.ts` established. The store only manages
 * WHICH mode is active plus its persistence; translating a mode into a
 * dayness value is `dayNightPolicy.ts`, applying it to the scene is
 * `BackgroundScene.tsx`.
 */

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

const STORAGE_KEY = "mc.background.dayNightMode";
/**
 * Mode used before the user has made any choice (nothing persisted yet). The
 * DayNightSwitcher's persisted selection always wins; on the very first visit
 * — with an empty store — the sky follows the OS colour scheme via System.
 */
const DEFAULT_MODE: DayNightMode = DayNightMode.System;

let currentMode: DayNightMode = DEFAULT_MODE;
let initialized = false;
const subscribers = new Set<(mode: DayNightMode) => void>();

/** Type guard validating a raw (storage) value against the mode namespace. */
function isDayNightMode(value: unknown): value is DayNightMode {
  return typeof value === "string" && (Object.values(DayNightMode) as readonly string[]).includes(value);
}

/** Reads the persisted mode; invalid/missing values fall back to the default. */
function readStoredMode(): DayNightMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isDayNightMode(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persists the mode; storage failures (private mode, quota) stay silent. */
function writeStoredMode(mode: DayNightMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
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

/**
 * Returns the active day-night mode (SSR-safe: the default before any
 * client-side initialisation).
 */
export function getDayNightMode(): DayNightMode {
  ensureClientInit();
  return currentMode;
}

/**
 * Activates a mode, persists it and notifies all subscribers. Setting the
 * already-active mode is a no-op — consumers never see duplicate
 * transitions and re-selecting the current entry never re-triggers a fade.
 *
 * @param mode - The mode to activate.
 */
export function setDayNightMode(mode: DayNightMode): void {
  ensureClientInit();
  if (mode === currentMode) return;
  currentMode = mode;
  writeStoredMode(mode);
  for (const subscriber of subscribers) subscriber(mode);
}

/**
 * Subscribes to mode changes (fires on actual changes only, not on
 * subscription).
 *
 * @param subscriber - Called with the new mode after every change.
 * @returns Unsubscribe function.
 */
export function subscribeDayNightMode(subscriber: (mode: DayNightMode) => void): () => void {
  ensureClientInit();
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}
