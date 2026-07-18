import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "../db/admin-repository.js";

const mockRepo = {
  findAdminById: vi.fn(),
  listAdminUsers: vi.fn(),
  updateAdminUser: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockRepo,
}));

vi.mock("../lib/env.js", () => ({
  requireEnv: () => "http://dashboard.test",
}));

vi.mock("../services/email-actions.js", () => ({
  triggerEmailAction: vi.fn().mockResolvedValue(undefined),
}));

import adminUserRoutes from "./admin-users.js";

function makeAdmin(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "admin-1",
    username: "owner",
    passwordHash: "hashed-password",
    email: "owner@example.com",
    role: "owner",
    firstName: "Ada",
    lastName: "Lovelace",
    avatarUrl: null,
    sessionTimeoutMinutes: 30,
    createdAt: 1_700_000_000_000,
    lastLoginAt: null,
    ...overrides,
  };
}

async function buildApp() {
  const app = Fastify();
  app.addHook("preHandler", (request, _reply, done) => {
    (request as unknown as { user: unknown }).user = { sub: "admin-1", role: "admin" };
    done();
  });
  await app.register(adminUserRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.findAdminById.mockResolvedValue(makeAdmin());
});

describe("admin user contract", () => {
  it("omits locale from list responses", async () => {
    mockRepo.listAdminUsers.mockResolvedValue([makeAdmin()]);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.users.list });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).not.toHaveProperty("locale");
    await app.close();
  });

  it("ignores legacy locale fields in profile updates", async () => {
    mockRepo.updateAdminUser.mockResolvedValue(makeAdmin({ email: "new@example.com" }));
    const app = await buildApp();

    const response = await app.inject({
      method: "PATCH",
      url: ROUTE_TEMPLATES.admin.users.detail.replace(":id", "admin-2"),
      payload: { email: "new@example.com", locale: "de" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockRepo.updateAdminUser).toHaveBeenCalledWith("admin-2", { email: "new@example.com" });
    expect(response.json()).not.toHaveProperty("locale");
    await app.close();
  });
});
