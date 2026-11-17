/**
 * Route tests for the sponsorship requests in the dashboard
 * (`/api/admin/sponsoring/requests`), driving the real handlers and the shared
 * takeover schema through `app.inject`, with the service and the admin lookup
 * mocked.
 */
import jwt from "@fastify/jwt";
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mockAdminRepo = { findAdminById: vi.fn() };

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockAdminRepo,
}));

vi.mock("../services/pending-sponsorships.js", () => ({
  listPendingSponsorships: vi.fn(async () => []),
  deletePendingSponsorship: vi.fn(async (id: string) => id === "p1"),
  takeOverPendingSponsorship: vi.fn(async (id: string) =>
    id === "p1" ? { ok: true, value: { id: "s1", name: "Ada" } } : { ok: false, reason: "not_found" },
  ),
}));

import { deletePendingSponsorship, takeOverPendingSponsorship } from "../services/pending-sponsorships.js";

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  registerApiErrorHandling(app);
  await app.register(jwt, { secret: "test-secret" });
  app.decorate("authenticateAdmin", async (request: FastifyRequest) => {
    await request.jwtVerify();
  });
  await app.register(async function adminRoutes(adminApp: FastifyInstance) {
    adminApp.addHook("preValidation", adminApp.authenticateAdmin);
    const { adminSponsorshipRequestRoutes } = await import("./admin-sponsorship-requests.js");
    await adminApp.register(adminSponsorshipRequestRoutes);
  });
});

afterEach(async () => {
  await app.close();
  vi.clearAllMocks();
});

/**
 * Sends a request as a dashboard user of the given role.
 *
 * @param method - The HTTP method.
 * @param url - The path.
 * @param role - The role stored for the caller.
 * @param payload - The body, if any.
 */
function send(method: "GET" | "POST" | "DELETE", url: string, role: string, payload?: unknown) {
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role });
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: "admin-1", role: "admin" })}` },
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
}

describe("sponsorship requests in the dashboard", () => {
  it("lists the requests for an admin", async () => {
    const res = await send("GET", ENDPOINTS.admin.sponsoring.requests, "admin");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("refuses a role that does not keep the books", async () => {
    const res = await send("GET", ENDPOINTS.admin.sponsoring.requests, "moderator");

    expect(res.statusCode).toBe(403);
  });

  it("takes a request over with what arrived and when", async () => {
    const payment = { amountCents: 6_000, paidOn: "2026-11-17" };

    const res = await send("POST", ENDPOINTS.admin.sponsoring.requestTakeover("p1"), "owner", payment);

    expect(res.statusCode).toBe(201);
    expect(takeOverPendingSponsorship).toHaveBeenCalledWith("p1", payment);
  });

  it.each([
    ["a day that does not exist", { amountCents: 6_000, paidOn: "2026-02-30" }],
    ["no amount", { amountCents: 0, paidOn: "2026-11-17" }],
  ])("refuses a takeover with %s", async (_case, payment) => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.requestTakeover("p1"), "owner", payment);

    expect(res.statusCode).toBe(400);
    expect(takeOverPendingSponsorship).not.toHaveBeenCalled();
  });

  it("hands the service only the amount and the day, whatever else the body names", async () => {
    await send("POST", ENDPOINTS.admin.sponsoring.requestTakeover("p1"), "owner", {
      amountCents: 6_000,
      paidOn: "2026-11-17",
      sponsorId: "someone-else",
    });

    expect(takeOverPendingSponsorship).toHaveBeenCalledWith("p1", { amountCents: 6_000, paidOn: "2026-11-17" });
  });

  it("answers 404 for a request that is gone", async () => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.requestTakeover("gone"), "owner", {
      amountCents: 6_000,
      paidOn: "2026-11-17",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "MC-RES-0003" });
  });

  it("removes a request, and answers 404 the second time", async () => {
    expect((await send("DELETE", ENDPOINTS.admin.sponsoring.requestDetail("p1"), "admin")).statusCode).toBe(204);
    expect((await send("DELETE", ENDPOINTS.admin.sponsoring.requestDetail("gone"), "admin")).statusCode).toBe(404);
    expect(deletePendingSponsorship).toHaveBeenCalledTimes(2);
  });
});
