/**
 * @file Unit tests for {@link getCreemCatalog} (MC-110, Task 7).
 *
 * Every external dependency is fully mocked:
 * - `getTierRepository` from `../db/index.js` returns a stub with
 *   `listCreemProductMappings`.
 * - `getCreemClient` from `./creem-client.js` returns a stub with
 *   `products.get`.
 * - `getSellingMode` from `./creem-selling-mode.js` decides the environment the
 *   shop sells from, which the real implementation reads from a setting.
 *
 * The cases under test:
 * 1. A fresh call builds the catalog map from the mapping + Creem prices.
 * 2. A second call within the TTL is served from the in-memory cache (no
 *    additional DB or Creem calls).
 * 3. After the TTL elapses the next call re-fetches from DB and Creem.
 * 4. Only the selling environment's mappings are read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTierRepository } from "../db/index.js";
import { CreemMode, type CreemModeValue } from "../lib/creem-config.js";
import { log } from "../lib/infra/logger.js";
import { CreemPriceOutcome, getCreemCatalog, resetCreemCatalogCache } from "./creem-catalog.js";
import { getCreemClient } from "./creem-client.js";
import { getSellingMode } from "./creem-selling-mode.js";

vi.mock("../db/index.js", () => ({
  getTierRepository: vi.fn(),
}));

vi.mock("./creem-client.js", () => ({
  getCreemClient: vi.fn(),
}));

vi.mock("./creem-selling-mode.js", () => ({ getSellingMode: vi.fn() }));

vi.mock("../lib/infra/logger.js", () => ({
  log: { deviation: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Sets up a fresh set of mocks for each test.
 *
 * @param mode - The Creem environment the process should appear to run in.
 */
function buildMocks(mode: CreemModeValue = CreemMode.Test) {
  const listCreemProductMappings = vi
    .fn()
    .mockResolvedValue([{ tierId: "tier_club", billingPeriod: "every-month", mode, creemProductId: "prod_1" }]);

  vi.mocked(getTierRepository).mockResolvedValue({
    listCreemProductMappings,
  } as never);

  const productsGet = vi.fn().mockResolvedValue({ price: 900, currency: "EUR" });

  vi.mocked(getCreemClient).mockReturnValue({
    products: { get: productsGet },
  } as never);

  vi.mocked(getSellingMode).mockResolvedValue(mode);

  return { listCreemProductMappings, productsGet };
}

beforeEach(() => {
  resetCreemCatalogCache();
  vi.clearAllMocks();
  // Every test needs a selling mode, because the catalog reads the mappings of
  // one environment. Tests that are not about the mode take the sandbox.
  vi.mocked(getSellingMode).mockResolvedValue(CreemMode.Test);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getCreemCatalog (MC-110)", () => {
  it("builds the catalog map from the DB mapping and live Creem prices", async () => {
    buildMocks();
    const catalog = await getCreemCatalog();
    expect(catalog).toEqual({
      tier_club: {
        "every-month": { productId: "prod_1", price: 900, currency: "EUR" },
      },
    });
  });

  it("returns the cached catalog on a second call within the TTL (no extra DB or Creem calls)", async () => {
    const { listCreemProductMappings, productsGet } = buildMocks();

    await getCreemCatalog();
    await getCreemCatalog();

    expect(listCreemProductMappings).toHaveBeenCalledTimes(1);
    expect(productsGet).toHaveBeenCalledTimes(1);
  });

  it("re-fetches from DB and Creem after the TTL has elapsed", async () => {
    vi.useFakeTimers();

    const { listCreemProductMappings, productsGet } = buildMocks();

    await getCreemCatalog();

    // Advance past the 5-minute TTL.
    vi.setSystemTime(Date.now() + 6 * 60_000);

    // Reset the module-level cache manually between the two fetches because
    // the fake-timer advance is not enough on its own -- the cache uses
    // Date.now() which is now controlled by fake timers.
    // The second fetch must re-read the mocks, so we just call again.
    await getCreemCatalog();

    expect(listCreemProductMappings).toHaveBeenCalledTimes(2);
    expect(productsGet).toHaveBeenCalledTimes(2);
  });

  it("reads only the mappings of the environment the shop sells from", async () => {
    const { listCreemProductMappings } = buildMocks(CreemMode.Test);
    await getCreemCatalog();
    expect(listCreemProductMappings).toHaveBeenCalledWith(CreemMode.Test);

    resetCreemCatalogCache();
    const live = buildMocks(CreemMode.Live);
    await getCreemCatalog();
    expect(live.listCreemProductMappings).toHaveBeenCalledWith(CreemMode.Live);
  });
});

describe("getCreemCatalog: one bad product does not cost every tier its price", () => {
  it("keeps the tiers whose products answered and reports the one that did not", async () => {
    vi.mocked(getTierRepository).mockResolvedValue({
      listCreemProductMappings: vi.fn().mockResolvedValue([
        { tierId: "tier_club", billingPeriod: "every-month", mode: CreemMode.Test, creemProductId: "prod_gone" },
        { tierId: "tier_pro", billingPeriod: "every-month", mode: CreemMode.Test, creemProductId: "prod_ok" },
      ]),
    } as never);
    vi.mocked(getCreemClient).mockReturnValue({
      products: {
        get: vi.fn(async (id: string) => {
          if (id === "prod_gone") throw new Error("404 product not found");
          return { price: 4900, currency: "EUR" };
        }),
      },
    } as never);

    const catalog = await getCreemCatalog();

    // The healthy tier keeps its live price; the broken one is simply absent,
    // which is what leaves it on its database price one level up.
    expect(catalog.tier_pro?.["every-month"]?.price).toBe(4900);
    expect(catalog.tier_club).toBeUndefined();

    const context = vi.mocked(log.deviation).mock.calls[0]?.[0];
    expect(context?.outcome).toBe(CreemPriceOutcome.ProductUnavailable);
    expect(context?.tierId).toBe("tier_club");
    expect(context?.mode).toBe(CreemMode.Test);
    expect(context?.creemProductId).toBe("prod_gone");
  });
});
