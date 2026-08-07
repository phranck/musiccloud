/**
 * @file Tests the `authenticateInternal` guard around a missing
 * `INTERNAL_API_KEY`.
 *
 * Kept apart from `auth.test.ts` because that file stubs the key for the whole
 * module, and the behaviour under test here is what happens when it is absent.
 * The plugin reads the variable once when it is registered, so each case builds
 * its own instance after setting the environment it wants.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getApiAccessRepository: vi.fn().mockResolvedValue({}),
  getDeveloperRepository: vi.fn().mockResolvedValue({}),
}));

async function buildGuardedApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const { default: authPlugin } = await import("./auth.js");
  await app.register(authPlugin);
  await app.register(async (scope) => {
    scope.addHook("preHandler", scope.authenticateInternal);
    scope.get("/internal/probe", async () => ({ reached: true }));
  });
  return app;
}

describe("authenticateInternal without INTERNAL_API_KEY", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses the request in production rather than passing it through", async () => {
    vi.stubEnv("INTERNAL_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    const app = await buildGuardedApp();
    const response = await app.inject({ method: "GET", url: "/internal/probe" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "UNAUTHORIZED" });
  });

  it("still lets the request through outside production", async () => {
    vi.stubEnv("INTERNAL_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");

    const app = await buildGuardedApp();
    const response = await app.inject({ method: "GET", url: "/internal/probe" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ reached: true });
  });
});

describe("authenticateInternal with INTERNAL_API_KEY", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts the matching key", async () => {
    vi.stubEnv("INTERNAL_API_KEY", "configured-key");
    vi.stubEnv("NODE_ENV", "production");

    const app = await buildGuardedApp();
    const response = await app.inject({
      method: "GET",
      url: "/internal/probe",
      headers: { "x-api-key": "configured-key" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects a wrong key", async () => {
    vi.stubEnv("INTERNAL_API_KEY", "configured-key");
    vi.stubEnv("NODE_ENV", "production");

    const app = await buildGuardedApp();
    const response = await app.inject({
      method: "GET",
      url: "/internal/probe",
      headers: { "x-api-key": "not-the-key" },
    });

    expect(response.statusCode).toBe(401);
  });
});
