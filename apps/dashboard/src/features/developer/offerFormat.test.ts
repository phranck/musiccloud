import { OfferCurrency } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { formatOfferPrice } from "./offerFormat";

describe("formatOfferPrice", () => {
  it("writes an offer's amount in whole units of its own currency", () => {
    expect(formatOfferPrice({ priceCents: 990, currency: OfferCurrency.Eur })).toBe("€9.90");
    expect(formatOfferPrice({ priceCents: 990, currency: OfferCurrency.Usd })).toBe("US$9.90");
  });

  it("never writes a dollar offer as euros", () => {
    expect(formatOfferPrice({ priceCents: 900, currency: OfferCurrency.Usd })).not.toContain("€");
  });
});
