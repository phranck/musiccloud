/**
 * Route tests for the admin Creem product surface
 * (`/api/admin/developer/creem-products`). Drives the real handlers through
 * `app.inject` against a Fastify instance with Creem and persistence mocked.
 *
 * Creem itself is never reached: `createCreemProduct`, `updateCreemProductPrice`
 * and `archiveCreemProduct` are stubbed, which is what lets the archive test
 * assert the half that matters, namely that a refused archive leaves the
 * mapping row in place.
 */
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tier } from "../db/tiers-repository.js";
import { CreemMode } from "../lib/creem-config.js";

vi.stubEnv("DISABLE_RATE_LIMIT", "true");

const paidTier: Tier = {
  id: "tier_club",
  name: "Club",
  requestsPerMinute: 60,
  requestsPerDay: 10000,
  attributionRequired: false,
  price: "9.90",
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

const freeTier: Tier = { ...paidTier, id: "tier_free", name: "Free", price: null };

const mockTierRepo = {
  listTiers: vi.fn(),
  listAllCreemProductMappings: vi.fn(),
  findCreemProductMapping: vi.fn(),
  createCreemProductMapping: vi.fn(),
  deleteCreemProductMapping: vi.fn(),
};

const mockAdminRepo = { findAdminById: vi.fn() };

vi.mock("../db/index.js", () => ({
  getTierRepository: async () => mockTierRepo,
  getAdminRepository: async () => mockAdminRepo,
  getRepository: async () => ({}),
  getDeveloperRepository: async () => ({}),
  getApiAccessRepository: async () => ({}),
  getCcRepository: async () => ({}),
}));

vi.mock("../lib/creem-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/creem-config.js")>()),
  getCreemConfig: vi.fn(() => ({ apiKey: "creem_test_stub", mode: "test", webhookSecret: undefined })),
}));

vi.mock("../services/creem-products.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/creem-products.js")>()),
  createCreemProduct: vi.fn(),
  updateCreemProductPrice: vi.fn(),
  archiveCreemProduct: vi.fn(),
}));

import {
  archiveCreemProduct,
  CreemProductError,
  createCreemProduct,
  updateCreemProductPrice,
} from "../services/creem-products.js";

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

  await app.register(async function adminRoutes(adminApp: FastifyInstance) {
    adminApp.addHook("preHandler", adminApp.authenticateAdmin);
    const { adminCreemProductRoutes } = await import("./admin-creem-products.js");
    await adminApp.register(adminCreemProductRoutes);
  });

  return app;
}

let app: FastifyInstance;

function bearerToken(role = "admin"): string {
  return app.jwt.sign({ sub: "admin-1", role });
}

/** Builds an authenticated request against the collection endpoint. */
function post(body: unknown) {
  return app.inject({
    method: "POST",
    url: ENDPOINTS.admin.developer.creemProducts,
    headers: { authorization: `Bearer ${bearerToken()}` },
    payload: body as never,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role: "admin" });
  mockTierRepo.listTiers.mockResolvedValue([paidTier, freeTier]);
  mockTierRepo.findCreemProductMapping.mockResolvedValue(null);
});

describe("GET /api/admin/developer/creem-products", () => {
  it("returns both environments and says which one this backend can write to", async () => {
    const products = [
      { tierId: "tier_club", interval: "month", mode: CreemMode.Test, creemProductId: "prod_test1" },
      { tierId: "tier_club", interval: "month", mode: CreemMode.Live, creemProductId: "prod_live1" },
    ];
    mockTierRepo.listAllCreemProductMappings.mockResolvedValue(products);

    const res = await app.inject({
      method: "GET",
      url: ENDPOINTS.admin.developer.creemProducts,
      headers: { authorization: `Bearer ${bearerToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mode: CreemMode.Test, products });
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({ method: "GET", url: ENDPOINTS.admin.developer.creemProducts });
    expect(res.statusCode).toBe(403);
    expect(mockTierRepo.listAllCreemProductMappings).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/developer/creem-products", () => {
  it("creates the product at Creem and records the mapping in the running environment", async () => {
    vi.mocked(createCreemProduct).mockResolvedValue({ id: "prod_new", price: 990, currency: "EUR", status: "active" });

    const res = await post({ tierId: "tier_club", interval: "month" });

    expect(res.statusCode).toBe(201);
    expect(vi.mocked(createCreemProduct).mock.calls[0]?.[0]).toEqual({
      name: "musiccloud Club (monthly)",
      description: "musiccloud Club API tier, billed monthly.",
      priceCents: 990,
      currency: "EUR",
      billingPeriod: "every-month",
    });
    expect(mockTierRepo.createCreemProductMapping).toHaveBeenCalledWith({
      tierId: "tier_club",
      interval: "month",
      mode: CreemMode.Test,
      creemProductId: "prod_new",
    });
  });

  it("refuses a free plan, because Creem rejects a recurring product priced at zero", async () => {
    const res = await post({ tierId: "tier_free", interval: "month" });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("MC-BILL-0005");
    expect(createCreemProduct).not.toHaveBeenCalled();
    expect(mockTierRepo.createCreemProductMapping).not.toHaveBeenCalled();
  });

  it("refuses a yearly product for a plan that has no yearly price", async () => {
    const res = await post({ tierId: "tier_club", interval: "year" });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("MC-BILL-0005");
    expect(createCreemProduct).not.toHaveBeenCalled();
  });

  it("refuses a second product for the same plan, interval and environment", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue({
      tierId: "tier_club",
      interval: "month",
      mode: CreemMode.Test,
      creemProductId: "prod_existing",
    });

    const res = await post({ tierId: "tier_club", interval: "month" });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("MC-BILL-0004");
    expect(createCreemProduct).not.toHaveBeenCalled();
  });

  it("records a product created in the Creem dashboard without creating another", async () => {
    const res = await post({ tierId: "tier_club", interval: "month", creemProductId: "prod_madeByHand" });

    expect(res.statusCode).toBe(201);
    expect(createCreemProduct).not.toHaveBeenCalled();
    expect(mockTierRepo.createCreemProductMapping).toHaveBeenCalledWith({
      tierId: "tier_club",
      interval: "month",
      mode: CreemMode.Test,
      creemProductId: "prod_madeByHand",
    });
  });

  it("rejects a product id that is not shaped like one Creem issues", async () => {
    const res = await post({ tierId: "tier_club", interval: "month", creemProductId: "../../etc/passwd" });

    expect(res.statusCode).toBe(400);
    expect(mockTierRepo.createCreemProductMapping).not.toHaveBeenCalled();
  });

  it("records no mapping when Creem refused to create the product", async () => {
    vi.mocked(createCreemProduct).mockRejectedValue(new CreemProductError("MC-BILL-0001", "Creem refused"));

    const res = await post({ tierId: "tier_club", interval: "month" });

    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("MC-BILL-0001");
    expect(mockTierRepo.createCreemProductMapping).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.creemProducts,
      payload: { tierId: "tier_club", interval: "month" },
    });
    expect(res.statusCode).toBe(403);
    expect(createCreemProduct).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/developer/creem-products/:tierId/:interval", () => {
  const mapping = {
    tierId: "tier_club",
    interval: "month",
    mode: CreemMode.Test,
    creemProductId: "prod_existing",
  };

  function reprice(body: unknown) {
    return app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.creemProductDetail("tier_club", "month"),
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: body as never,
    });
  }

  it("changes the price at Creem and keeps the product id", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue(mapping);
    vi.mocked(updateCreemProductPrice).mockResolvedValue({
      id: "prod_existing",
      price: 1490,
      currency: "EUR",
      status: "active",
    });

    const res = await reprice({ priceCents: 1490 });

    expect(res.statusCode).toBe(200);
    expect(updateCreemProductPrice).toHaveBeenCalledWith("prod_existing", 1490);
    expect(res.json().creemProductId).toBe("prod_existing");
    expect(res.json().price).toBe(1490);
  });

  it("refuses a price below the one whole unit Creem requires", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue(mapping);

    const res = await reprice({ priceCents: 99 });

    expect(res.statusCode).toBe(400);
    expect(updateCreemProductPrice).not.toHaveBeenCalled();
  });

  it("reports the failure when Creem refused the change", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue(mapping);
    vi.mocked(updateCreemProductPrice).mockRejectedValue(new CreemProductError("MC-BILL-0002", "Creem refused"));

    const res = await reprice({ priceCents: 1490 });

    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("MC-BILL-0002");
  });

  it("answers 404 when that plan and interval has no product in this environment", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue(null);

    const res = await reprice({ priceCents: 1490 });

    expect(res.statusCode).toBe(404);
    expect(updateCreemProductPrice).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/developer/creem-products/:tierId/:interval", () => {
  const mapping = {
    tierId: "tier_club",
    interval: "month",
    mode: CreemMode.Test,
    creemProductId: "prod_existing",
  };

  function remove() {
    return app.inject({
      method: "DELETE",
      url: ENDPOINTS.admin.developer.creemProductDetail("tier_club", "month"),
      headers: { authorization: `Bearer ${bearerToken()}` },
    });
  }

  it("archives at Creem and removes the mapping as one operation", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue(mapping);
    vi.mocked(archiveCreemProduct).mockResolvedValue(undefined);

    const res = await remove();

    expect(res.statusCode).toBe(204);
    expect(archiveCreemProduct).toHaveBeenCalledWith("prod_existing");
    expect(mockTierRepo.deleteCreemProductMapping).toHaveBeenCalledWith({
      tierId: "tier_club",
      interval: "month",
      mode: CreemMode.Test,
    });
  });

  it("keeps the mapping when Creem refused to archive, so the price on the page stays buyable", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue(mapping);
    vi.mocked(archiveCreemProduct).mockRejectedValue(new CreemProductError("MC-BILL-0003", "Creem refused"));

    const res = await remove();

    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("MC-BILL-0003");
    expect(mockTierRepo.deleteCreemProductMapping).not.toHaveBeenCalled();
  });

  it("answers 404 when that plan and interval has no product in this environment", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue(null);

    const res = await remove();

    expect(res.statusCode).toBe(404);
    expect(archiveCreemProduct).not.toHaveBeenCalled();
  });
});
