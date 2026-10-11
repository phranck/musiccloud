/**
 * Route tests for the offers of a plan.
 *
 * The two things worth pinning here are the ones a schema alone cannot hold: a
 * URL that points somewhere other than our own origins is refused, and no
 * field reaches the repository unless the route named it.
 */
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("DISABLE_RATE_LIMIT", "true");
vi.stubEnv("ALLOWED_ORIGINS", "https://musiccloud.io,https://dashboard.musiccloud.io");

const mockTierRepo = {
  listTiers: vi.fn(),
  listOffers: vi.fn(),
  createOffer: vi.fn(),
  updateOffer: vi.fn(),
  deleteOffer: vi.fn(),
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

const plan = { id: "tier_club", name: "Club", enabled: true };

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
    const { adminPlanOfferRoutes } = await import("./admin-plan-offers.js");
    await adminApp.register(adminPlanOfferRoutes);
  });

  return app;
}

let app: FastifyInstance;

function bearerToken(role = "admin"): string {
  return app.jwt.sign({ sub: "admin-1", role });
}

/** Creates an offer on the paid plan with the given body. */
function post(body: unknown) {
  return app.inject({
    method: "POST",
    url: ENDPOINTS.admin.developer.planOffers("tier_club"),
    headers: { authorization: `Bearer ${bearerToken()}` },
    payload: body as never,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role: "admin" });
  mockTierRepo.listTiers.mockResolvedValue([plan]);
  mockTierRepo.listOffers.mockResolvedValue([]);
  mockTierRepo.createOffer.mockImplementation(async (data: unknown) => ({ id: "offer_new", ...(data as object) }));
});

describe("POST /api/admin/developer/plans/:tierId/offers", () => {
  it("stores every field the request named, and a sensible default for the rest", async () => {
    const res = await post({ billingPeriod: "every-month", priceCents: 990 });

    expect(res.statusCode).toBe(201);
    expect(mockTierRepo.createOffer).toHaveBeenCalledWith({
      tierId: "tier_club",
      billingPeriod: "every-month",
      priceCents: 990,
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
    });
  });

  it("accepts every billing period Creem sells over", async () => {
    for (const period of ["once", "every-day", "every-month", "every-three-months", "every-six-months", "every-year"]) {
      mockTierRepo.listOffers.mockResolvedValue([]);
      expect((await post({ billingPeriod: period, priceCents: 990 })).statusCode).toBe(201);
    }
  });

  it("refuses a period Creem does not know", async () => {
    expect((await post({ billingPeriod: "every-week", priceCents: 990 })).statusCode).toBe(400);
    expect(mockTierRepo.createOffer).not.toHaveBeenCalled();
  });

  it("refuses an amount below what Creem accepts", async () => {
    expect((await post({ billingPeriod: "every-month", priceCents: 99 })).statusCode).toBe(400);
    expect(mockTierRepo.createOffer).not.toHaveBeenCalled();
  });

  it("refuses a second offer over the same period", async () => {
    mockTierRepo.listOffers.mockResolvedValue([{ billingPeriod: "every-month" }]);

    const res = await post({ billingPeriod: "every-month", priceCents: 990 });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("MC-BILL-0009");
  });

  it("accepts a return address on one of our own origins", async () => {
    const res = await post({
      billingPeriod: "every-month",
      priceCents: 990,
      successUrl: "https://musiccloud.io/thanks",
    });

    expect(res.statusCode).toBe(201);
  });

  it("refuses a return address pointing somewhere else, which would be our redirect", async () => {
    const res = await post({
      billingPeriod: "every-month",
      priceCents: 990,
      successUrl: "https://example.org/thanks",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("MC-BILL-0008");
    expect(mockTierRepo.createOffer).not.toHaveBeenCalled();
  });

  it("refuses a return address that is not https, even on our own host", async () => {
    const res = await post({
      billingPeriod: "every-month",
      priceCents: 990,
      successUrl: "http://musiccloud.io/thanks",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("MC-BILL-0008");
  });

  it("refuses a foreign image address by the same rule", async () => {
    const res = await post({ billingPeriod: "every-month", priceCents: 990, imageUrl: "https://example.org/p.png" });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("MC-BILL-0008");
  });

  it("refuses more checkout questions than Creem accepts", async () => {
    const field = (key: string) => ({ key, label: "Label", optional: true });
    const res = await post({
      billingPeriod: "every-month",
      priceCents: 990,
      customFields: [field("a"), field("b"), field("c"), field("d")],
    });

    expect(res.statusCode).toBe(400);
  });

  it("strips a property the schema has never heard of before the handler sees it", async () => {
    const res = await post({ billingPeriod: "every-month", priceCents: 990, isAdmin: true });

    expect(res.statusCode).toBe(201);
    // Fastify removes what the schema does not declare, so the property never
    // reaches the repository and cannot become a column.
    expect(mockTierRepo.createOffer.mock.calls[0]?.[0]).not.toHaveProperty("isAdmin");
  });

  it("answers 404 for a plan that does not exist", async () => {
    mockTierRepo.listTiers.mockResolvedValue([]);

    expect((await post({ billingPeriod: "every-month", priceCents: 990 })).statusCode).toBe(404);
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.developer.planOffers("tier_club"),
      payload: { billingPeriod: "every-month", priceCents: 990 } as never,
    });

    expect(res.statusCode).toBe(403);
    expect(mockTierRepo.createOffer).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/developer/offers/:id", () => {
  function patch(body: unknown) {
    return app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.planOfferDetail("offer_1"),
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: body as never,
    });
  }

  it("passes only the fields the request named", async () => {
    mockTierRepo.updateOffer.mockResolvedValue({ id: "offer_1" });

    await patch({ priceCents: 1490 });

    expect(mockTierRepo.updateOffer).toHaveBeenCalledWith("offer_1", { priceCents: 1490 });
  });

  it("refuses a foreign return address here too", async () => {
    const res = await patch({ successUrl: "https://example.org/thanks" });

    expect(res.statusCode).toBe(400);
    expect(mockTierRepo.updateOffer).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/developer/offers/:id", () => {
  it("removes the offer", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: ENDPOINTS.admin.developer.planOfferDetail("offer_1"),
      headers: { authorization: `Bearer ${bearerToken()}` },
    });

    expect(res.statusCode).toBe(204);
    expect(mockTierRepo.deleteOffer).toHaveBeenCalledWith("offer_1");
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: ENDPOINTS.admin.developer.planOfferDetail("offer_1"),
    });

    expect(res.statusCode).toBe(403);
    expect(mockTierRepo.deleteOffer).not.toHaveBeenCalled();
  });
});
