/**
 * Route tests for the annual sponsors (`/api/admin/sponsoring/sponsors`).
 * Drives the real handlers and the shared request schema through
 * `app.inject`, with the sponsors service, the picture lookup, the copy step,
 * the picture store and the admin lookup mocked.
 */
import jwt from "@fastify/jwt";
import { ENDPOINTS, type SponsorInput } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mockAdminRepo = { findAdminById: vi.fn() };

/** The id of the one picture the mocked store holds, a hex SHA-256. */
const STORED_AVATAR_ID = vi.hoisted(() => "d".repeat(64));

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockAdminRepo,
}));

vi.mock("../services/sponsors.js", () => ({
  listSponsors: vi.fn(async () => []),
  createSponsor: vi.fn(async (input: SponsorInput) => ({ ...input, id: "s1", amountCents: 0 })),
  updateSponsor: vi.fn(async (id: string, input: SponsorInput) => (id === "s1" ? { ...input, id } : null)),
  deleteSponsor: vi.fn(async (id: string) => id === "s1"),
}));

vi.mock("../services/sponsor-avatars.js", () => ({
  sponsorAvatarExists: vi.fn(async (id: string) => id === STORED_AVATAR_ID),
}));

vi.mock("../services/sponsor-avatar.js", () => ({
  resolveSponsorAvatar: vi.fn(async () => null),
}));

vi.mock("../services/sponsor-avatar-copy.js", () => ({
  copySponsorAvatar: vi.fn(async () => null),
}));

import { resolveSponsorAvatar } from "../services/sponsor-avatar.js";
import { copySponsorAvatar } from "../services/sponsor-avatar-copy.js";
import { createSponsor, deleteSponsor, updateSponsor } from "../services/sponsors.js";

/** A valid sponsor who agreed to be named. */
const VALID: SponsorInput = {
  name: "Ada Lovelace",
  socialMedia: [
    { platform: "mastodon", url: "https://chaos.social/@ada" },
    { platform: "website", url: "https://ada.example" },
  ],
  avatarId: STORED_AVATAR_ID,
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
    [
      "an address that does not fit its platform",
      { socialMedia: [{ platform: "bluesky", url: "https://ada.example" }] },
    ],
    ["a platform nobody knows", { socialMedia: [{ platform: "myspace", url: "https://ada.example" }] }],
    ["an address with a password", { socialMedia: [{ platform: "website", url: "https://ada:secret@ada.example" }] }],
    [
      "nine addresses",
      {
        socialMedia: Array.from({ length: 9 }, (_unused, index) => ({
          platform: "website",
          url: `https://ada${index}.example`,
        })),
      },
    ],
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

  it("stores every address in the form its platform writes it", async () => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsors, "admin", {
      ...VALID,
      name: " Ada Lovelace ",
      socialMedia: [
        { platform: "mastodon", url: "@ada@chaos.social" },
        { platform: "website", url: "ada.example/" },
      ],
    });

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

  it.each([
    ["a picture that is not stored", "e".repeat(64)],
    ["a picture id that is not a hash", "../avatar"],
  ])("refuses %s and writes nothing", async (_case, avatarId) => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsors, "admin", { ...VALID, avatarId });

    expect(res.statusCode).toBe(400);
    expect(createSponsor).not.toHaveBeenCalled();
  });

  it("records a sponsor without a picture", async () => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsors, "admin", { ...VALID, avatarId: null });

    expect(res.statusCode).toBe(201);
    expect(createSponsor).toHaveBeenCalledWith({ ...VALID, avatarId: null });
  });

  it("finds the picture behind the canonical profiles and answers the copy's id", async () => {
    vi.mocked(resolveSponsorAvatar).mockResolvedValueOnce("https://files.example/ada.png");
    vi.mocked(copySponsorAvatar).mockResolvedValueOnce(STORED_AVATAR_ID);

    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsorAvatar, "admin", {
      socialMedia: [{ platform: "mastodon", url: "@ada@chaos.social" }],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ avatarId: STORED_AVATAR_ID });
    expect(resolveSponsorAvatar).toHaveBeenCalledWith([{ platform: "mastodon", url: "https://chaos.social/@ada" }]);
    expect(copySponsorAvatar).toHaveBeenCalledWith("https://files.example/ada.png");
  });

  it("answers no picture when no profile leads to one, without copying anything", async () => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsorAvatar, "owner", {
      socialMedia: [{ platform: "website", url: "https://ada.example" }],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ avatarId: null });
    expect(copySponsorAvatar).not.toHaveBeenCalled();
  });

  it.each<[string, string, unknown]>([
    ["a moderator", "moderator", { socialMedia: [] }],
    [
      "an address that does not fit its platform",
      "admin",
      { socialMedia: [{ platform: "bluesky", url: "https://ada.example" }] },
    ],
    ["a body without profiles", "admin", {}],
  ])("refuses a picture lookup for %s without asking anybody", async (_case, role, payload) => {
    const res = await send("POST", ENDPOINTS.admin.sponsoring.sponsorAvatar, role, payload);

    expect(res.statusCode).toBe(role === "moderator" ? 403 : 400);
    expect(resolveSponsorAvatar).not.toHaveBeenCalled();
  });

  it("refuses an id with characters a sponsor id never has", async () => {
    const res = await send("DELETE", "/api/admin/sponsoring/sponsors/..%2Fx", "admin");

    expect(res.statusCode).toBe(400);
    expect(deleteSponsor).not.toHaveBeenCalled();
  });
});
