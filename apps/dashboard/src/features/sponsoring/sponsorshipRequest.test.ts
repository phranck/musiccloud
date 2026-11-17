import { PENDING_SPONSORSHIP_LIMITS, type PendingSponsorship } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import {
  type SponsorshipTakeoverForm,
  sponsorshipTakeoverProblems,
  toSponsorshipTakeover,
  toSponsorshipTakeoverForm,
} from "./sponsorshipRequest";

/** A form the takeover route accepts: 60 euros on 2026-11-17. */
const VALID: SponsorshipTakeoverForm = { amount: "60", paidOn: "2026-11-17" };

/** A request that announced 60 euros. */
const REQUEST: PendingSponsorship = {
  id: "r1",
  reference: "RF12MCSP7Q2K9X4M8T3B",
  name: "Ada",
  socialMedia: [{ platform: "mastodon", url: "https://chaos.social/@ada" }],
  claim: "Music for everybody.",
  amountCents: 6_000,
  published: true,
  createdAt: "2026-11-07T12:00:00.000Z",
};

describe("toSponsorshipTakeoverForm", () => {
  it("presets the announced amount in euros and the given day", () => {
    expect(toSponsorshipTakeoverForm(REQUEST, "2026-11-17")).toEqual(VALID);
    expect(toSponsorshipTakeoverForm({ ...REQUEST, amountCents: 1_250 }, "2026-11-17").amount).toBe("12.50");
  });

  it("leaves the amount empty when nothing was announced", () => {
    expect(toSponsorshipTakeoverForm({ ...REQUEST, amountCents: 0 }, "2026-11-17").amount).toBe("");
  });
});

describe("sponsorshipTakeoverProblems", () => {
  it("accepts an amount from one cent to the largest a request may announce", () => {
    expect(sponsorshipTakeoverProblems(VALID).size).toBe(0);
    expect(sponsorshipTakeoverProblems({ ...VALID, amount: "0.01" }).size).toBe(0);
    expect(
      sponsorshipTakeoverProblems({ ...VALID, amount: String(PENDING_SPONSORSHIP_LIMITS.amountMaxCents / 100) }).size,
    ).toBe(0);
  });

  it.each<[string, Partial<SponsorshipTakeoverForm>, string]>([
    ["an empty amount", { amount: "" }, "amount"],
    ["a zero amount", { amount: "0" }, "amount"],
    ["an amount with three decimals", { amount: "1.005" }, "amount"],
    ["an amount above the largest", { amount: String(PENDING_SPONSORSHIP_LIMITS.amountMaxCents / 100 + 1) }, "amount"],
    ["a day that does not exist", { paidOn: "2026-02-30" }, "paidOn"],
    ["an empty day", { paidOn: "" }, "paidOn"],
  ])("refuses %s", (_case, change, field) => {
    expect([...sponsorshipTakeoverProblems({ ...VALID, ...change })]).toEqual([field]);
  });
});

describe("toSponsorshipTakeover", () => {
  it("sends the amount in cents and the day as typed", () => {
    expect(toSponsorshipTakeover({ amount: "55,50", paidOn: "2026-11-16" })).toEqual({
      amountCents: 5_550,
      paidOn: "2026-11-16",
    });
  });
});
