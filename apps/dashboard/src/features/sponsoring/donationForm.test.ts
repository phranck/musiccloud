import { DONATION_LIMITS, type Donation } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import {
  type DonationForm,
  donationFormProblems,
  emptyDonationForm,
  localDay,
  toDonationForm,
  toDonationInput,
} from "./donationForm";

/** A form the backend accepts: 20 euros by PayPal. */
const VALID: DonationForm = {
  name: " Ada ",
  published: true,
  amount: "20",
  receivedOn: "2026-11-17",
  provider: "paypal",
  note: " thanks ",
};

describe("donationFormProblems", () => {
  it("accepts a complete form and an anonymous one", () => {
    expect(donationFormProblems(VALID).size).toBe(0);
    expect(donationFormProblems({ ...VALID, name: "" }).size).toBe(0);
  });

  it.each<[string, Partial<DonationForm>, string]>([
    ["an empty amount", { amount: "" }, "amount"],
    ["a zero amount", { amount: "0" }, "amount"],
    ["an amount with three decimals", { amount: "1.005" }, "amount"],
    ["an amount above the ledger's largest", { amount: String(DONATION_LIMITS.amountMaxCents / 100 + 1) }, "amount"],
    ["a day that does not exist", { receivedOn: "2026-02-30" }, "receivedOn"],
    ["a name that is too long", { name: "x".repeat(DONATION_LIMITS.nameMaxLength + 1) }, "name"],
    ["a note that is too long", { note: "x".repeat(DONATION_LIMITS.noteMaxLength + 1) }, "note"],
  ])("refuses %s", (_case, change, field) => {
    expect([...donationFormProblems({ ...VALID, ...change })]).toEqual([field]);
  });
});

describe("toDonationInput", () => {
  it("sends cents and trims name and note", () => {
    expect(toDonationInput({ ...VALID, amount: "12,50" })).toEqual({
      name: "Ada",
      published: true,
      amountCents: 1_250,
      receivedOn: "2026-11-17",
      provider: "paypal",
      note: "thanks",
    });
  });

  it("reads a stored donation back into the same form", () => {
    const stored: Donation = {
      ...toDonationInput(VALID),
      id: "d1",
      externalRef: null,
      createdAt: "2026-11-17T10:00:00.000Z",
      updatedAt: "2026-11-17T10:00:00.000Z",
    };

    expect(toDonationForm(stored)).toEqual({ ...VALID, name: "Ada", note: "thanks" });
  });
});

describe("localDay", () => {
  it("states the local calendar day with padded month and day", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("presets a new donation to that day, unnamed and unpublished", () => {
    expect(emptyDonationForm("2026-01-05")).toMatchObject({ receivedOn: "2026-01-05", name: "", published: false });
  });
});
