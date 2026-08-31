/**
 * Unit tests for what an offer becomes when it reaches Creem.
 *
 * The offer carries every field, so what is under test is that each one
 * travels unchanged and that the two texts a customer reads follow the plan
 * and the period. The one derived decision is the billing type, which Creem
 * ties to the period.
 */
import { describe, expect, it } from "vitest";
import { BillingPeriod, type Tier, type TierOffer } from "../db/tiers-repository.js";
import { creemProductName, draftCreemProductForOffer, isBillingPeriod } from "./tier-creem-draft.js";
import { centsToEuroString, euroStringToCents } from "./tier-pricing.js";

/** A plan, of which only the name reaches a Creem product. */
function makeTier(overrides: Partial<Tier> = {}): Tier {
  return {
    id: "tier_club",
    name: "Club",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
    price: null,
    priceYearly: null,
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

/** A monthly offer with everything Creem accepts filled in. */
function makeOffer(overrides: Partial<TierOffer> = {}): TierOffer {
  return {
    id: "offer_1",
    tierId: "tier_club",
    billingPeriod: BillingPeriod.Monthly,
    priceCents: 990,
    currency: "EUR",
    taxMode: "inclusive",
    taxCategory: "saas",
    imageUrl: "https://musiccloud.io/plan.png",
    successUrl: "https://musiccloud.io/thanks",
    customFields: [{ key: "company", label: "Company", optional: true }],
    abandonedCartRecovery: true,
    payWhatYouWant: false,
    suggestedPriceCents: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe("euroStringToCents", () => {
  it("reads whole and fractional euro amounts", () => {
    expect(euroStringToCents("9")).toBe(900);
    expect(euroStringToCents("9.90")).toBe(990);
    expect(euroStringToCents(" 14.5 ")).toBe(1450);
  });

  it("returns null rather than a wrong amount for anything unreadable", () => {
    expect(euroStringToCents(null)).toBeNull();
    expect(euroStringToCents("free")).toBeNull();
    expect(euroStringToCents("-5")).toBeNull();
  });

  it("is the inverse of the formatter, so a price survives a round trip", () => {
    for (const cents of [100, 990, 1450, 9900]) {
      expect(euroStringToCents(centsToEuroString(cents))).toBe(cents);
    }
  });
});

describe("isBillingPeriod", () => {
  it("accepts every period Creem sells over and nothing else", () => {
    for (const period of Object.values(BillingPeriod)) {
      expect(isBillingPeriod(period)).toBe(true);
    }
    expect(isBillingPeriod("month")).toBe(false);
    expect(isBillingPeriod("every-week")).toBe(false);
    expect(isBillingPeriod(undefined)).toBe(false);
  });
});

describe("creemProductName", () => {
  it("names the product after the plan and the period", () => {
    expect(creemProductName("Club", BillingPeriod.Monthly)).toBe("musiccloud Club (monthly)");
    expect(creemProductName("Club", BillingPeriod.Quarterly)).toBe("musiccloud Club (quarterly)");
  });
});

describe("draftCreemProductForOffer", () => {
  it("carries every field of the offer through unchanged", () => {
    const offer = makeOffer();

    expect(draftCreemProductForOffer(makeTier(), offer)).toEqual({
      name: "musiccloud Club (monthly)",
      description: "musiccloud Club API plan, billed monthly.",
      priceCents: 990,
      currency: "EUR",
      billingPeriod: BillingPeriod.Monthly,
      billingType: "recurring",
      taxMode: "inclusive",
      taxCategory: "saas",
      imageUrl: "https://musiccloud.io/plan.png",
      successUrl: "https://musiccloud.io/thanks",
      customFields: offer.customFields,
      abandonedCartRecovery: true,
      payWhatYouWant: false,
      suggestedPriceCents: null,
    });
  });

  it("leaves a field the offer does not set for Creem to decide", () => {
    const draft = draftCreemProductForOffer(makeTier(), makeOffer({ taxMode: null, taxCategory: null }));

    expect(draft.taxMode).toBeNull();
    expect(draft.taxCategory).toBeNull();
  });

  it("calls a one-time offer one-time, because Creem ties the type to the period", () => {
    const draft = draftCreemProductForOffer(makeTier(), makeOffer({ billingPeriod: BillingPeriod.Once }));

    expect(draft.billingType).toBe("onetime");
    expect(draft.name).toBe("musiccloud Club (once)");
  });

  it("calls every recurring period recurring", () => {
    for (const period of Object.values(BillingPeriod).filter((value) => value !== BillingPeriod.Once)) {
      expect(draftCreemProductForOffer(makeTier(), makeOffer({ billingPeriod: period })).billingType).toBe("recurring");
    }
  });
});
