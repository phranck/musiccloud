/**
 * Route tests for the generic admin site-settings surface
 * (`/api/admin/site-settings`). Drives the real handlers through `app.inject`
 * with the settings store and the admin lookup mocked.
 *
 * Every dashboard role carries the JWT claim `role: "admin"`, so the token in
 * these tests is always the same and the role that matters comes from the
 * mocked admin record, exactly as it does in production.
 */
import jwt from "@fastify/jwt";
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mockAdminRepo = { findAdminById: vi.fn() };

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockAdminRepo,
  getTierRepository: async () => ({}),
}));

vi.mock("../services/site-settings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/site-settings.js")>()),
  getAllSettings: vi.fn(async () => ({ tracking_enabled: "true" })),
  setSetting: vi.fn(async () => undefined),
}));

import { getAllSettings, setSetting } from "../services/site-settings.js";

/** The key of the Creem selling mode, which has a route of its own. */
const SELLING_MODE_KEY = "creem_selling_mode";

/** The key of the sponsoring setting, which has a route of its own. */
const SPONSORING_CONFIG_KEY = "sponsoring_config";

/** The key of the support prompt limits, which have a route of their own. */
const SUPPORT_PROMPT_LIMITS_KEY = "support_prompt_limits";

let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  registerApiErrorHandling(instance);
  await instance.register(jwt, { secret: "test-secret" });
  instance.decorate("authenticateAdmin", async (request: FastifyRequest) => {
    await request.jwtVerify();
  });
  await instance.register(async function adminRoutes(adminApp: FastifyInstance) {
    adminApp.addHook("preHandler", adminApp.authenticateAdmin);
    const { siteSettingsAdminRoutes } = await import("./site-settings.js");
    await adminApp.register(siteSettingsAdminRoutes);
  });
  return instance;
}

/**
 * Sends a request as a dashboard user of the given role.
 *
 * @param method - `GET` or `PATCH`.
 * @param role - The role stored for the caller, which is what the route checks.
 * @param payload - The PATCH body.
 */
function send(method: "GET" | "PATCH", role: string, payload?: Record<string, string>) {
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role });
  return app.inject({
    method,
    url: ENDPOINTS.admin.siteSettings.base,
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: "admin-1", role: "admin" })}` },
    ...(payload ? { payload } : {}),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
});

describe("GET /api/admin/site-settings", () => {
  it("answers an admin with every setting", async () => {
    const res = await send("GET", "admin");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ tracking_enabled: "true" });
  });

  it("refuses a moderator, who may not open the screens that read it", async () => {
    const res = await send("GET", "moderator");

    expect(res.statusCode).toBe(403);
    expect(getAllSettings).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/site-settings", () => {
  it("writes an ordinary setting for an admin", async () => {
    const res = await send("PATCH", "admin", { tracking_enabled: "false" });

    expect(res.statusCode).toBe(200);
    expect(setSetting).toHaveBeenCalledWith("tracking_enabled", "false");
  });

  it("refuses a moderator and writes nothing", async () => {
    const res = await send("PATCH", "moderator", { tracking_enabled: "false" });

    expect(res.statusCode).toBe(403);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it.each([
    "owner",
    "admin",
  ])("refuses the Creem selling mode for an %s, because only its own route checks it", async (role) => {
    const res = await send("PATCH", role, { tracking_enabled: "false", [SELLING_MODE_KEY]: "live" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0010");
    expect(res.json().message).toContain(SELLING_MODE_KEY);
    // Nothing from a refused request is written, not even the ordinary key beside it.
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("refuses the sponsoring setting, whose own route admits the owner alone", async () => {
    const res = await send("PATCH", "admin", { [SPONSORING_CONFIG_KEY]: '{"payeeIban":"XX"}' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0010");
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("refuses the support prompt limits, whose own route checks every bound", async () => {
    const res = await send("PATCH", "admin", { [SUPPORT_PROMPT_LIMITS_KEY]: '{"maxShown":99}' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("MC-REQ-0010");
    expect(setSetting).not.toHaveBeenCalled();
  });
});
