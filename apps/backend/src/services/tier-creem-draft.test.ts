/**
 * Unit tests for the rules deciding what a tier's Creem product is called and
 * what it costs. What they produce is what a customer reads on the checkout
 * page and on the receipt, and what they refuse is a product Creem would
 * reject or nobody could buy.
 */
import { describe, expect, it } from "vitest";
import type { Tier } from "../db/tiers-repository.js";
import { BillingInterval, draftCreemProductFor, isBillingInterval, tierPriceFor } from "./tier-creem-draft.js";
import { euroStringToCents } from "./tier-pricing.js";

/** A paid tier with both prices set, which every case varies from. */
function makeTier(overrides: Partial<Tier> = {}): Tier {
  return {
    id: "tier_club",
    name: "Club",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
    price: "9.90",
    priceYearly: "99",
    color: "#64748b",
    icon: null,
    buttonLabel: null,
    description: "",
    enabled: true,
    disableReason: "",
    recommended: false,
    sortOrder: 0,
    features: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("euroStringToCents", () => {
  it("reads whole and fractional euro amounts", () => {
    expect(euroStringToCents("9")).toBe(900);
    expect(euroStringToCents("9.90")).toBe(990);
    expect(euroStringToCents(" 14.5 ")).toBe(1450);
  });

  it("rounds to the nearest cent rather than truncating", () => {
    expect(euroStringToCents("0.005")).toBe(1);
    expect(euroStringToCents("19.999")).toBe(2000);
  });

  it("returns null rather than a wrong amount for anything unreadable", () => {
    expect(euroStringToCents(null)).toBeNull();
    expect(euroStringToCents("")).toBeNull();
    expect(euroStringToCents("   ")).toBeNull();
    expect(euroStringToCents("free")).toBeNull();
    expect(euroStringToCents("-5")).toBeNull();
  });
});

describe("isBillingInterval", () => {
  it("accepts the two intervals and nothing else", () => {
    expect(isBillingInterval("month")).toBe(true);
    expect(isBillingInterval("year")).toBe(true);
    expect(isBillingInterval("week")).toBe(false);
    expect(isBillingInterval(undefined)).toBe(false);
  });
});

describe("tierPriceFor", () => {
  it("returns the price belonging to the interval", () => {
    const tier = makeTier();
    expect(tierPriceFor(tier, BillingInterval.Month)).toBe("9.90");
    expect(tierPriceFor(tier, BillingInterval.Year)).toBe("99");
  });
});

describe("draftCreemProductFor", () => {
  it("names the product after the tier and the billing period", () => {
    expect(draftCreemProductFor(makeTier(), BillingInterval.Month)).toEqual({
      name: "musiccloud Club (monthly)",
      description: "musiccloud Club API tier, billed monthly.",
      priceCents: 990,
      currency: "EUR",
      billingPeriod: "every-month",
    });
  });

  it("uses the yearly price and period for the yearly product", () => {
    const draft = draftCreemProductFor(makeTier(), BillingInterval.Year);
    expect(draft?.priceCents).toBe(9900);
    expect(draft?.billingPeriod).toBe("every-year");
    expect(draft?.name).toBe("musiccloud Club (yearly)");
  });

  it("gives a free tier no product, because Creem rejects a recurring product at zero", () => {
    expect(draftCreemProductFor(makeTier({ price: null }), BillingInterval.Month)).toBeNull();
    expect(draftCreemProductFor(makeTier({ price: "0" }), BillingInterval.Month)).toBeNull();
  });

  it("gives no yearly product to a tier that is not sold yearly", () => {
    expect(draftCreemProductFor(makeTier({ priceYearly: null }), BillingInterval.Year)).toBeNull();
    expect(draftCreemProductFor(makeTier({ priceYearly: "" }), BillingInterval.Year)).toBeNull();
  });

  it("gives no product when the price column holds something that is not a price", () => {
    expect(draftCreemProductFor(makeTier({ price: "on request" }), BillingInterval.Month)).toBeNull();
  });
});
