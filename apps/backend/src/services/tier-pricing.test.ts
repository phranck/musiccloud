/**
 * @file Unit tests for the Creem price enrichment helper (MC-114).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tier } from "../db/tiers-repository.js";

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

/** Builds a minimal Tier for tests, overriding only the relevant fields. */
function makeTier(overrides: Partial<Tier>): Tier {
  return {
    id: "tier_x",
    name: "X",
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    attributionRequired: false,
    price: null,
    priceYearly: null,
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
        month: { productId: "p1", price: 900, currency: "EUR" },
        year: { productId: "p2", price: 9000, currency: "EUR" },
      },
    });
    const tiers = [makeTier({ id: "tier_club", name: "Club", price: "7", priceYearly: "70" })];

    const result = await enrichTiersWithCreemPrices(tiers);

    expect(result[0]?.price).toBe("9");
    expect(result[0]?.priceYearly).toBe("90");
    expect(result[0]?.name).toBe("Club");
  });

  it("leaves tiers without a catalog entry unchanged", async () => {
    mockedCatalog.mockResolvedValue({});
    const tiers = [makeTier({ id: "tier_free", price: null, priceYearly: null })];

    const result = await enrichTiersWithCreemPrices(tiers);

    expect(result[0]?.price).toBeNull();
    expect(result[0]?.priceYearly).toBeNull();
  });

  it("falls back to database prices when the catalog fetch throws", async () => {
    mockedCatalog.mockRejectedValue(new Error("creem unreachable"));
    const tiers = [makeTier({ id: "tier_club", price: "7", priceYearly: "70" })];

    const result = await enrichTiersWithCreemPrices(tiers);

    expect(result[0]?.price).toBe("7");
    expect(result[0]?.priceYearly).toBe("70");
  });
});

describe("enrichTiersWithCreemPrices: reporting the fallback", () => {
  beforeEach(() => {
    vi.mocked(log.deviation).mockClear();
  });

  it("serves the database prices and says the catalogue was unavailable", async () => {
    mockedCatalog.mockRejectedValue(new Error("Creem responded 503"));
    const tiers = [makeTier({ id: "tier_club", price: "9" })];

    const result = await enrichTiersWithCreemPrices(tiers);

    expect(result[0]?.price).toBe("9");
    const context = vi.mocked(log.deviation).mock.calls[0]?.[0];
    expect(context?.outcome).toBe(CreemPriceOutcome.CatalogUnavailable);
    expect(context?.errorCode).toBe("MC-SYS-0001");
    expect(context?.tiersServedFromDatabase).toBe(1);
  });

  it("says the key is missing rather than blaming Creem for being down", async () => {
    mockedCatalog.mockRejectedValue(new Error("Missing required environment variable: CREEM_API_KEY. Set it ..."));

    await enrichTiersWithCreemPrices([makeTier({ id: "tier_club", price: "9" })]);

    expect(vi.mocked(log.deviation).mock.calls[0]?.[0]?.outcome).toBe(CreemPriceOutcome.NotConfigured);
  });

  it("says nothing when the catalogue answers, because that is not a deviation", async () => {
    mockedCatalog.mockResolvedValue({ tier_club: { month: { productId: "p", price: 900, currency: "EUR" } } });

    await enrichTiersWithCreemPrices([makeTier({ id: "tier_club", price: "1" })]);

    expect(log.deviation).not.toHaveBeenCalled();
  });
});
