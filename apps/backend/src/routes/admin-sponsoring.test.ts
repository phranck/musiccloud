/**
 * Route tests for the sponsoring setting (`/api/admin/sponsoring/config`).
 * Drives the real handlers and the real request schema through `app.inject`,
 * with the settings store and the admin lookup mocked.
 *
 * Every dashboard role carries the JWT claim `role: "admin"`, so the role that
 * matters comes from the mocked admin record, as it does in production.
 */
import jwt from "@fastify/jwt";
import { ENDPOINTS, SPONSORING_DEFAULTS, type SponsoringConfig } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mockAdminRepo = { findAdminById: vi.fn() };

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockAdminRepo,
}));

/** What the store holds, keyed like `site_settings`. */
const stored = new Map<string, string>();

vi.mock("../services/site-settings.js", () => ({
  getSetting: vi.fn(async (key: string) => stored.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    stored.set(key, value);
  }),
}));

import { setSetting } from "../services/site-settings.js";

/** A complete, valid setting: 230 euros a year and a real-format Austrian account. */
const VALID: SponsoringConfig = {
  costs: [
    { label: "Hosting", amountCents: 20_000 },
    { label: "Domain", amountCents: 3_000 },
  ],
  sponsorMinimumCents: 4_000,
  payeeName: "Frank Gregor",
  payeeIban: "AT611904300234573201",
  payeeBic: "BKAUATWW",
  purposeDonation: "Donation: musiccloud.io",
  purposeSponsor: "Sponsor: musiccloud.io",
  purposePaypal: "musiccloud.io",
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
    const { adminSponsoringRoutes } = await import("./admin-sponsoring.js");
    await adminApp.register(adminSponsoringRoutes);
  });
  return instance;
}

/**
 * Sends a request as a dashboard user of the given role.
 *
 * @param method - `GET` or `PUT`.
 * @param role - The role stored for the caller.
 * @param payload - The PUT body.
 */
function send(method: "GET" | "PUT", role: string, payload?: unknown) {
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role });
  return app.inject({
    method,
    url: ENDPOINTS.admin.sponsoring.config,
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: "admin-1", role: "admin" })}` },
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  stored.clear();
  app = await buildApp();
});

describe("GET /api/admin/sponsoring/config", () => {
  it("answers an admin with the defaults while nothing is saved", async () => {
    const res = await send("GET", "admin");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SPONSORING_DEFAULTS);
  });

  it("refuses a moderator", async () => {
    expect((await send("GET", "moderator")).statusCode).toBe(403);
  });
});

describe("PUT /api/admin/sponsoring/config", () => {
  it("stores a valid setting for the owner and answers with it", async () => {
    const res = await send("PUT", "owner", VALID);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(VALID);
    expect(JSON.parse(stored.get("sponsoring_config") ?? "{}")).toEqual(VALID);
  });

  it.each(["admin", "moderator"])("refuses an %s, because the payee decides where money goes", async (role) => {
    const res = await send("PUT", role, VALID);

    expect(res.statusCode).toBe(403);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("refuses an IBAN whose check digits do not hold, and names the field", async () => {
    const res = await send("PUT", "owner", { ...VALID, payeeIban: "AT611904300234573202" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0011");
    expect(res.json().problems).toEqual([{ field: "payeeIban", reason: "checksum" }]);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it.each([
    ["purposeDonation", { purposeDonation: "[[button:x]]" }],
    ["payeeName", { payeeName: "<b>Frank</b>" }],
    ["payeeIban", { payeeIban: "AT61 1904 3002 3457 3201" }],
    ["payeeBic", { payeeBic: "BKAU" }],
    ["sponsorMinimumCents", { sponsorMinimumCents: -1 }],
    ["costs.0.label", { costs: [{ label: "", amountCents: 100 }] }],
    ["costs", { costs: Array.from({ length: 21 }, () => ({ label: "x", amountCents: 1 })) }],
  ])("refuses a malformed %s and writes nothing", async (field, change) => {
    const res = await send("PUT", "owner", { ...VALID, ...change });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0011");
    expect(res.json().problems).toContainEqual({ field, reason: "format" });
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("names a missing field", async () => {
    const { payeeBic: _omitted, ...withoutBic } = VALID;
    const res = await send("PUT", "owner", withoutBic);

    expect(res.statusCode).toBe(400);
    expect(res.json().problems).toContainEqual({ field: "payeeBic", reason: "format" });
  });

  it("does not store a field the schema does not know", async () => {
    const res = await send("PUT", "owner", { ...VALID, role: "owner" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(stored.get("sponsoring_config") ?? "{}")).not.toHaveProperty("role");
  });

  it("accepts an empty account, so costs can be saved before the payee is known", async () => {
    const res = await send("PUT", "owner", { ...VALID, payeeIban: "", payeeBic: "" });

    expect(res.statusCode).toBe(200);
  });
});
