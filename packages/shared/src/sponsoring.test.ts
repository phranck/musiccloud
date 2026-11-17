import { describe, expect, it } from "vitest";
import {
  BIC_PATTERN,
  deriveSupportAmounts,
  formatEuroCents,
  groupIban,
  IBAN_PATTERN,
  ibanChecksumHolds,
  normalizeAccountCode,
  parseSponsoringConfig,
  roundSuggestedAmountEur,
  SEPA_TEXT_PATTERN,
  SPONSORING_DEFAULTS,
  type SponsoringConfig,
} from "./sponsoring.js";

/** A setting whose costs add up to 230 euros a year. */
const config: SponsoringConfig = {
  ...SPONSORING_DEFAULTS,
  costs: [
    { label: "Hosting", amountCents: 20_000 },
    { label: "Domain", amountCents: 3_000 },
  ],
};

describe("roundSuggestedAmountEur", () => {
  it.each([
    [0, 0],
    [-100, 0],
    [1, 1],
    [100, 1],
    [101, 2],
    [499, 5],
    [500, 5],
    [501, 10],
    [5_625, 60],
    [6_000, 60],
    [6_001, 65],
  ])("rounds %i cents up to %i euros", (cents, euros) => {
    expect(roundSuggestedAmountEur(cents)).toBe(euros);
  });
});

describe("deriveSupportAmounts", () => {
  it("derives every amount from the sum of the costs, rounded up", () => {
    expect(deriveSupportAmounts(config)).toEqual({
      annualCostCents: 23_000,
      monthlyCostCents: 1_917,
      weekEur: 5,
      monthEur: 20,
      quarterEur: 60,
      yearEur: 230,
      monthHalfEur: 10,
      monthQuarterEur: 5,
      peoplePerYear: 12,
      sponsorMinimumEur: 40,
    });
  });

  it("says nobody is needed when nothing costs anything", () => {
    const amounts = deriveSupportAmounts(SPONSORING_DEFAULTS);
    expect(amounts.annualCostCents).toBe(0);
    expect(amounts.monthEur).toBe(0);
    expect(amounts.peoplePerYear).toBe(0);
  });
});

describe("ibanChecksumHolds", () => {
  it.each([
    "DE89370400440532013000",
    "GB82WEST12345698765432",
    "AT611904300234573201",
  ])("accepts the valid IBAN %s", (iban) => {
    expect(ibanChecksumHolds(iban)).toBe(true);
  });

  it.each([
    "DE89370400440532013001",
    "DE98370400440532013000",
    "",
    "DE89 3704 0044 0532 0130 00",
  ])("refuses %j", (iban) => {
    expect(ibanChecksumHolds(iban)).toBe(false);
  });

  it("accepts a pasted IBAN once it is normalized", () => {
    expect(ibanChecksumHolds(normalizeAccountCode(" de89 3704 0044 0532 0130 00 "))).toBe(true);
  });
});

describe("patterns", () => {
  const sepaText = new RegExp(SEPA_TEXT_PATTERN, "u");

  it.each([
    "Donation: musiccloud.io",
    "Frank Gregor",
    "Zoë Müller-Łukasz",
    "Ref. 2026/11 (A+B), 'x'?",
    "",
  ])("lets %j through as transfer text", (text) => {
    expect(sepaText.test(text)).toBe(true);
  });

  it.each([
    "[[button]]",
    "<b>x</b>",
    "{annualCost}",
    "*bold*",
    "_x_",
    "`code`",
    "a\nb",
    "x & y",
    "100%",
  ])("keeps %j out, because it could form syntax on a page", (text) => {
    expect(sepaText.test(text)).toBe(false);
  });

  it("accepts an empty IBAN and BIC, and an 8 or 11 character BIC", () => {
    expect(new RegExp(IBAN_PATTERN).test("")).toBe(true);
    expect(new RegExp(BIC_PATTERN).test("")).toBe(true);
    expect(new RegExp(BIC_PATTERN).test("BKAUATWW")).toBe(true);
    expect(new RegExp(BIC_PATTERN).test("BKAUATWWXXX")).toBe(true);
    expect(new RegExp(BIC_PATTERN).test("BKAUATW")).toBe(false);
    expect(new RegExp(BIC_PATTERN).test("bkauatww")).toBe(false);
  });
});

describe("parseSponsoringConfig", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(parseSponsoringConfig(null)).toEqual(SPONSORING_DEFAULTS);
  });

  it("returns the defaults for a value that is not JSON", () => {
    expect(parseSponsoringConfig("{not json")).toEqual(SPONSORING_DEFAULTS);
  });

  it("reads back what was stored", () => {
    expect(parseSponsoringConfig(JSON.stringify(config))).toEqual(config);
  });

  it("falls back field by field and drops a broken cost item", () => {
    const stored = JSON.stringify({
      costs: [{ label: "Hosting", amountCents: 20_000 }, { label: 3 }],
      sponsorMinimumCents: -5,
      payeeName: "Frank Gregor",
    });
    expect(parseSponsoringConfig(stored)).toEqual({
      ...SPONSORING_DEFAULTS,
      costs: [{ label: "Hosting", amountCents: 20_000 }],
      payeeName: "Frank Gregor",
    });
  });
});

describe("formatting", () => {
  it("writes whole euros without decimals and anything else with two", () => {
    expect(formatEuroCents(23_000)).toBe("€230");
    expect(formatEuroCents(1_917)).toBe("€19.17");
    expect(formatEuroCents(35)).toBe("€0.35");
    expect(formatEuroCents(1_000_000)).toBe("€10,000");
  });

  it("groups an IBAN by four", () => {
    expect(groupIban("DE89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
    expect(groupIban("")).toBe("");
  });
});
