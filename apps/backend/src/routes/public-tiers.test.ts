/**
 * @file Route test for the public plan catalogue.
 *
 * The catalogue is the one place that says which plans a developer may put a
 * project on, so both the pricing page and the plan step can read the answer
 * instead of each working it out. That flag is what this asserts.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTierRepo = {
  listTiers: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getTierRepository: async () => mockTierRepo,
}));

vi.mock("../services/tier-pricing.js", () => ({
  // Creem pricing is a separate concern with its own tests; here it passes
  // the catalogue through so the assignability flag is the only variable.
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
});

describe("GET /api/v1/tiers", () => {
  it("marks the free plan as one a developer may choose", async () => {
    mockTierRepo.listTiers.mockResolvedValue([makeTier()]);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: ENDPOINTS.v1.tiers });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0].selfServiceAssignable).toBe(true);
  });

  it("marks a paid plan as one a developer may not choose yet", async () => {
    mockTierRepo.listTiers.mockResolvedValue([makeTier(), makeTier({ id: "tier_pro", name: "Pro" })]);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: ENDPOINTS.v1.tiers });

    const body = response.json();
    expect(body.find((tier: { id: string }) => tier.id === "tier_pro").selfServiceAssignable).toBe(false);
  });

  it("marks a disabled free plan as one a developer may not choose", async () => {
    mockTierRepo.listTiers.mockResolvedValue([makeTier({ enabled: false })]);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: ENDPOINTS.v1.tiers });

    expect(response.json()[0].selfServiceAssignable).toBe(false);
  });
});
