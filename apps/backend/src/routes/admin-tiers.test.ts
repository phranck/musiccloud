/**
 * Route tests for the admin tier CRUD surface (`/api/admin/developer/tiers`,
 * MC-092). Drives the real route handlers through `app.inject` against a
 * Fastify instance with mocked persistence.
 */
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tier } from "../db/tiers-repository.js";

vi.stubEnv("DISABLE_RATE_LIMIT", "true");

const freeTier: Tier = {
  id: "tier_free",
  name: "Free",
  requestsPerMinute: 60,
  requestsPerDay: 10000,
  attributionRequired: false,
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
  features: [],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const mockTierRepo = {
  listTiers: vi.fn(),
  createTier: vi.fn(),
  updateTier: vi.fn(),
  deleteTier: vi.fn(),
};

const mockAdminRepo = {
  findAdminById: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getTierRepository: async () => mockTierRepo,
  getAdminRepository: async () => mockAdminRepo,
  getRepository: async () => ({}),
  getDeveloperRepository: async () => ({}),
  getApiAccessRepository: async () => ({}),
  getCcRepository: async () => ({}),
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(jwt, { secret: "test-secret" });
  await app.register(cookie);

  app.decorate("authenticateAdmin", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      // let the route handler's own role gate reject
    }
  });

  // Simulate the adminRoutes scope from server.ts
  await app.register(async function adminRoutes(adminApp: FastifyInstance) {
    adminApp.addHook("preHandler", adminApp.authenticateAdmin);
    const { adminTiersRoutes } = await import("./admin-tiers.js");
    await adminApp.register(adminTiersRoutes);
  });

  return app;
}

function bearerToken(role = "admin"): string {
  return app.jwt.sign({ sub: "admin-1", role });
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role: "admin" });
});

describe("GET /api/admin/developer/tiers", () => {
  it("returns the tier list sorted by sort_order", async () => {
    mockTierRepo.listTiers.mockResolvedValue([freeTier]);
    const res = await app.inject({
      method: "GET",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([freeTier]);
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: ENDPOINTS.admin.developer.tiers,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /api/admin/developer/tiers", () => {
  it("creates a tier and returns 201", async () => {
    const created = { ...freeTier, id: "tier_pro", name: "Pro" };
    mockTierRepo.createTier.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(created);
  });

  it("rejects missing name", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { requestsPerMinute: 120, requestsPerDay: 50000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a valid hex color", async () => {
    const created = { ...freeTier, id: "tier_pro", name: "Pro", color: "#3b82f6" };
    mockTierRepo.createTier.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, color: "#3b82f6" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(created);
  });

  it("rejects an invalid color", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, color: "red" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a description", async () => {
    const created = { ...freeTier, id: "tier_pro", name: "Pro", description: "For hobby projects." };
    mockTierRepo.createTier.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, description: "For hobby projects." },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(created);
  });

  it("rejects a description longer than 500 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, description: "x".repeat(501) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates a disabled tier with a reason", async () => {
    const created = {
      ...freeTier,
      id: "tier_legacy",
      name: "Legacy",
      enabled: false,
      disableReason: "No longer offered.",
    };
    mockTierRepo.createTier.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: {
        name: "Legacy",
        requestsPerMinute: 120,
        requestsPerDay: 50000,
        enabled: false,
        disableReason: "No longer offered.",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(created);
  });

  it("passes monthly and yearly prices through to the repository", async () => {
    const created = { ...freeTier, id: "tier_pro", name: "Pro", price: "9", priceYearly: "90" };
    mockTierRepo.createTier.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, price: "9", priceYearly: "90" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockTierRepo.createTier).toHaveBeenCalledWith(expect.objectContaining({ price: "9", priceYearly: "90" }));
    expect(res.json()).toEqual(created);
  });

  it("passes a valid icon through and rejects an invalid one", async () => {
    const created = { ...freeTier, id: "tier_pro", name: "Pro", icon: "Crown1" };
    mockTierRepo.createTier.mockResolvedValue(created);
    const ok = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, icon: "Crown1" },
    });
    expect(ok.statusCode).toBe(201);
    expect(mockTierRepo.createTier).toHaveBeenCalledWith(expect.objectContaining({ icon: "Crown1" }));

    const bad = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, icon: "NotAnIcon" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("passes a custom button label through and rejects one longer than 40 characters", async () => {
    const created = { ...freeTier, id: "tier_pro", name: "Pro", buttonLabel: "Count me in" };
    mockTierRepo.createTier.mockResolvedValue(created);
    const ok = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, buttonLabel: "Count me in" },
    });
    expect(ok.statusCode).toBe(201);
    expect(mockTierRepo.createTier).toHaveBeenCalledWith(expect.objectContaining({ buttonLabel: "Count me in" }));

    const bad = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, buttonLabel: "x".repeat(41) },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("rejects a disable reason longer than 200 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, disableReason: "x".repeat(201) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("passes recommended through and rejects a non-boolean", async () => {
    const created = { ...freeTier, id: "tier_pro", name: "Pro", recommended: true };
    mockTierRepo.createTier.mockResolvedValue(created);
    const ok = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, recommended: true },
    });
    expect(ok.statusCode).toBe(201);
    expect(mockTierRepo.createTier).toHaveBeenCalledWith(expect.objectContaining({ recommended: true }));

    const bad = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Pro", requestsPerMinute: 120, requestsPerDay: 50000, recommended: "yes" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("passes features through and rejects malformed features", async () => {
    const created = { ...freeTier, id: "tier_pro", name: "Pro" };
    mockTierRepo.createTier.mockResolvedValue(created);
    const ok = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: {
        name: "Pro",
        requestsPerMinute: 120,
        requestsPerDay: 50000,
        features: [{ label: "Commercial use", included: true }],
      },
    });
    expect(ok.statusCode).toBe(201);
    expect(mockTierRepo.createTier).toHaveBeenCalledWith(
      expect.objectContaining({ features: [{ label: "Commercial use", included: true }] }),
    );

    const bad = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.tiers,
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: {
        name: "Pro",
        requestsPerMinute: 120,
        requestsPerDay: 50000,
        features: [{ label: "Missing included flag" }],
      },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("PATCH /api/admin/developer/tiers/:id", () => {
  it("updates a tier", async () => {
    const updated = { ...freeTier, name: "Free v2" };
    mockTierRepo.updateTier.mockResolvedValue(updated);
    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.tierDetail("tier_free"),
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { name: "Free v2" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(updated);
  });

  it("updates the yearly price", async () => {
    const updated = { ...freeTier, priceYearly: "90" };
    mockTierRepo.updateTier.mockResolvedValue(updated);
    const res = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.tierDetail("tier_free"),
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { priceYearly: "90" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockTierRepo.updateTier).toHaveBeenCalledWith("tier_free", { priceYearly: "90" });
    expect(res.json()).toEqual(updated);
  });

  it("passes recommended through and rejects a non-boolean", async () => {
    const updated = { ...freeTier, recommended: true };
    mockTierRepo.updateTier.mockResolvedValue(updated);
    const ok = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.tierDetail("tier_free"),
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { recommended: true },
    });
    expect(ok.statusCode).toBe(200);
    expect(mockTierRepo.updateTier).toHaveBeenCalledWith("tier_free", { recommended: true });

    const bad = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.tierDetail("tier_free"),
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: { recommended: "yes" },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("DELETE /api/admin/developer/tiers/:id", () => {
  it("deletes a tier and returns 204", async () => {
    mockTierRepo.deleteTier.mockResolvedValue(undefined);
    const res = await app.inject({
      method: "DELETE",
      url: ENDPOINTS.admin.developer.tierDetail("tier_free"),
      headers: { authorization: `Bearer ${bearerToken()}` },
    });
    expect(res.statusCode).toBe(204);
  });
});
