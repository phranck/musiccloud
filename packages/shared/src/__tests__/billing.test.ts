import { describe, expect, it } from "vitest";
import {
  BILLING_PERIODS,
  BillingPeriod,
  canPayWhatYouWant,
  formatCents,
  isBillingPeriod,
  isSubscriptionStatus,
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  parsePriceToCents,
  SUBSCRIPTION_STATUSES,
} from "../billing.js";

describe("formatCents", () => {
  it("writes a whole amount without decimals", () => {
    expect(formatCents(900)).toBe("9");
    expect(formatCents(149000)).toBe("1490");
  });

  it("writes any other amount with two decimals", () => {
    expect(formatCents(990)).toBe("9.90");
    expect(formatCents(905)).toBe("9.05");
  });
});

describe("parsePriceToCents", () => {
  it("reads a typed price as cents, rounded to the nearest cent", () => {
    expect(parsePriceToCents(" 9.90 ")).toBe(990);
    expect(parsePriceToCents("9")).toBe(900);
    expect(parsePriceToCents("9.999")).toBe(1000);
  });

  it("refuses an empty or unreadable field", () => {
    expect(parsePriceToCents("")).toBeUndefined();
    expect(parsePriceToCents("   ")).toBeUndefined();
    expect(parsePriceToCents("nine")).toBeUndefined();
    expect(parsePriceToCents("Infinity")).toBeUndefined();
  });

  it("accepts the bounds and refuses anything outside them", () => {
    expect(parsePriceToCents(formatCents(MIN_PRICE_CENTS))).toBe(MIN_PRICE_CENTS);
    expect(parsePriceToCents(formatCents(MAX_PRICE_CENTS))).toBe(MAX_PRICE_CENTS);
    expect(parsePriceToCents(formatCents(MIN_PRICE_CENTS - 1))).toBeUndefined();
    expect(parsePriceToCents(formatCents(MAX_PRICE_CENTS + 1))).toBeUndefined();
    expect(parsePriceToCents("-5")).toBeUndefined();
  });

  it("reads back what formatCents writes", () => {
    for (const cents of [MIN_PRICE_CENTS, 990, 149000]) {
      expect(parsePriceToCents(formatCents(cents))).toBe(cents);
    }
  });
});

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

describe("canPayWhatYouWant", () => {
  it("allows the customer's own amount on a one-off offer and on no recurring one", () => {
    for (const period of BILLING_PERIODS) {
      expect(canPayWhatYouWant(period)).toBe(period === BillingPeriod.Once);
    }
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
