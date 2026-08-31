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
  getCreemConfig: vi.fn(() => ({ apiKeys: { test: "creem_test_stub" }, webhookSecret: undefined })),
  configuredCreemModes: vi.fn(() => ["test"]),
}));

vi.mock("../services/creem-catalog.js", () => ({ resetCreemCatalogCache: vi.fn() }));

vi.mock("../services/creem-selling-mode.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/creem-selling-mode.js")>()),
  getSellingMode: vi.fn(async () => "test"),
  setSellingMode: vi.fn(async () => null),
}));

vi.mock("../services/creem-products.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/creem-products.js")>()),
  createCreemProduct: vi.fn(),
  updateCreemProductPrice: vi.fn(),
  archiveCreemProduct: vi.fn(),
}));

import { resetCreemCatalogCache } from "../services/creem-catalog.js";
import {
  archiveCreemProduct,
  CreemProductError,
  createCreemProduct,
  updateCreemProductPrice,
} from "../services/creem-products.js";
import { getSellingMode, SellingModeRefusal, setSellingMode } from "../services/creem-selling-mode.js";

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
  it("returns both environments and says which ones this deployment can act on", async () => {
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
    expect(res.json()).toEqual({ writableModes: [CreemMode.Test], products });
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

    const res = await post({ tierId: "tier_club", interval: "month", mode: CreemMode.Test });

    expect(res.statusCode).toBe(201);
    expect(vi.mocked(createCreemProduct).mock.calls[0]?.[0]).toBe(CreemMode.Test);
    expect(vi.mocked(createCreemProduct).mock.calls[0]?.[1]).toEqual({
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
    const res = await post({ tierId: "tier_free", interval: "month", mode: CreemMode.Test });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("MC-BILL-0005");
    expect(createCreemProduct).not.toHaveBeenCalled();
    expect(mockTierRepo.createCreemProductMapping).not.toHaveBeenCalled();
  });

  it("refuses a yearly product for a plan that has no yearly price", async () => {
    const res = await post({ tierId: "tier_club", interval: "year", mode: CreemMode.Test });

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

    const res = await post({ tierId: "tier_club", interval: "month", mode: CreemMode.Test });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("MC-BILL-0004");
    expect(createCreemProduct).not.toHaveBeenCalled();
  });

  it("records a product created in the Creem dashboard without creating another", async () => {
    const res = await post({
      tierId: "tier_club",
      interval: "month",
      mode: CreemMode.Test,
      creemProductId: "prod_madeByHand",
    });

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
    const res = await post({
      tierId: "tier_club",
      interval: "month",
      mode: CreemMode.Test,
      creemProductId: "../../etc/passwd",
    });

    expect(res.statusCode).toBe(400);
    expect(mockTierRepo.createCreemProductMapping).not.toHaveBeenCalled();
  });

  it("records no mapping when Creem refused to create the product", async () => {
    vi.mocked(createCreemProduct).mockRejectedValue(new CreemProductError("MC-BILL-0001", "Creem refused"));

    const res = await post({ tierId: "tier_club", interval: "month", mode: CreemMode.Test });

    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("MC-BILL-0001");
    expect(mockTierRepo.createCreemProductMapping).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.creemProducts,
      payload: { tierId: "tier_club", interval: "month", mode: CreemMode.Test },
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
      url: ENDPOINTS.admin.developer.creemProductDetail("tier_club", "month", CreemMode.Test),
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
    expect(updateCreemProductPrice).toHaveBeenCalledWith(CreemMode.Test, "prod_existing", 1490);
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
      url: ENDPOINTS.admin.developer.creemProductDetail("tier_club", "month", CreemMode.Test),
      headers: { authorization: `Bearer ${bearerToken()}` },
    });
  }

  it("archives at Creem and removes the mapping as one operation", async () => {
    mockTierRepo.findCreemProductMapping.mockResolvedValue(mapping);
    vi.mocked(archiveCreemProduct).mockResolvedValue(undefined);

    const res = await remove();

    expect(res.statusCode).toBe(204);
    expect(archiveCreemProduct).toHaveBeenCalledWith(CreemMode.Test, "prod_existing");
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

describe("the selling environment", () => {
  function read() {
    return app.inject({
      method: "GET",
      url: ENDPOINTS.admin.developer.creemSellingMode,
      headers: { authorization: `Bearer ${bearerToken("owner")}` },
    });
  }

  function write(sellingMode: string) {
    return app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.creemSellingMode,
      headers: { authorization: `Bearer ${bearerToken("owner")}` },
      payload: { sellingMode } as never,
    });
  }

  // Owner rather than admin: this is the one control whose change decides
  // whether a purchase charges a real card.
  beforeEach(() => {
    mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role: "owner" });
    mockTierRepo.listAllCreemProductMappings.mockResolvedValue([]);
  });

  it("says which environment sells and what each one would still need", async () => {
    mockTierRepo.listAllCreemProductMappings.mockResolvedValue([
      { tierId: "tier_club", interval: "month", mode: CreemMode.Test, creemProductId: "prod_t" },
    ]);

    const res = await read();

    expect(res.statusCode).toBe(200);
    expect(res.json().sellingMode).toBe(CreemMode.Test);
    // The sandbox has the one buyable plan; live has nothing yet and says so.
    expect(res.json().readiness).toEqual([
      { mode: CreemMode.Test, hasKey: true, missingProducts: [] },
      { mode: CreemMode.Live, hasKey: false, missingProducts: ["Club (month)"] },
    ]);
  });

  it("clears the catalogue cache, so the pricing page does not quote the old environment", async () => {
    const res = await write(CreemMode.Live);

    expect(res.statusCode).toBe(200);
    expect(setSellingMode).toHaveBeenCalled();
    expect(resetCreemCatalogCache).toHaveBeenCalled();
  });

  it("reports a refusal with the plans that are missing, and leaves the cache alone", async () => {
    vi.mocked(setSellingMode).mockResolvedValueOnce({
      refusal: SellingModeRefusal.MissingProducts,
      missing: ["Club (year)"],
    });

    const res = await write(CreemMode.Live);

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("MC-BILL-0007");
    expect(res.json().missing).toEqual(["Club (year)"]);
    expect(resetCreemCatalogCache).not.toHaveBeenCalled();
  });

  it("refuses an environment this deployment holds no key for", async () => {
    vi.mocked(setSellingMode).mockResolvedValueOnce({ refusal: SellingModeRefusal.NoKey, missing: [] });

    const res = await write(CreemMode.Live);

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("MC-BILL-0006");
  });

  it("rejects a caller who is not the owner", async () => {
    mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role: "admin" });

    const res = await write(CreemMode.Live);

    expect(res.statusCode).toBe(403);
    expect(setSellingMode).not.toHaveBeenCalled();
  });

  it("reads the stored value rather than assuming the sandbox", async () => {
    vi.mocked(getSellingMode).mockResolvedValueOnce(CreemMode.Live);

    expect((await read()).json().sellingMode).toBe(CreemMode.Live);
  });
});
