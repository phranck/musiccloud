import { describe, expect, it } from "vitest";
import { FundingWindowDays, fundingWindowStart } from "./donations.js";
import { normalizeSponsorInput, SPONSOR_YEAR_DAYS, type SponsorInput, sponsorDaysLeft } from "./sponsors.js";

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

describe("normalizeSponsorInput", () => {
  const valid: SponsorInput = {
    name: " Ada ",
    socialMedia: [
      { platform: "mastodon", url: "https://chaos.social/@ada/" },
      { platform: "website", url: "ada.example" },
    ],
    avatarId: null,
    claim: " Music for everybody. ",
    published: false,
    paidOn: TODAY,
  };

  it("trims the text and stores every address in its canonical form", () => {
    expect(normalizeSponsorInput(valid)).toEqual({
      name: "Ada",
      socialMedia: [
        { platform: "mastodon", url: "https://chaos.social/@ada" },
        { platform: "website", url: "https://ada.example" },
      ],
      avatarId: null,
      claim: "Music for everybody.",
      published: false,
      paidOn: TODAY,
    });
  });

  it.each<[string, Partial<SponsorInput>]>([
    ["a name of spaces", { name: "  " }],
    [
      "an address that does not fit its platform",
      { socialMedia: [{ platform: "bluesky", url: "https://ada.example" }] },
    ],
    [
      "a website on a scheme that reaches no page",
      { socialMedia: [{ platform: "website", url: "ftp://ada.example" }] },
    ],
    [
      "a website with a password in it",
      { socialMedia: [{ platform: "website", url: "https://ada:secret@ada.example" }] },
    ],
    ["a day that does not exist", { paidOn: "2026-02-30" }],
  ])("refuses %s", (_case, change) => {
    expect(normalizeSponsorInput({ ...valid, ...change })).toBeNull();
  });
});
