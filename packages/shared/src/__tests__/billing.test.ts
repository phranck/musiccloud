import { describe, expect, it } from "vitest";
import { BILLING_PERIODS, isBillingPeriod, isSubscriptionStatus, SUBSCRIPTION_STATUSES } from "../billing.js";

describe("isBillingPeriod", () => {
  it("accepts every period Creem sells over and nothing else", () => {
    for (const period of BILLING_PERIODS) {
      expect(isBillingPeriod(period)).toBe(true);
    }
    expect(isBillingPeriod("month")).toBe(false);
    expect(isBillingPeriod("every-week")).toBe(false);
    expect(isBillingPeriod(undefined)).toBe(false);
  });
});

describe("isSubscriptionStatus", () => {
  it("accepts every subscription state and nothing else", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(isSubscriptionStatus(status)).toBe(true);
    }
    expect(isSubscriptionStatus("cancelled")).toBe(false);
    expect(isSubscriptionStatus(null)).toBe(false);
  });
});
