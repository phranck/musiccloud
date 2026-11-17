import { SPONSOR_LIMITS, type Sponsor } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { emptySponsorForm, type SponsorForm, sponsorFormProblems, toSponsorForm, toSponsorInput } from "./sponsorForm";

/** A stored picture id, the hex SHA-256 the backend stores a copy under. */
const AVATAR_ID = "a".repeat(64);

/** A form the backend accepts: one profile as typed, one website. */
const VALID: SponsorForm = {
  name: " Ada ",
  socialMedia: [
    { platform: "mastodon", url: "@ada@chaos.social" },
    { platform: "website", url: "ada.example/" },
  ],
  avatarId: AVATAR_ID,
  claim: " Music for everybody. ",
  published: true,
  paidOn: "2026-11-17",
};

describe("sponsorFormProblems", () => {
  it("accepts a complete form and one without addresses", () => {
    expect(sponsorFormProblems(VALID).size).toBe(0);
    expect(sponsorFormProblems({ ...VALID, socialMedia: [] }).size).toBe(0);
  });

  it.each<[string, Partial<SponsorForm>, string]>([
    ["an empty name", { name: "  " }, "name"],
    ["a name that is too long", { name: "x".repeat(SPONSOR_LIMITS.nameMaxLength + 1) }, "name"],
    [
      "an address that is not on the platform it names",
      { socialMedia: [{ platform: "bluesky", url: "https://github.com/ada" }] },
      "socialMedia",
    ],
    [
      "more addresses than a sponsor may give",
      {
        socialMedia: Array.from({ length: SPONSOR_LIMITS.socialMediaMaxCount + 1 }, (_unused, index) => ({
          platform: "website",
          url: `https://a${index}.example`,
        })),
      },
      "socialMedia",
    ],
    ["a sentence that is too long", { claim: "x".repeat(SPONSOR_LIMITS.claimMaxLength + 1) }, "claim"],
    ["a day that does not exist", { paidOn: "2026-02-30" }, "paidOn"],
  ])("refuses %s", (_case, change, field) => {
    expect([...sponsorFormProblems({ ...VALID, ...change })]).toEqual([field]);
  });
});

describe("toSponsorInput", () => {
  it("sends every address in its canonical form and trims name and sentence", () => {
    expect(toSponsorInput(VALID)).toEqual({
      name: "Ada",
      socialMedia: [
        { platform: "mastodon", url: "https://chaos.social/@ada" },
        { platform: "website", url: "https://ada.example" },
      ],
      avatarId: AVATAR_ID,
      claim: "Music for everybody.",
      published: true,
      paidOn: "2026-11-17",
    });
  });

  it("reads a stored sponsor back into a form that sends the same sponsor", () => {
    const stored: Sponsor = {
      ...toSponsorInput(VALID),
      id: "s1",
      amountCents: 5_000,
      createdAt: "2026-11-17T10:00:00.000Z",
      updatedAt: "2026-11-17T10:00:00.000Z",
    };

    expect(toSponsorInput(toSponsorForm(stored))).toEqual(toSponsorInput(VALID));
  });

  it("presets a new sponsor to the day given, without a picture, not shown until consent is recorded", () => {
    expect(emptySponsorForm("2026-01-05")).toEqual({
      name: "",
      socialMedia: [],
      avatarId: null,
      claim: "",
      published: false,
      paidOn: "2026-01-05",
    });
  });
});
