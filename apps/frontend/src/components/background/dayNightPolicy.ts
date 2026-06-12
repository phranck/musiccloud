import { DayNightMode } from "@/components/background/dayNightMode";
import { daynessForLocalTime, NIGHT_SKY_DEFAULTS } from "@/components/background/nightSky/settings";

/**
 * Mode→dayness business rule of the day-night switcher (plan MC-030):
 * the ONE place that decides which day amount a mode stands for, consumed
 * by the BackgroundScene boot path, its mode-change handler and the tests.
 * Pure — context comes in as parameters, nothing is read from the DOM.
 */

/** Environment snapshot {@link daynessForMode} evaluates a mode against. */
export interface DaynessContext {
  /** Whether the OS reports `prefers-color-scheme: dark` (System mode). */
  prefersDark: boolean;
  /** The viewer's local time (Automatic mode). */
  date: Date;
}

/**
 * Resolves the day amount a mode dictates right now.
 *
 * Day and Night are the fixed endpoints of the blend (`1` = summer day,
 * `0` = night sky — the semantics documented on
 * {@link NightSkySettings.dayness}). System maps the OS preference onto
 * those endpoints. Automatic evaluates the local clock against the fixed
 * production twilight defaults (sunrise 6.5, sunset 20.5, twilight 1.5 h —
 * user decision 2026-06-13: no geolocation), so dawn and dusk return
 * fractional values.
 *
 * @param mode - The active day-night mode.
 * @param context - OS preference and local time to evaluate against.
 * @returns Day amount in [0, 1].
 */
export function daynessForMode(mode: DayNightMode, context: DaynessContext): number {
  switch (mode) {
    case DayNightMode.Day:
      return 1;
    case DayNightMode.Night:
      return 0;
    case DayNightMode.System:
      return context.prefersDark ? 0 : 1;
    case DayNightMode.Automatic:
      return daynessForLocalTime(context.date, NIGHT_SKY_DEFAULTS);
  }
}
