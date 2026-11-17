import { describe, expect, it } from "vitest";
import { FundingWindowDays, fundingWindowStart } from "./donations.js";
import {
  isSponsorInputValid,
  isSponsorLink,
  SPONSOR_YEAR_DAYS,
  type SponsorInput,
  sponsorDaysLeft,
} from "./sponsors.js";

/** The day the tests count from. */
const TODAY = "2026-11-17";

describe("sponsorDaysLeft", () => {
  it("gives a sponsor who paid today the whole year", () => {
    expect(sponsorDaysLeft(TODAY, TODAY)).toBe(SPONSOR_YEAR_DAYS);
  });

  it("ends the sponsorship exactly where the funding year ends", () => {
    const firstDayOfWindow = fundingWindowStart(TODAY, FundingWindowDays.Year);
    const dayBefore = fundingWindowStart(TODAY, FundingWindowDays.Year + 1);

    expect(sponsorDaysLeft(firstDayOfWindow, TODAY)).toBe(1);
    expect(sponsorDaysLeft(dayBefore, TODAY)).toBe(0);
  });

  it("counts a day in the future as paid today, and an unreadable day as over", () => {
    expect(sponsorDaysLeft("2026-12-24", TODAY)).toBe(SPONSOR_YEAR_DAYS);
    expect(sponsorDaysLeft("not a day", TODAY)).toBe(0);
  });
});

describe("isSponsorLink", () => {
  it.each(["https://chaos.social/@ada", "https://github.com/ada", "https://ada.example"])("accepts %s", (link) => {
    expect(isSponsorLink(link)).toBe(true);
  });

  it.each([
    "http://ada.example",
    "javascript:alert(1)",
    "https://ada:secret@ada.example",
    "https://",
    `https://ada.example/${"x".repeat(500)}`,
  ])("refuses %s", (link) => {
    expect(isSponsorLink(link)).toBe(false);
  });
});

describe("isSponsorInputValid", () => {
  const valid: SponsorInput = {
    name: "Ada",
    links: ["https://ada.example"],
    claim: "",
    published: false,
    paidOn: TODAY,
  };

  it("accepts a sponsor with real addresses and a real day", () => {
    expect(isSponsorInputValid(valid)).toBe(true);
  });

  it.each<[string, Partial<SponsorInput>]>([
    ["a name of spaces", { name: "  " }],
    ["an address that is not https", { links: ["ftp://ada.example"] }],
    ["a day that does not exist", { paidOn: "2026-02-30" }],
  ])("refuses %s", (_case, change) => {
    expect(isSponsorInputValid({ ...valid, ...change })).toBe(false);
  });
});
