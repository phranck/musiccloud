/**
 * @file Unit tests for {@link resolveSignupTierId} (MC-109, Plan A).
 *
 * Verifies the "always assign a tier, never grant paid for free" invariant:
 * - `undefined`/`null`/unknown id → `"tier_free"`
 * - explicit `"tier_free"` request → `"tier_free"`
 * - any paid tier requested → `"tier_free"` (Plan A: only free is assignable)
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { getTierRepository } from "../db/index.js";
import type { Tier, TierRepository } from "../db/tiers-repository.js";
import { resolveSignupTierId, TIER_FREE_ID } from "./signup-tier.js";

vi.mock("../db/index.js", () => ({
  getTierRepository: vi.fn(),
}));

/**
 * Builds a complete {@link Tier} DTO with sensible defaults that any test can
 * override field-by-field.
 *
 * @param overrides - Partial tier fields to override the defaults.
 * @returns A fully populated tier DTO.
 */
function makeTier(overrides: Partial<Tier> = {}): Tier {
  return {
    id: "tier_free",
    name: "Free",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: true,
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
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/**
 * Wires {@link getTierRepository} mock to return the given tier list.
 *
 * @param tiers - Tiers to return from `listTiers()`.
 */
function mockListTiers(tiers: Tier[]): void {
  vi.mocked(getTierRepository).mockResolvedValue({
    listTiers: vi.fn(async () => tiers),
  } as unknown as TierRepository);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("TIER_FREE_ID", () => {
  it("equals the seeded free-tier id", () => {
    expect(TIER_FREE_ID).toBe("tier_free");
  });
});

describe("resolveSignupTierId", () => {
  const freeTier = makeTier({ id: "tier_free" });
  const paidTier = makeTier({ id: "tier_pro", name: "Pro", price: "9", attributionRequired: false });

  it("returns tier_free when requestedTierId is undefined", async () => {
    mockListTiers([freeTier, paidTier]);
    await expect(resolveSignupTierId(undefined)).resolves.toBe("tier_free");
  });

  it("returns tier_free when requestedTierId is null", async () => {
    mockListTiers([freeTier, paidTier]);
    await expect(resolveSignupTierId(null)).resolves.toBe("tier_free");
  });

  it("returns tier_free when requestedTierId is explicitly tier_free", async () => {
    mockListTiers([freeTier, paidTier]);
    await expect(resolveSignupTierId("tier_free")).resolves.toBe("tier_free");
  });

  it("falls back to tier_free when a paid tier is requested (Plan A: not assignable)", async () => {
    mockListTiers([freeTier, paidTier]);
    await expect(resolveSignupTierId("tier_pro")).resolves.toBe("tier_free");
  });

  it("falls back to tier_free when an unknown id is requested", async () => {
    mockListTiers([freeTier, paidTier]);
    await expect(resolveSignupTierId("tier_nonexistent")).resolves.toBe("tier_free");
  });

  it("falls back to tier_free even when no tiers are returned from the repository", async () => {
    mockListTiers([]);
    await expect(resolveSignupTierId("tier_free")).resolves.toBe("tier_free");
  });
});
