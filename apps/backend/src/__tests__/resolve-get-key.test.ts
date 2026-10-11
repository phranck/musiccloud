/**
 * @file Guards that `GET /api/v1/resolve` needs an API key, as `server.ts` wires it.
 *
 * The route checks no credential itself. It relies on sitting inside the scope
 * whose `preHandler` is `authenticatePublic`, so only the real app proves that
 * it does: a registration moved back outside that scope answers every caller
 * again, and every test here then fails.
 *
 * ## What is real vs. mocked
 *
 * - **Real:** the server wiring, the auth plugin, the project limiters, the
 *   error envelope, and the published OpenAPI document.
 * - **Mocked:** persistence and the text search, so no request leaves the
 *   process. An ambiguous search is the cheapest outcome that proves the
 *   handler was reached, because it answers `400` without persisting anything.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveApiClientByTokenHash: vi.fn(),
  touchApiClientTokenLastUsed: vi.fn(),
  createApiUsageEvent: vi.fn(),
  resolveTextSearchWithDisambiguation: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(async () => ({})),
  getCcRepository: vi.fn(async () => ({})),
  getApiAccessRepository: vi.fn(async () => ({
    findActiveApiClientByTokenHash: mocks.findActiveApiClientByTokenHash,
    touchApiClientTokenLastUsed: mocks.touchApiClientTokenLastUsed,
    createApiUsageEvent: mocks.createApiUsageEvent,
  })),
  getDeveloperRepository: vi.fn(async () => ({})),
}));

vi.mock("../services/resolver.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/resolver.js")>()),
  resolveTextSearchWithDisambiguation: mocks.resolveTextSearchWithDisambiguation,
}));

import { DEVELOPER_PROJECTS_URL } from "../docs/developer-portal.js";
import { buildApp } from "../server.js";
import { generateApiToken } from "../services/api-access-token.js";

/** A query that reaches the free-text path, which the mocked search answers as ambiguous. */
const RESOLVE_URL = `${ENDPOINTS.v1.resolve}?query=bohemian%20rhapsody`;

/** Shaped like a live key, but no repository lookup resolves it. */
const UNKNOWN_KEY = "mc_live_abc123def456_abcdefghijklmnopqrstuvwxyzABCDEF0123456789-_";

let app: FastifyInstance;

/**
 * Mints a live key whose project allows one request a minute, so the second
 * request shows whether the first was counted.
 *
 * @param projectId - A project id no other test uses, which keeps its quota bucket apart.
 * @returns The raw key to send as `X-API-Key`.
 */
function issueKeyWithOneRequestAMinute(projectId: string): string {
  const generated = generateApiToken();
  const limits = { effectiveRequestsPerMinute: 1, effectiveRequestsPerDay: 100 };
  mocks.findActiveApiClientByTokenHash.mockImplementation(async (hash: string) =>
    hash === generated.hash
      ? {
          project: { id: projectId, ...limits },
          client: { id: `${projectId}-registration`, projectId, ...limits },
          token: { id: `${projectId}-token` },
        }
      : null,
  );
  return generated.raw;
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-resolve-get-key";
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  delete process.env.DISABLE_RATE_LIMIT;
  vi.clearAllMocks();
  mocks.findActiveApiClientByTokenHash.mockResolvedValue(null);
  mocks.touchApiClientTokenLastUsed.mockResolvedValue(undefined);
  mocks.createApiUsageEvent.mockResolvedValue(undefined);
  mocks.resolveTextSearchWithDisambiguation.mockResolvedValue({ kind: "disambiguation", candidates: [] });
});

describe("GET /api/v1/resolve", () => {
  it("refuses a request without a key and says which header to send and where a key comes from", async () => {
    const response = await app.inject({ method: "GET", url: RESOLVE_URL });
    const body = response.json();

    expect(response.statusCode).toBe(401);
    expect(body.error).toBe("MC-AUTH-0001");
    expect(body.errorId).toEqual(expect.any(String));
    expect(body.message).toContain("X-API-Key");
    expect(body.message).toContain(DEVELOPER_PROJECTS_URL);
    expect(mocks.resolveTextSearchWithDisambiguation).not.toHaveBeenCalled();
  });

  it("refuses a revoked key with the sentence every key-bearing operation uses", async () => {
    const response = await app.inject({ method: "GET", url: RESOLVE_URL, headers: { "x-api-key": UNKNOWN_KEY } });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Invalid or revoked API key. (MC-AUTH-0001)");
    expect(mocks.resolveTextSearchWithDisambiguation).not.toHaveBeenCalled();
  });

  it("counts a keyed request against the project's quota and records it as usage", async () => {
    const key = issueKeyWithOneRequestAMinute("project-resolve-get");

    const first = await app.inject({ method: "GET", url: RESOLVE_URL, headers: { "x-api-key": key } });
    const second = await app.inject({ method: "GET", url: RESOLVE_URL, headers: { "x-api-key": key } });

    expect(first.statusCode).toBe(400);
    expect(mocks.resolveTextSearchWithDisambiguation).toHaveBeenCalledTimes(1);
    expect(mocks.createApiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-resolve-get",
        method: "GET",
        endpointTemplate: ENDPOINTS.v1.resolve,
        statusCode: 400,
      }),
    );
    expect(second.statusCode).toBe(429);
    expect(second.json().error).toBe("MC-API-0003");
  });

  it("is published as an operation that requires a key", async () => {
    const document = (await app.inject({ method: "GET", url: "/docs/json" })).json();
    const operation = document.paths["/api/v1/resolve"].get;

    expect(operation.security).toEqual([{ ApiKeyAuth: [] }]);
    expect(operation.responses).toHaveProperty("401");
    expect(JSON.stringify(operation["x-codeSamples"])).toContain("X-API-Key");
    expect(operation.description).not.toContain("needs no API key");
  });
});

describe("the other key-bearing operations", () => {
  it("keep the default refusal for a request without a key", async () => {
    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.v1.resolve,
      payload: { query: "bohemian rhapsody" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Authentication required. (MC-AUTH-0001)");
  });
});
