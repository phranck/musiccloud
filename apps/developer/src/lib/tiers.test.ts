import { OfferCurrency } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { makePublicTier } from "./__fixtures__/public-tier";
import { formatPeriodPrice, formatTierPrice } from "./tiers";

describe("formatTierPrice", () => {
  it("writes a whole amount without decimals and any other with two", () => {
    expect(formatTierPrice("9", OfferCurrency.Eur)).toBe("€9");
    expect(formatTierPrice("9.90", OfferCurrency.Eur)).toBe("€9.90");
  });

  it("writes a price in the currency it is given", () => {
    const dollars = formatTierPrice("9", OfferCurrency.Usd);

    expect(dollars).not.toContain("€");
    expect(dollars).toBe("$9");
  });

  it("shows a value that does not read as a number unchanged", () => {
    expect(formatTierPrice("soon", OfferCurrency.Eur)).toBe("soon");
  });
});

describe("formatPeriodPrice", () => {
  it("writes each side in the currency of the price it shows", () => {
    const tier = makePublicTier({
      price: "9",
      priceCurrency: OfferCurrency.Eur,
      priceYearly: "90",
      priceYearlyCurrency: OfferCurrency.Usd,
      free: false,
    });

    expect(formatPeriodPrice(tier, "monthly")).toBe("€9");
    expect(formatPeriodPrice(tier, "yearly")).toBe("$90");
  });

  it("falls back to the other period together with that period's currency", () => {
    const tier = makePublicTier({ priceYearly: "90", priceYearlyCurrency: OfferCurrency.Usd, free: false });

    expect(formatPeriodPrice(tier, "monthly")).toBe("$90");
  });

  it("returns null for a plan with a price over neither period", () => {
    expect(formatPeriodPrice(makePublicTier(), "monthly")).toBeNull();
  });
});
