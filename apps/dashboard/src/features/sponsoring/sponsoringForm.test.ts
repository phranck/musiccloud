import { SPONSORING_DEFAULTS, type SponsoringConfig } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import {
  centsToEuroInput,
  euroInputToCents,
  type SponsoringForm,
  sponsoringFormProblems,
  toSponsoringConfig,
  toSponsoringForm,
} from "./sponsoringForm";

const CONFIG: SponsoringConfig = {
  costs: [
    { label: "Hosting", amountCents: 20_000 },
    { label: "Domain", amountCents: 1_250 },
  ],
  sponsorMinimumCents: 4_000,
  payeeName: "Frank Gregor",
  payeeIban: "AT611904300234573201",
  payeeBic: "BKAUATWW",
  purposeDonation: "Donation: musiccloud.io",
  purposeSponsor: "Sponsor: musiccloud.io",
  purposePaypal: "musiccloud.io",
};

/** The form of {@link CONFIG}, with one field replaced. */
function formWith(change: Partial<SponsoringForm>): SponsoringForm {
  return { ...toSponsoringForm(CONFIG), ...change };
}

describe("euro amounts", () => {
  it.each([
    ["200", 20_000],
    ["12.5", 1_250],
    ["12,50", 1_250],
    [" 0 ", 0],
  ])("reads %j as %i cents", (typed, cents) => {
    expect(euroInputToCents(typed)).toBe(cents);
  });

  it.each(["", "abc", "-5", "1.234", "1e3", "12."])("refuses %j", (typed) => {
    expect(euroInputToCents(typed)).toBeNull();
  });

  it("writes whole euros without decimals and anything else with two", () => {
    expect(centsToEuroInput(20_000)).toBe("200");
    expect(centsToEuroInput(1_250)).toBe("12.50");
  });
});

describe("sponsoringFormProblems", () => {
  it("finds nothing in the stored setting", () => {
    expect(sponsoringFormProblems(toSponsoringForm(CONFIG))).toEqual(new Set());
  });

  it("finds nothing in the defaults, so an empty setting can be saved", () => {
    expect(sponsoringFormProblems(toSponsoringForm(SPONSORING_DEFAULTS))).toEqual(new Set());
  });

  it("accepts a pasted IBAN with spaces and lower case", () => {
    expect(sponsoringFormProblems(formWith({ payeeIban: "at61 1904 3002 3457 3201" }))).toEqual(new Set());
  });

  it.each<[string, Partial<SponsoringForm>]>([
    ["payeeIban", { payeeIban: "AT611904300234573202" }],
    ["payeeIban", { payeeIban: "AT61" }],
    ["payeeBic", { payeeBic: "BKAU" }],
    ["payeeName", { payeeName: "<b>Frank</b>" }],
    ["purposeDonation", { purposeDonation: "[[button:x]]" }],
    ["purposePaypal", { purposePaypal: "x".repeat(141) }],
    ["sponsorMinimum", { sponsorMinimum: "forty" }],
    ["sponsorMinimum", { sponsorMinimum: "10001" }],
  ])("names %s", (field, change) => {
    expect(sponsoringFormProblems(formWith(change))).toContain(field);
  });

  it("names a cost row by its position", () => {
    const form = formWith({
      costs: [
        { id: "a", label: "Hosting", amount: "200" },
        { id: "b", label: " ", amount: "x" },
      ],
    });
    expect(sponsoringFormProblems(form)).toEqual(new Set(["costs.1.label", "costs.1.amount"]));
  });
});

describe("toSponsoringConfig", () => {
  it("returns the stored setting unchanged after a round trip", () => {
    expect(toSponsoringConfig(toSponsoringForm(CONFIG))).toEqual(CONFIG);
  });

  it("stores IBAN and BIC without spaces and in capitals, and trims labels", () => {
    const config = toSponsoringConfig(
      formWith({
        payeeIban: "at61 1904 3002 3457 3201",
        payeeBic: "bkau atww",
        costs: [{ id: "a", label: " Hosting ", amount: "200" }],
      }),
    );
    expect(config.payeeIban).toBe("AT611904300234573201");
    expect(config.payeeBic).toBe("BKAUATWW");
    expect(config.costs).toEqual([{ label: "Hosting", amountCents: 20_000 }]);
  });
});
