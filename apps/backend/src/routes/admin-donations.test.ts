/**
 * Route tests for the donations ledger (`/api/admin/sponsoring/donations`).
 * Drives the real handlers and the shared request schema through
 * `app.inject`, with the ledger service and the admin lookup mocked.
 */
import jwt from "@fastify/jwt";
import { type DonationInput, ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mockAdminRepo = { findAdminById: vi.fn() };

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockAdminRepo,
}));

vi.mock("../services/donations.js", () => ({
  listDonations: vi.fn(async () => []),
  createDonation: vi.fn(async (input: DonationInput) => ({ ...input, id: "d1", externalRef: null })),
  updateDonation: vi.fn(async (id: string, input: DonationInput) => (id === "d1" ? { ...input, id } : null)),
  deleteDonation: vi.fn(async (id: string) => id === "d1"),
  readDonationTotals: vi.fn(async () => ({ donatedYearCents: 0, donatedMonthCents: 0, byMonth: [], byProvider: {} })),
}));

vi.mock("../services/sponsors.js", () => ({
  sponsorExists: vi.fn(async (id: string) => id === "s1"),
}));

import { createDonation, deleteDonation, updateDonation } from "../services/donations.js";

/** A valid PayPal donation of 20 euros, not linked to a sponsor. */
const VALID: DonationInput = {
  name: "Ada",
  published: true,
  amountCents: 2_000,
  receivedOn: "2026-11-17",
  provider: "paypal",
  note: "",
  sponsorId: null,
};

let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  registerApiErrorHandling(instance);
  await instance.register(jwt, { secret: "test-secret" });
  instance.decorate("authenticateAdmin", async (request: FastifyRequest) => {
    await request.jwtVerify();
  });
  await instance.register(async function adminRoutes(adminApp: FastifyInstance) {
    adminApp.addHook("preValidation", adminApp.authenticateAdmin);
    const { adminDonationRoutes } = await import("./admin-donations.js");
    await adminApp.register(adminDonationRoutes);
  });
  return instance;
}

/**
 * Sends a request as a dashboard user of the given role.
 *
 * @param method - The HTTP method.
 * @param url - The path.
 * @param role - The role stored for the caller.
 * @param payload - The body, if any.
 */
function send(method: "GET" | "POST" | "PUT" | "DELETE", url: string, role: string, payload?: unknown) {
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role });
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: "admin-1", role: "admin" })}` },
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
});

describe("donations ledger routes", () => {
  it("records a donation for an admin", async () => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.donations, "admin", VALID);

    expect(res.statusCode).toBe(201);
    expect(createDonation).toHaveBeenCalledWith(VALID);
  });

  it.each([
    ["GET", ENDPOINTS.admin.sponsoring.donations],
    ["GET", ENDPOINTS.admin.sponsoring.donationTotals],
    ["POST", ENDPOINTS.admin.sponsoring.donations],
    ["PUT", ENDPOINTS.admin.sponsoring.donationDetail("d1")],
    ["DELETE", ENDPOINTS.admin.sponsoring.donationDetail("d1")],
  ] as const)("refuses a moderator on %s %s", async (method, url) => {
    const res = await send(method, url, "moderator", method === "POST" || method === "PUT" ? VALID : undefined);

    expect(res.statusCode).toBe(403);
  });

  it.each<[string, Partial<DonationInput>]>([
    ["a zero amount", { amountCents: 0 }],
    ["an unknown route", { provider: "crypto" as DonationInput["provider"] }],
    ["a day that does not exist", { receivedOn: "2026-02-30" }],
    ["a day in another format", { receivedOn: "17.11.2026" }],
    ["a note that is too long", { note: "x".repeat(501) }],
    ["a sponsor that does not exist", { sponsorId: "nobody" }],
    ["a sponsor id with characters an id never has", { sponsorId: "../x" }],
  ])("refuses %s and writes nothing", async (_case, change) => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.donations, "admin", { ...VALID, ...change });

    expect(res.statusCode).toBe(400);
    expect(createDonation).not.toHaveBeenCalled();
  });

  it("links a donation to a sponsor that exists", async () => {
    const linked = { ...VALID, sponsorId: "s1" };

    expect((await send("POST", ENDPOINTS.admin.sponsoring.donations, "admin", linked)).statusCode).toBe(201);
    expect(createDonation).toHaveBeenCalledWith(linked);
  });

  it("changes a donation and answers 404 for an unknown one", async () => {
    expect((await send("PUT", ENDPOINTS.admin.sponsoring.donationDetail("d1"), "owner", VALID)).statusCode).toBe(200);
    expect(updateDonation).toHaveBeenCalledWith("d1", VALID);

    expect((await send("PUT", ENDPOINTS.admin.sponsoring.donationDetail("nope"), "owner", VALID)).statusCode).toBe(404);
  });

  it("removes a donation and answers 404 for an unknown one", async () => {
    expect((await send("DELETE", ENDPOINTS.admin.sponsoring.donationDetail("d1"), "admin")).statusCode).toBe(204);
    expect(deleteDonation).toHaveBeenCalledWith("d1");

    expect((await send("DELETE", ENDPOINTS.admin.sponsoring.donationDetail("nope"), "admin")).statusCode).toBe(404);
  });

  it("refuses an id with characters a donation id never has", async () => {
    const res = await send("DELETE", "/api/admin/sponsoring/donations/..%2Fx", "admin");

    expect(res.statusCode).toBe(400);
    expect(deleteDonation).not.toHaveBeenCalled();
  });
});
