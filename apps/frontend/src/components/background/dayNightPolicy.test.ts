import { describe, expect, it } from "vitest";
import { DayNightMode } from "@/components/background/dayNightMode";
import { daynessForMode } from "@/components/background/dayNightPolicy";

/**
 * Contract of the mode→dayness business rule (plan MC-030 Task 2). Pure —
 * the date comes in as a parameter, so no fake timers. Automatic evaluates
 * the production twilight defaults (sunrise 6.5, sunset 20.5, twilight
 * 1.5 h): noon is full day, 23:00 full night, dawn sits in between.
 */

const NOON = new Date(2026, 5, 13, 12, 0, 0);
const LATE_NIGHT = new Date(2026, 5, 13, 23, 0, 0);
const MID_DAWN = new Date(2026, 5, 13, 6, 30, 0); // centre of the sunrise ramp

describe("daynessForMode", () => {
  it("maps Day to full day and Night to full night regardless of context", () => {
    expect(daynessForMode(DayNightMode.Day, { prefersDark: true, date: LATE_NIGHT })).toBe(1);
    expect(daynessForMode(DayNightMode.Night, { prefersDark: false, date: NOON })).toBe(0);
  });

  it("maps System by the OS dark preference", () => {
    expect(daynessForMode(DayNightMode.System, { prefersDark: true, date: NOON })).toBe(0);
    expect(daynessForMode(DayNightMode.System, { prefersDark: false, date: LATE_NIGHT })).toBe(1);
  });

  it("maps Automatic through the local clock with the default twilight hours", () => {
    expect(daynessForMode(DayNightMode.Automatic, { prefersDark: true, date: NOON })).toBe(1);
    expect(daynessForMode(DayNightMode.Automatic, { prefersDark: false, date: LATE_NIGHT })).toBe(0);
    const dawn = daynessForMode(DayNightMode.Automatic, { prefersDark: false, date: MID_DAWN });
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(1);
  });
});
