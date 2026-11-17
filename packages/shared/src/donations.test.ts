import { describe, expect, it } from "vitest";
import { FundingWindowDays, fundingProgress, fundingWindowStart, isCalendarDay } from "./donations.js";

describe("isCalendarDay", () => {
  it.each(["2026-11-17", "2024-02-29", "2026-12-31"])("accepts %s", (day) => {
    expect(isCalendarDay(day)).toBe(true);
  });

  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "2026-1-01", "17.11.2026", ""])("refuses %j", (day) => {
    expect(isCalendarDay(day)).toBe(false);
  });
});

describe("fundingWindowStart", () => {
  it("counts today as the window's last day", () => {
    expect(fundingWindowStart("2026-11-17", FundingWindowDays.Year)).toBe("2025-11-18");
    expect(fundingWindowStart("2026-11-17", FundingWindowDays.Month)).toBe("2026-10-19");
    expect(fundingWindowStart("2026-11-17", 1)).toBe("2026-11-17");
  });

  it("crosses a leap day correctly", () => {
    expect(fundingWindowStart("2024-03-01", 2)).toBe("2024-02-29");
  });
});

describe("fundingProgress", () => {
  it("says what is missing while the year is not carried", () => {
    expect(fundingProgress(23_000, 5_000)).toEqual({
      coveredCents: 5_000,
      missingCents: 18_000,
      ratio: 5_000 / 23_000,
    });
  });

  it("caps at the annual cost once more came in", () => {
    expect(fundingProgress(23_000, 30_000)).toEqual({ coveredCents: 23_000, missingCents: 0, ratio: 1 });
  });

  it("reports nothing missing and no ratio when nothing costs anything", () => {
    expect(fundingProgress(0, 5_000)).toEqual({ coveredCents: 0, missingCents: 0, ratio: 0 });
  });
});
