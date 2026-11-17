import { SPONSOR_LIMITS, type Sponsor } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { emptySponsorForm, type SponsorForm, sponsorFormProblems, toSponsorForm, toSponsorInput } from "./sponsorForm";

/** A form the backend accepts: two addresses, one blank line between them. */
const VALID: SponsorForm = {
  name: " Ada ",
  links: "https://chaos.social/@ada\n\n  https://ada.example  ",
  claim: " Music for everybody. ",
  published: true,
  paidOn: "2026-11-17",
};

describe("sponsorFormProblems", () => {
  it("accepts a complete form and one without addresses", () => {
    expect(sponsorFormProblems(VALID).size).toBe(0);
    expect(sponsorFormProblems({ ...VALID, links: "" }).size).toBe(0);
  });

  it.each<[string, Partial<SponsorForm>, string]>([
    ["an empty name", { name: "  " }, "name"],
    ["a name that is too long", { name: "x".repeat(SPONSOR_LIMITS.nameMaxLength + 1) }, "name"],
    ["an address that is not https", { links: "http://ada.example" }, "links"],
    [
      "more addresses than a sponsor may give",
      {
        links: Array.from(
          { length: SPONSOR_LIMITS.linksMaxCount + 1 },
          (_unused, index) => `https://a${index}.example`,
        ).join("\n"),
      },
      "links",
    ],
    ["a sentence that is too long", { claim: "x".repeat(SPONSOR_LIMITS.claimMaxLength + 1) }, "claim"],
    ["a day that does not exist", { paidOn: "2026-02-30" }, "paidOn"],
  ])("refuses %s", (_case, change, field) => {
    expect([...sponsorFormProblems({ ...VALID, ...change })]).toEqual([field]);
  });
});

describe("toSponsorInput", () => {
  it("sends one address per non-empty line and trims name and sentence", () => {
    expect(toSponsorInput(VALID)).toEqual({
      name: "Ada",
      links: ["https://chaos.social/@ada", "https://ada.example"],
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

  it("presets a new sponsor to the day given, not shown until consent is recorded", () => {
    expect(emptySponsorForm("2026-01-05")).toEqual({
      name: "",
      links: "",
      claim: "",
      published: false,
      paidOn: "2026-01-05",
    });
  });
});
