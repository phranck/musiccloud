/**
 * @file Unit tests for the free-plan rule and for {@link resolveSignupTierId}.
 *
 * A plan is free when it has no offer, and a developer may choose it when it
 * is also enabled. Signup always assigns a tier and never grants a plan with
 * a price: an absent, unknown or priced request resolves to `tier_free`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { getTierRepository } from "../db/index.js";
import type { Tier, TierOffer, TierRepository } from "../db/tiers-repository.js";
import {
  isFreeTier,
  isSelfServiceAssignableTier,
  listSelfServiceAssignableTiers,
  resolveSignupTierId,
  TIER_FREE_ID,
} from "./signup-tier.js";

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
    color: "#64748b",
    icon: null,
    buttonLabel: null,
    description: "",
    enabled: true,
    disableReason: "",
    recommended: false,
    sortOrder: 0,
    features: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/**
 * Wires {@link getTierRepository} mock to return the given plans and offers.
 *
 * @param tiers - Plans to return from `listTiers()`.
 * @param offers - Offers to return from `listAllOffers()`; none by default.
 */
function mockListTiers(tiers: Tier[], offers: Array<Pick<TierOffer, "tierId">> = []): void {
  vi.mocked(getTierRepository).mockResolvedValue({
    listTiers: vi.fn(async () => tiers),
    listAllOffers: vi.fn(async () => offers),
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

describe("isFreeTier and isSelfServiceAssignableTier", () => {
  it("call a plan without an offer free and, when it is enabled, assignable", () => {
    const plan = makeTier({ id: "tier_hobby" });

    expect(isFreeTier(plan, [{ tierId: "tier_other" }])).toBe(true);
    expect(isSelfServiceAssignableTier(plan, [])).toBe(true);
  });

  it("call tier_free with a monthly offer neither free nor assignable, because it now has a price", () => {
    const plan = makeTier({ id: TIER_FREE_ID });
    const offers = [{ tierId: TIER_FREE_ID }];

    expect(isFreeTier(plan, offers)).toBe(false);
    expect(isSelfServiceAssignableTier(plan, offers)).toBe(false);
  });

  it("keep a disabled free plan free but not assignable", () => {
    const plan = makeTier({ enabled: false });

    expect(isFreeTier(plan, [])).toBe(true);
    expect(isSelfServiceAssignableTier(plan, [])).toBe(false);
  });
});

describe("listSelfServiceAssignableTiers", () => {
  it("lists every enabled plan without an offer, whatever its id", async () => {
    const hobby = makeTier({ id: "tier_hobby", name: "Hobby" });
    const pro = makeTier({ id: "tier_pro", name: "Pro" });
    mockListTiers([makeTier(), hobby, pro], [{ tierId: "tier_pro" }]);

    expect((await listSelfServiceAssignableTiers()).map((tier) => tier.id)).toEqual([TIER_FREE_ID, "tier_hobby"]);
  });
});

describe("resolveSignupTierId", () => {
  const freeTier = makeTier({ id: "tier_free" });
  const paidTier = makeTier({ id: "tier_pro", name: "Pro", attributionRequired: false });
  const paidOffers = [{ tierId: "tier_pro" }];

  it("returns tier_free when requestedTierId is undefined", async () => {
    mockListTiers([freeTier, paidTier], paidOffers);
    await expect(resolveSignupTierId(undefined)).resolves.toBe("tier_free");
  });

  it("returns tier_free when requestedTierId is null", async () => {
    mockListTiers([freeTier, paidTier], paidOffers);
    await expect(resolveSignupTierId(null)).resolves.toBe("tier_free");
  });

  it("returns tier_free when requestedTierId is explicitly tier_free", async () => {
    mockListTiers([freeTier, paidTier], paidOffers);
    await expect(resolveSignupTierId("tier_free")).resolves.toBe("tier_free");
  });

  it("falls back to tier_free when a paid tier is requested (Plan A: not assignable)", async () => {
    mockListTiers([freeTier, paidTier], paidOffers);
    await expect(resolveSignupTierId("tier_pro")).resolves.toBe("tier_free");
  });

  it("falls back to tier_free when an unknown id is requested", async () => {
    mockListTiers([freeTier, paidTier], paidOffers);
    await expect(resolveSignupTierId("tier_nonexistent")).resolves.toBe("tier_free");
  });

  it("falls back to tier_free even when no tiers are returned from the repository", async () => {
    mockListTiers([]);
    await expect(resolveSignupTierId("tier_free")).resolves.toBe("tier_free");
  });
});
