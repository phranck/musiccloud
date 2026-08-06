/**
 * @file Guards which routes the global rate limit covers.
 *
 * The limiter previously carried an allow-list matching `request.url` against
 * the prefix `/api/admin/events`. That check runs before anything has
 * authenticated, so it lifted the ceiling for every caller rather than for
 * admins, and being a prefix it also covered paths that do not exist. The
 * assertions below encode both halves of that.
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

const GLOBAL_LIMIT = "300";
const SSE_LIMIT = "120";

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-rate-limit-scope";
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("global rate limit coverage", () => {
  it("counts an ordinary route against the global ceiling", async () => {
    const res = await app.inject({ method: "GET", url: "/health/backend" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-ratelimit-limit"]).toBe(GLOBAL_LIMIT);
  });

  it("counts an unauthenticated admin request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/users" });

    expect(res.statusCode).toBe(401);
    expect(res.headers["x-ratelimit-limit"]).toBe(GLOBAL_LIMIT);
  });

  it("counts the SSE stream too, against its own higher ceiling", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/events" });

    // Unauthenticated, so the admin guard rejects before the stream opens.
    // The limiter still ran, which is the point: this path used to be exempt.
    expect(res.statusCode).toBe(401);
    expect(res.headers["x-ratelimit-limit"]).toBe(SSE_LIMIT);
  });

  it("does not extend the SSE ceiling to a path that merely shares its prefix", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/eventsXYZ" });

    expect(res.statusCode).toBe(404);
    expect(res.headers["x-ratelimit-limit"]).toBe(GLOBAL_LIMIT);
  });
});
