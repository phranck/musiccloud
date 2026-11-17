/**
 * Route tests for the annual sponsors (`/api/admin/sponsoring/sponsors`).
 * Drives the real handlers and the shared request schema through
 * `app.inject`, with the sponsors service and the admin lookup mocked.
 */
import jwt from "@fastify/jwt";
import { ENDPOINTS, type SponsorInput } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mockAdminRepo = { findAdminById: vi.fn() };

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockAdminRepo,
}));

vi.mock("../services/sponsors.js", () => ({
  listSponsors: vi.fn(async () => []),
  createSponsor: vi.fn(async (input: SponsorInput) => ({ ...input, id: "s1", amountCents: 0 })),
  updateSponsor: vi.fn(async (id: string, input: SponsorInput) => (id === "s1" ? { ...input, id } : null)),
  deleteSponsor: vi.fn(async (id: string) => id === "s1"),
}));

import { createSponsor, deleteSponsor, updateSponsor } from "../services/sponsors.js";

/** A valid sponsor who agreed to be named. */
const VALID: SponsorInput = {
  name: "Ada Lovelace",
  links: ["https://chaos.social/@ada", "https://ada.example"],
  claim: "Music should find everybody.",
  published: true,
  paidOn: "2026-11-17",
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
    const { adminSponsorRoutes } = await import("./admin-sponsors.js");
    await adminApp.register(adminSponsorRoutes);
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

describe("annual sponsor routes", () => {
  it("records a sponsor for an owner", async () => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsors, "owner", VALID);

    expect(res.statusCode).toBe(201);
    expect(createSponsor).toHaveBeenCalledWith(VALID);
  });

  it.each([
    ["GET", ENDPOINTS.admin.sponsoring.sponsors],
    ["POST", ENDPOINTS.admin.sponsoring.sponsors],
    ["PUT", ENDPOINTS.admin.sponsoring.sponsorDetail("s1")],
    ["DELETE", ENDPOINTS.admin.sponsoring.sponsorDetail("s1")],
  ] as const)("refuses a moderator on %s %s", async (method, url) => {
    const res = await send(method, url, "moderator", method === "POST" || method === "PUT" ? VALID : undefined);

    expect(res.statusCode).toBe(403);
  });

  it.each<[string, Record<string, unknown>]>([
    ["an empty name", { name: "" }],
    ["a name of spaces", { name: "   " }],
    ["a plain http address", { links: ["http://ada.example"] }],
    ["an address with a password", { links: ["https://ada:secret@ada.example"] }],
    ["nine addresses", { links: Array.from({ length: 9 }, (_unused, index) => `https://ada${index}.example`) }],
    ["a day that does not exist", { paidOn: "2026-02-30" }],
    ["a sentence that is too long", { claim: "x".repeat(601) }],
  ])("refuses %s and writes nothing", async (_case, change) => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsors, "admin", { ...VALID, ...change });

    expect(res.statusCode).toBe(400);
    expect(createSponsor).not.toHaveBeenCalled();
  });

  it("never passes an amount from the request to the service", async () => {
    // Fastify's Ajv removes properties the schema does not list, so the amount
    // a sponsor carries can only come from the ledger.
    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsors, "admin", { ...VALID, amountCents: 5_000 });

    expect(res.statusCode).toBe(201);
    expect(createSponsor).toHaveBeenCalledWith(VALID);
  });

  it("changes a sponsor and answers 404 for an unknown one", async () => {
    expect((await send("PUT", ENDPOINTS.admin.sponsoring.sponsorDetail("s1"), "admin", VALID)).statusCode).toBe(200);
    expect(updateSponsor).toHaveBeenCalledWith("s1", VALID);

    expect((await send("PUT", ENDPOINTS.admin.sponsoring.sponsorDetail("nope"), "admin", VALID)).statusCode).toBe(404);
  });

  it("removes a sponsor and answers 404 for an unknown one", async () => {
    expect((await send("DELETE", ENDPOINTS.admin.sponsoring.sponsorDetail("s1"), "owner")).statusCode).toBe(204);
    expect(deleteSponsor).toHaveBeenCalledWith("s1");

    expect((await send("DELETE", ENDPOINTS.admin.sponsoring.sponsorDetail("nope"), "owner")).statusCode).toBe(404);
  });

  it("refuses an id with characters a sponsor id never has", async () => {
    const res = await send("DELETE", "/api/admin/sponsoring/sponsors/..%2Fx", "admin");

    expect(res.statusCode).toBe(400);
    expect(deleteSponsor).not.toHaveBeenCalled();
  });
});
