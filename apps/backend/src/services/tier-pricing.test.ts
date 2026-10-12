/**
 * @file Unit tests for the Creem price enrichment helper (MC-114).
 */

import type { ApiTier, TierOffer } from "@musiccloud/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireCreemApiKey } from "../lib/creem-config.js";

vi.mock("./creem-catalog.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./creem-catalog.js")>()),
  getCreemCatalog: vi.fn(),
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { deviation: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { log } from "../lib/infra/logger.js";
import { CreemPriceOutcome, getCreemCatalog } from "./creem-catalog.js";
import { centsToEuroString, enrichTiersWithCreemPrices } from "./tier-pricing.js";

const mockedCatalog = vi.mocked(getCreemCatalog);

/** An offer of one plan, which is where a displayed price comes from. */
function makeOffer(tierId: string, billingPeriod: string, priceCents: number): TierOffer {
  return {
    id: `offer_${tierId}_${billingPeriod}`,
    tierId,
    billingPeriod: billingPeriod as TierOffer["billingPeriod"],
    priceCents,
    currency: "EUR",
    taxMode: null,
    taxCategory: null,
    imageUrl: null,
    successUrl: null,
    customFields: [],
    abandonedCartRecovery: false,
    payWhatYouWant: false,
    suggestedPriceCents: null,
    sortOrder: 0,
  };
}

/** Builds a minimal Tier for tests, overriding only the relevant fields. */
function makeTier(overrides: Partial<ApiTier>): ApiTier {
  return {
    id: "tier_x",
    name: "X",
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    attributionRequired: false,
    color: "#000000",
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

describe("centsToEuroString", () => {
  it("formats whole euros without decimals", () => {
    expect(centsToEuroString(900)).toBe("9");
    expect(centsToEuroString(9000)).toBe("90");
    expect(centsToEuroString(149000)).toBe("1490");
  });

  it("formats fractional euros with two decimals", () => {
    expect(centsToEuroString(990)).toBe("9.90");
  });
});

describe("enrichTiersWithCreemPrices (MC-114)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("overrides price and priceYearly from the Creem catalog, leaving other fields", async () => {
    mockedCatalog.mockResolvedValue({
      tier_club: {
        "every-month": { productId: "p1", price: 900, currency: "EUR" },
        "every-year": { productId: "p2", price: 9000, currency: "EUR" },
      },
    });
    const offers = [makeOffer("tier_club", "every-month", 700), makeOffer("tier_club", "every-year", 7000)];
    const tiers = [makeTier({ id: "tier_club", name: "Club" })];

    const result = await enrichTiersWithCreemPrices(tiers, offers);

    expect(result[0]?.price).toBe("9");
    expect(result[0]?.priceYearly).toBe("90");
    expect(result[0]?.name).toBe("Club");
  });

  it("reports no price for a plan that sells nothing", async () => {
    mockedCatalog.mockResolvedValue({});
    const tiers = [makeTier({ id: "tier_free" })];

    const result = await enrichTiersWithCreemPrices(tiers, []);

    expect(result[0]?.price).toBeNull();
    expect(result[0]?.priceYearly).toBeNull();
  });

  it("shows the offer's own amount where Creem has no product for it", async () => {
    mockedCatalog.mockResolvedValue({});
    const tiers = [makeTier({ id: "tier_club" })];

    const result = await enrichTiersWithCreemPrices(tiers, [makeOffer("tier_club", "every-month", 990)]);

    expect(result[0]?.price).toBe("9.90");
    expect(result[0]?.priceYearly).toBeNull();
  });

  it("keeps the offers' prices when the catalog fetch throws", async () => {
    mockedCatalog.mockRejectedValue(new Error("creem unreachable"));
    const offers = [makeOffer("tier_club", "every-month", 700), makeOffer("tier_club", "every-year", 7000)];
    const tiers = [makeTier({ id: "tier_club" })];

    const result = await enrichTiersWithCreemPrices(tiers, offers);

    expect(result[0]?.price).toBe("7");
    expect(result[0]?.priceYearly).toBe("70");
  });

  it("ignores the offers of another plan", async () => {
    mockedCatalog.mockResolvedValue({});
    const tiers = [makeTier({ id: "tier_club" })];

    expect(
      (await enrichTiersWithCreemPrices(tiers, [makeOffer("tier_other", "every-month", 990)]))[0]?.price,
    ).toBeNull();
  });
});

describe("enrichTiersWithCreemPrices: reporting the fallback", () => {
  const offers = [makeOffer("tier_club", "every-month", 900)];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves the offers' prices and says the catalogue was unavailable", async () => {
    mockedCatalog.mockRejectedValue(new Error("Creem responded 503"));
    const tiers = [makeTier({ id: "tier_club" })];

    const result = await enrichTiersWithCreemPrices(tiers, offers);

    expect(result[0]?.price).toBe("9");
    const context = vi.mocked(log.deviation).mock.calls[0]?.[0];
    expect(context?.outcome).toBe(CreemPriceOutcome.CatalogUnavailable);
    expect(context?.errorCode).toBe("MC-SYS-0001");
    expect(context?.tiersServedFromDatabase).toBe(1);
  });

  it("says the key is missing rather than blaming Creem for being down", async () => {
    // The catalogue asks for the key the way `getCreemCatalog` does, with no
    // Creem variable set, so the error is the one a deployment really meets.
    vi.stubEnv("CREEM_API_KEY", "");
    vi.stubEnv("CREEM_TEST_API_KEY", "");
    vi.stubEnv("CREEM_LIVE_API_KEY", "");
    mockedCatalog.mockImplementation(async () => {
      requireCreemApiKey("test");
      return {};
    });

    await enrichTiersWithCreemPrices([makeTier({ id: "tier_club" })], offers);

    expect(vi.mocked(log.deviation).mock.calls[0]?.[0]?.outcome).toBe(CreemPriceOutcome.NotConfigured);
  });

  it("reports a conflicting configuration as Creem unavailable, not as a missing key", async () => {
    vi.stubEnv("CREEM_TEST_API_KEY", "creem_test_abc");
    vi.stubEnv("CREEM_API_KEY", "creem_test_other");
    vi.stubEnv("CREEM_LIVE_API_KEY", "");
    mockedCatalog.mockImplementation(async () => {
      requireCreemApiKey("test");
      return {};
    });

    await enrichTiersWithCreemPrices([makeTier({ id: "tier_club" })], offers);

    expect(vi.mocked(log.deviation).mock.calls[0]?.[0]?.outcome).toBe(CreemPriceOutcome.CatalogUnavailable);
  });

  it("says nothing when the catalogue answers, because that is not a deviation", async () => {
    mockedCatalog.mockResolvedValue({ tier_club: { "every-month": { productId: "p", price: 900, currency: "EUR" } } });

    await enrichTiersWithCreemPrices([makeTier({ id: "tier_club" })], offers);

    expect(log.deviation).not.toHaveBeenCalled();
  });
});
