import jwt from "@fastify/jwt";
import { ENDPOINTS } from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "../db/admin-repository.js";

const mockRepo = {
  countAdmins: vi.fn(),
  createAdminUser: vi.fn(),
  findAdminById: vi.fn(),
  findAdminByUsername: vi.fn(),
  updateLastLogin: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => mockRepo,
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue("hashed-password"),
  },
}));

import authPlugin from "../plugins/auth.js";
import adminAuthRoutes from "./admin-auth.js";

const TEST_JWT_SECRET = "test-admin-auth-secret-key-do-not-use-in-prod";

function makeAdmin(): AdminUser {
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
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(adminAuthRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.updateLastLogin.mockResolvedValue(undefined);
});

describe("admin auth user contract", () => {
  it("omits locale from login responses", async () => {
    mockRepo.findAdminByUsername.mockResolvedValue(makeAdmin());
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.auth.login,
      payload: { username: "owner", password: "password123" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).not.toHaveProperty("locale");
    await app.close();
  });

  it("omits locale from the current-user response", async () => {
    mockRepo.findAdminById.mockResolvedValue(makeAdmin());
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "admin-1", role: "admin" });

    const response = await app.inject({
      method: "GET",
      url: ENDPOINTS.admin.auth.me,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty("locale");
    await app.close();
  });

  it("does not supply a locale when creating the first admin", async () => {
    mockRepo.countAdmins.mockResolvedValue(0);
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.auth.setup,
      payload: { username: "owner", password: "password123" },
    });

    expect(response.statusCode).toBe(201);
    expect(mockRepo.createAdminUser).toHaveBeenCalledWith(expect.not.objectContaining({ locale: expect.anything() }));
    await app.close();
  });
});

describe("admin session routes", () => {
  const sessionRoutes = [
    ["GET", ENDPOINTS.admin.auth.me],
    ["POST", ENDPOINTS.admin.auth.refresh],
  ] as const;

  it.each(sessionRoutes)("%s %s refuses a request without a Bearer token", async (method, url) => {
    const app = await buildApp();

    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "UNAUTHORIZED", message: "Authentication required." });
    await app.close();
  });

  it.each(sessionRoutes)("%s %s refuses a token that does not verify", async (method, url) => {
    const app = await buildApp();

    const response = await app.inject({ method, url, headers: { authorization: "Bearer not-a-token" } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
    await app.close();
  });

  it.each(sessionRoutes)("%s %s refuses a token with another role claim", async (method, url) => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "admin-1", role: "developer" });

    const response = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "FORBIDDEN", message: "Admin access required." });
    await app.close();
  });

  it.each(sessionRoutes)("%s %s refuses an admin token without a subject", async (method, url) => {
    const app = await buildApp();
    const token = app.jwt.sign({ role: "admin" });

    const response = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "FORBIDDEN", message: "Admin access required." });
    expect(mockRepo.findAdminById).not.toHaveBeenCalled();
    await app.close();
  });

  it("refresh signs a token the gate admits, carrying the stored role", async () => {
    mockRepo.findAdminById.mockResolvedValue(makeAdmin());
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "admin-1", role: "admin" });

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.auth.refresh,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(app.jwt.verify(response.json().token)).toMatchObject({
      sub: "admin-1",
      username: "owner",
      role: "admin",
      dbRole: "owner",
    });
    await app.close();
  });
});
