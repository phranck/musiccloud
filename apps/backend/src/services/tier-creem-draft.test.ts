/**
 * Unit tests for what an offer becomes when it reaches Creem.
 *
 * The offer carries every field, so what is under test is that each one
 * travels unchanged and that the two texts a customer reads follow the plan
 * and the period. The one derived decision is the billing type, which Creem
 * ties to the period.
 */

import type { ApiTier, TierOffer } from "@musiccloud/shared";
import { BILLING_PERIODS, BillingPeriod } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { creemProductName, draftCreemProductForOffer } from "./tier-creem-draft.js";

/** A plan, of which only the name reaches a Creem product. */
function makeTier(overrides: Partial<ApiTier> = {}): ApiTier {
  return {
    id: "tier_club",
    name: "Club",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
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
    for (const period of BILLING_PERIODS.filter((value) => value !== BillingPeriod.Once)) {
      expect(draftCreemProductForOffer(makeTier(), makeOffer({ billingPeriod: period })).billingType).toBe("recurring");
    }
  });
});
