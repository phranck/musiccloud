import { ENDPOINTS } from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mocks = vi.hoisted(() => ({
  findAdminById: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(async () => ({ findAdminById: mocks.findAdminById })),
}));

vi.mock("../services/site-settings.js", () => ({
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}));

const { developerPortalAvailabilityAdminRoutes, developerPortalAvailabilityInternalRoutes } = await import(
  "./developer-portal-availability.js"
);

const owner = { id: "owner-1", role: "owner" };

async function createApp() {
  const app = Fastify();
  registerApiErrorHandling(app);
  app.decorate("authenticateAdmin", async (request) => {
    request.user = { sub: "owner-1", role: "admin" };
  });
  app.decorate("authenticateInternal", async () => undefined);
  await app.register(async (adminApp) => {
    adminApp.addHook("preHandler", adminApp.authenticateAdmin);
    await adminApp.register(developerPortalAvailabilityAdminRoutes);
  });
  await app.register(async (internalApp) => {
    internalApp.addHook("preHandler", internalApp.authenticateInternal);
    await internalApp.register(developerPortalAvailabilityInternalRoutes);
  });
  return app;
}

describe("developer portal availability routes", () => {
  beforeEach(() => {
    mocks.findAdminById.mockReset();
    mocks.getSetting.mockReset();
    mocks.setSetting.mockReset();
    mocks.findAdminById.mockResolvedValue(owner);
    mocks.getSetting.mockResolvedValue(null);
    mocks.setSetting.mockResolvedValue(undefined);
  });

  it("defaults missing settings to a closed portal outside maintenance", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.developer.portalAvailability });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ public: false, maintenance: false });
  });

  it("allows an owner to atomically update portal availability", async () => {
    const app = await createApp();
    mocks.getSetting.mockResolvedValueOnce("true").mockResolvedValueOnce("true");
    const response = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.portalAvailability,
      payload: { public: true, maintenance: true },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.setSetting).toHaveBeenNthCalledWith(1, "developer_portal_public", "true");
    expect(mocks.setSetting).toHaveBeenNthCalledWith(2, "developer_portal_maintenance", "true");
    expect(response.json()).toEqual({ public: true, maintenance: true });
  });

  it.each(["admin", "moderator"])("rejects a %s caller with a stable forbidden envelope", async (role) => {
    mocks.findAdminById.mockResolvedValue({ ...owner, role });
    const app = await createApp();
    const response = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.portalAvailability,
      payload: { public: true, maintenance: false },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "MC-AUTH-0002", errorId: expect.any(String) });
  });

  it("returns only parsed booleans to the internal service", async () => {
    mocks.getSetting.mockResolvedValueOnce("true").mockResolvedValueOnce("false");
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: ENDPOINTS.internal.developer.portalAvailability });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ public: true, maintenance: false });
  });
});
