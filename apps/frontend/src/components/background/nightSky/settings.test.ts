import { describe, expect, it } from "vitest";
import { DAY_FADE_FPS, daynessForLocalTime, NIGHT_SKY_DEFAULTS, NIGHT_SKY_RANGES } from "./settings";

/**
 * Contract of the production night-sky settings (plan MC-029 Phase 4):
 * the defaults are the user-approved prototype JSON (fourth iteration,
 * production sign-off 2026-06-12) — every key present, every value inside
 * its prototype slider range. The local-time mapping is the pure function
 * behind the opt-in auto day/night mode and must reproduce the prototype's
 * twilight ramps exactly.
 */

/** The 42 keys of the approved settings JSON (36 numeric + 6 colors). */
const EXPECTED_KEYS = [
  "dayness",
  "dayTransition",
  "autoDayNight",
  "sunriseHour",
  "sunsetHour",
  "twilightHours",
  "vignette",
  "skyFov",
  "polarisX",
  "polarisY",
  "rotationPeriod",
  "catalogSize",
  "catalogBrightness",
  "starDensity",
  "starSize",
  "starBrightness",
  "twinkleAmount",
  "twinkleSpeed",
  "cloudScale",
  "cloudCoverage",
  "cloudSoftness",
  "cloudOpacity",
  "cloudDetail",
  "clearZones",
  "warpStrength",
  "windSpeed",
  "windAngle",
  "evolveSpeed",
  "moonIntensity",
  "moonAngle",
  "sunIntensity",
  "sunAngle",
  "starOcclusion",
  "animate",
  "renderScale",
  "fpsCap",
  "skyTop",
  "skyBottom",
  "skyTopDay",
  "skyBottomDay",
  "cloudColor",
  "cloudColorDay",
] as const;

/** Spot-checks of user-approved values that must never drift silently. */
const PINNED_VALUES: Partial<Record<(typeof EXPECTED_KEYS)[number], number | string>> = {
  dayness: 0,
  autoDayNight: 0,
  fpsCap: 10,
  renderScale: 0.7,
  cloudDetail: 7,
  rotationPeriod: 1200,
  skyTop: "#03070d",
  cloudColorDay: "#e6edf3",
};

describe("NIGHT_SKY_DEFAULTS", () => {
  it("contains exactly the 42 approved settings keys", () => {
    expect(Object.keys(NIGHT_SKY_DEFAULTS).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("pins the user-approved production values", () => {
    for (const [key, value] of Object.entries(PINNED_VALUES)) {
      expect(NIGHT_SKY_DEFAULTS[key as keyof typeof NIGHT_SKY_DEFAULTS], key).toBe(value);
    }
  });

  it("keeps every numeric default inside its prototype slider range", () => {
    for (const [key, range] of Object.entries(NIGHT_SKY_RANGES)) {
      const value = NIGHT_SKY_DEFAULTS[key as keyof typeof NIGHT_SKY_DEFAULTS] as number;
      expect(value, `${key} >= min`).toBeGreaterThanOrEqual(range.min);
      expect(value, `${key} <= max`).toBeLessThanOrEqual(range.max);
    }
  });

  it("uses #rrggbb colors", () => {
    for (const key of ["skyTop", "skyBottom", "skyTopDay", "skyBottomDay", "cloudColor", "cloudColorDay"] as const) {
      expect(NIGHT_SKY_DEFAULTS[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("DAY_FADE_FPS", () => {
  it("is the user-approved 30 fps fade boost", () => {
    expect(DAY_FADE_FPS).toBe(30);
  });
});

describe("daynessForLocalTime", () => {
  /** Builds a Date at the given local fractional hour. */
  function at(hour: number): Date {
    const d = new Date(2026, 5, 12);
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return d;
  }
  const cfg = { sunriseHour: 6.5, sunsetHour: 20.5, twilightHours: 1.5 };

  it("returns 0 deep at night and 1 at midday", () => {
    expect(daynessForLocalTime(at(2), cfg)).toBe(0);
    expect(daynessForLocalTime(at(13), cfg)).toBe(1);
  });

  it("returns the half-way blend exactly at sunrise and sunset", () => {
    expect(daynessForLocalTime(at(6.5), cfg)).toBeCloseTo(0.5, 5);
    expect(daynessForLocalTime(at(20.5), cfg)).toBeCloseTo(0.5, 5);
  });

  it("stays inside [0, 1] across the whole day", () => {
    for (let h = 0; h < 24; h += 0.25) {
      const v = daynessForLocalTime(at(h), cfg);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
