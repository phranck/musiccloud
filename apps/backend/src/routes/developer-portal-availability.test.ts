import { ENDPOINTS } from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const mocks = vi.hoisted(() => ({
  findAdminById: vi.fn(),
  readPortalAvailability: vi.fn(),
  readPortalAvailabilityState: vi.fn(),
  writePortalAvailability: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(async () => ({ findAdminById: mocks.findAdminById })),
}));

vi.mock("../services/developer-portal-availability.js", () => ({
  readPortalAvailability: mocks.readPortalAvailability,
  readPortalAvailabilityState: mocks.readPortalAvailabilityState,
  writePortalAvailability: mocks.writePortalAvailability,
}));

const { developerPortalAvailabilityAdminRoutes, developerPortalAvailabilityInternalRoutes } = await import(
  "./developer-portal-availability.js"
);

const owner = { id: "owner-1", role: "owner" };

const openedByOwner = {
  public: true,
  maintenance: false,
  lastChange: {
    public: true,
    maintenance: false,
    occurredAt: "2026-10-11T20:00:00.000Z",
    actor: { username: "owner", firstName: "Olive", lastName: null },
  },
};

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
    vi.clearAllMocks();
    mocks.findAdminById.mockResolvedValue(owner);
    mocks.readPortalAvailability.mockResolvedValue({ public: false, maintenance: false });
    mocks.readPortalAvailabilityState.mockResolvedValue(openedByOwner);
    mocks.writePortalAvailability.mockResolvedValue(openedByOwner);
  });

  it("answers an owner's read with the state and the change that produced it", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.developer.portalAvailability });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(openedByOwner);
  });

  it("records the owner who sent a write", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.portalAvailability,
      payload: { public: true, maintenance: false },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.writePortalAvailability).toHaveBeenCalledWith({ public: true, maintenance: false }, "owner-1");
    expect(response.json()).toEqual(openedByOwner);
  });

  // Fastify's validator drops properties the schema does not list, so a body
  // naming somebody else as the actor reaches the write without that field.
  it("never lets the body name who made the change", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "PATCH",
      url: ENDPOINTS.admin.developer.portalAvailability,
      payload: { public: true, maintenance: false, actorAdminId: "someone-else" },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.writePortalAvailability).toHaveBeenCalledWith({ public: true, maintenance: false }, "owner-1");
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
    expect(mocks.writePortalAvailability).not.toHaveBeenCalled();
  });

  it("gives the portal middleware the two switches and nothing about who set them", async () => {
    mocks.readPortalAvailability.mockResolvedValue({ public: true, maintenance: false });
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: ENDPOINTS.internal.developer.portalAvailability });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ public: true, maintenance: false });
  });
});
