/**
 * @file Route test for the public plan catalogue.
 *
 * The catalogue is the one place that says which plans are free and which a
 * developer may put a project on, so both the pricing page and the plan step
 * can read the answers instead of each working them out. Those two flags are
 * what this asserts.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTierRepo = {
  listTiers: vi.fn(),
  listAllOffers: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getTierRepository: async () => mockTierRepo,
}));

vi.mock("../services/tier-pricing.js", () => ({
  // Creem pricing is a separate concern with its own tests; here it passes
  // the catalogue through so the two flags are the only variables.
  enrichTiersWithCreemPrices: async (tiers: unknown[]) => tiers,
}));

import publicTiersRoutes from "./public-tiers.js";

function makeTier(overrides: Record<string, unknown> = {}) {
  return {
    id: "tier_free",
    name: "Free",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    enabled: true,
    disableReason: "",
    ...overrides,
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.addSchema({ $id: "PublicTier", type: "object", additionalProperties: true });
  await app.register(publicTiersRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTierRepo.listAllOffers.mockResolvedValue([]);
});

/** Requests the catalogue and returns the plan with the given id. */
async function catalogueEntry(id: string) {
  const app = await buildApp();
  const response = await app.inject({ method: "GET", url: ENDPOINTS.v1.tiers });
  expect(response.statusCode).toBe(200);
  return response.json().find((tier: { id: string }) => tier.id === id);
}

describe("GET /api/v1/tiers", () => {
  it("marks the free plan as free and as one a developer may choose", async () => {
    mockTierRepo.listTiers.mockResolvedValue([makeTier()]);

    const entry = await catalogueEntry("tier_free");

    expect(entry.free).toBe(true);
    expect(entry.selfServiceAssignable).toBe(true);
  });

  it("marks a plan with an offer as paid and as one a developer may not choose yet", async () => {
    mockTierRepo.listTiers.mockResolvedValue([makeTier(), makeTier({ id: "tier_pro", name: "Pro" })]);
    mockTierRepo.listAllOffers.mockResolvedValue([{ tierId: "tier_pro", billingPeriod: "every-month" }]);

    const entry = await catalogueEntry("tier_pro");

    expect(entry.free).toBe(false);
    expect(entry.selfServiceAssignable).toBe(false);
  });

  it("marks a plan sold only yearly as paid, though it has no monthly price", async () => {
    mockTierRepo.listTiers.mockResolvedValue([makeTier({ id: "tier_annual", name: "Annual" })]);
    mockTierRepo.listAllOffers.mockResolvedValue([{ tierId: "tier_annual", billingPeriod: "every-year" }]);

    expect((await catalogueEntry("tier_annual")).free).toBe(false);
  });

  it("marks tier_free with an offer as paid, because the rule reads offers rather than the id", async () => {
    mockTierRepo.listTiers.mockResolvedValue([makeTier()]);
    mockTierRepo.listAllOffers.mockResolvedValue([{ tierId: "tier_free", billingPeriod: "every-month" }]);

    const entry = await catalogueEntry("tier_free");

    expect(entry.free).toBe(false);
    expect(entry.selfServiceAssignable).toBe(false);
  });

  it("keeps a disabled free plan free, but not one a developer may choose", async () => {
    mockTierRepo.listTiers.mockResolvedValue([makeTier({ enabled: false })]);

    const entry = await catalogueEntry("tier_free");

    expect(entry.free).toBe(true);
    expect(entry.selfServiceAssignable).toBe(false);
  });
});
