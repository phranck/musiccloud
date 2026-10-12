/**
 * @file Holds the guarded route scopes to refusing a caller without
 * credentials before the route's body schema answers.
 *
 * Fastify validates a body after `onRequest` and before `preHandler`. A guard
 * in `preHandler` therefore let an anonymous caller learn which bodies an
 * admin route accepts, and had every unauthenticated body parsed and checked
 * before it was refused.
 */
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(async () => ({})),
  getCcRepository: vi.fn(async () => ({})),
  getApiAccessRepository: vi.fn(async () => ({})),
  getDeveloperRepository: vi.fn(async () => ({})),
}));

import { buildApp } from "../server.js";

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-auth-before-validation";
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("guarded scopes without credentials", () => {
  it("refuse a plan whose body the schema would also refuse as unauthenticated", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/developer/tiers",
      payload: { name: "x", requestsPerMinute: "abc", requestsPerDay: 1 },
    });

    expect(res.statusCode).toBe(401);
  });

  it("refuse an out-of-range project ceiling as unauthenticated", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/developer/limits",
      payload: { maxProjectsPerAccount: "many" },
    });

    expect(res.statusCode).toBe(401);
  });

  it.each([
    { method: "POST" as const, url: "/api/admin/developer/portal-invitations", payload: { email: 42 } },
    { method: "POST" as const, url: "/api/admin/developer/portal-invitations/not%20an%20id/resend" },
    { method: "DELETE" as const, url: "/api/admin/developer/portal-invitations/not%20an%20id" },
  ])("refuse the portal invitation route $method $url as unauthenticated", async ({ method, url, payload }) => {
    const res = await app.inject({ method, url, payload });

    expect(res.statusCode).toBe(401);
  });

  it("refuse a keyless resolve with a malformed body as unauthenticated", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/resolve", payload: { query: 42, extra: true } });

    expect(res.statusCode).toBe(401);
  });

  it.each([
    "/api/v1/artists/events?month=13&day=7",
    "/api/v1/artists/not%20an%20id/members",
    "/api/v1/artists/not%20an%20id/memberships",
  ])("refuse the keyless artist identity read %s as unauthenticated", async (url) => {
    const res = await app.inject({ method: "GET", url });

    expect(res.statusCode).toBe(401);
  });
});
