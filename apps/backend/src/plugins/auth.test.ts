/**
 * @file Tests for the `authenticatePublic` decorator's issued-token path
 * (MC-088): `mc_live_...` tokens presented as `X-API-Key` are hash-validated
 * against the API-access repository, attach the project and registration,
 * stamp `lastUsedAt`, and enforce project quotas plus optional narrower
 * registration caps centrally
 * in the auth hook. The internal BFF key must keep working unchanged, and
 * token-authenticated callers must skip the strict per-IP `apiRateLimiter`
 * in routes registered inside the `authenticatePublic` scope.
 *
 * ## What is real vs. mocked
 *
 * - **Real:** the auth plugin, token generation/hashing
 *   (`generateApiToken`/`hashApiToken`), the module-global project/registration
 *   limiters, and — for the bypass test — the real `linkRoutes` handler.
 * - **Mocked:** the persistence layer (`../db/index.js`), so no Postgres
 *   pool is built. Rate limiting is deliberately NOT disabled here (unlike
 *   most route suites) because the quota behaviour is the subject under
 *   test; tests use distinct client ids / IPs for bucket isolation.
 */
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiClient, ApiClientToken, DeveloperProject } from "../db/api-access-repository.js";

vi.stubEnv("INTERNAL_API_KEY", "internal-test-key");

const mockApiAccessRepo = {
  findActiveApiClientByTokenHash: vi.fn(),
  touchApiClientTokenLastUsed: vi.fn().mockResolvedValue(undefined),
  createApiUsageEvent: vi.fn().mockResolvedValue(undefined),
};

const mockTrackRepo = {
  loadByTrackId: vi.fn().mockResolvedValue(null),
};

const mockGetApiAccessRepository = vi.fn(async () => mockApiAccessRepo);

vi.mock("../db/index.js", () => ({
  getApiAccessRepository: () => mockGetApiAccessRepository(),
  getRepository: async () => mockTrackRepo,
  getDeveloperRepository: async () => ({}),
}));

import linkRoutes from "../routes/link.js";
import { generateApiToken } from "../services/api-access-token.js";
import authPlugin from "./auth.js";

/**
 * Builds a complete {@link ApiClient} DTO that tests override field-by-field.
 *
 * @param overrides - Partial client fields to override the defaults.
 * @returns A fully populated API-client DTO.
 */
function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    id: "client-1",
    requestId: null,
    developerAccountId: "dev-1",
    projectId: "project-1",
    publicClientId: "mc_client_1",
    registrationType: "development",
    capabilities: ["legacy_api_key"],
    projectDisplayName: "App project",
    projectStatus: "active",
    projectRequestsPerMinute: null,
    projectRequestsPerDay: null,
    appName: "App",
    contactEmail: "dev@example.com",
    description: "Desc",
    status: "active",
    // Defaults model a key without overrides that inherits the Free tier.
    requestsPerMinute: null,
    requestsPerDay: null,
    tierId: "tier-free",
    tierName: "Free",
    tierRequestsPerMinute: 60,
    tierRequestsPerDay: 10000,
    effectiveRequestsPerMinute: 60,
    effectiveRequestsPerDay: 10000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    createdByAdminId: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<DeveloperProject> = {}): DeveloperProject {
  return {
    id: "project-1",
    developerAccountId: "dev-1",
    displayName: "App project",
    status: "active",
    requestsPerMinute: null,
    requestsPerDay: null,
    tierId: "tier-free",
    tierName: "Free",
    tierRequestsPerMinute: 60,
    tierRequestsPerDay: 10000,
    effectiveRequestsPerMinute: 60,
    effectiveRequestsPerDay: 10000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    suspendedAt: null,
    deletedAt: null,
    createdByAdminId: null,
    ...overrides,
  };
}

/**
 * Builds a complete {@link ApiClientToken} DTO that tests override field-by-field.
 *
 * @param overrides - Partial token fields to override the defaults.
 * @returns A fully populated API-client-token DTO.
 */
function makeToken(overrides: Partial<ApiClientToken> = {}): ApiClientToken {
  return {
    id: "token-1",
    clientId: "client-1",
    tokenPrefix: "abc123",
    tokenHash: "deadbeef",
    status: "active",
    createdAt: 1_700_000_000_000,
    lastUsedAt: null,
    revokedAt: null,
    rotatedFromTokenId: null,
    ...overrides,
  };
}

/**
 * Mints a real live API token and wires the repo mock so exactly that
 * token's hash resolves to the given client (any other hash misses) —
 * mirroring the DB lookup's behaviour without a pool.
 *
 * @param client - The client the token should resolve to.
 * @returns The raw token to send as `X-API-Key`, plus the resolved pair.
 */
function issueToken(
  client: ApiClient,
  projectOverrides: Partial<DeveloperProject> = {},
): { raw: string; token: ApiClientToken } {
  const generated = generateApiToken();
  const token = makeToken({ id: `token-${client.id}`, clientId: client.id, tokenHash: generated.hash });
  mockApiAccessRepo.findActiveApiClientByTokenHash.mockImplementation(async (hash: string) =>
    hash === generated.hash
      ? {
          project: makeProject({
            id: client.projectId,
            effectiveRequestsPerMinute: client.effectiveRequestsPerMinute,
            effectiveRequestsPerDay: client.effectiveRequestsPerDay,
            ...projectOverrides,
          }),
          client,
          token,
        }
      : null,
  );
  return { raw: generated.raw, token };
}

/**
 * Wires a Fastify instance mirroring `server.ts`'s `protectedRoutes` scope:
 * the real auth plugin, a probe route echoing `request.apiClient`, and the
 * real `linkRoutes` (for the per-IP-bypass tests). The response `$ref`
 * schemas link.ts declares are stubbed minimally — this suite only asserts
 * status codes, never serialized 200 bodies.
 *
 * @returns The ready app.
 */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(jwt, { secret: "test-auth-plugin-secret" });
  await app.register(cookie);
  await app.register(authPlugin);
  for (const $id of ["ErrorResponse", "Track", "PlatformLink", "LinkMetadataResponse"]) {
    app.addSchema({ $id, type: "object", additionalProperties: true });
  }
  await app.register(async function protectedRoutes(scope) {
    scope.addHook("preHandler", scope.authenticatePublic);
    scope.get("/protected", async (request) => ({
      ok: true,
      clientId: request.apiClient?.id ?? null,
      projectId: request.apiProject?.id ?? null,
    }));
    await scope.register(linkRoutes);
  });
  await app.ready();
  return app;
}

beforeEach(() => {
  delete process.env.DISABLE_RATE_LIMIT;
  vi.clearAllMocks();
  mockApiAccessRepo.touchApiClientTokenLastUsed.mockResolvedValue(undefined);
  mockApiAccessRepo.findActiveApiClientByTokenHash.mockResolvedValue(null);
  mockApiAccessRepo.createApiUsageEvent.mockResolvedValue(undefined);
  mockGetApiAccessRepository.mockResolvedValue(mockApiAccessRepo);
  mockTrackRepo.loadByTrackId.mockResolvedValue(null);
});

describe("authenticatePublic", () => {
  it("rejects requests with no credentials", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/protected" });
    expect(response.statusCode).toBe(401);
  });

  it("lets the internal BFF key through without touching the token repo", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": "internal-test-key" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().clientId).toBeNull();
    expect(mockApiAccessRepo.findActiveApiClientByTokenHash).not.toHaveBeenCalled();
  });

  it("rejects Bearer JWTs on public API routes", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: "external-client" })}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects invalid Bearer JWTs on public API routes", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("authenticates a valid live API token, attaches apiClient, and stamps lastUsedAt", async () => {
    const app = await buildApp();
    const { raw, token } = issueToken(makeClient({ id: "client-valid" }));

    const response = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });

    expect(response.statusCode).toBe(200);
    expect(response.json().clientId).toBe("client-valid");
    expect(response.json().projectId).toBe("project-1");
    expect(mockApiAccessRepo.touchApiClientTokenLastUsed).toHaveBeenCalledWith(token.id);
    expect(mockApiAccessRepo.createApiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        projectId: "project-1",
        registrationId: "client-valid",
        tokenId: token.id,
        method: "GET",
        endpointTemplate: "/protected",
        statusCode: 200,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("keeps the response successful and logs a fallback when usage persistence cannot load its repository", async () => {
    const app = await buildApp();
    const warnSpy = vi.spyOn(app.log, "warn");
    const { raw } = issueToken(makeClient({ id: "client-usage-repository-failure" }));
    mockGetApiAccessRepository
      .mockResolvedValueOnce(mockApiAccessRepo)
      .mockRejectedValueOnce(new Error("repository unavailable"));

    const response = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });

    expect(response.statusCode).toBe(200);
    expect(response.json().clientId).toBe("client-usage-repository-failure");
    expect(mockApiAccessRepo.createApiUsageEvent).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "createApiUsageEvent",
        projectId: "project-1",
        registrationId: "client-usage-repository-failure",
        result: "usage_not_recorded",
      }),
      "Failed to persist API usage event",
    );
  });

  it("keeps the response successful and redacts last-use bookkeeping failures", async () => {
    const app = await buildApp();
    const warnSpy = vi.spyOn(app.log, "warn");
    const { raw } = issueToken(makeClient({ id: "client-last-used-failure", projectId: "project-last-used-failure" }));
    mockApiAccessRepo.touchApiClientTokenLastUsed.mockRejectedValueOnce(
      new Error("postgresql://db:secret@localhost/musiccloud unavailable"),
    );

    const response = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cause: expect.objectContaining({ message: "[REDACTED_DB_URL] unavailable" }),
          errorCode: "MC-DB-0004",
          operation: "touchApiClientTokenLastUsed",
          outcome: "last_used_not_recorded",
          projectId: "project-last-used-failure",
          registrationId: "client-last-used-failure",
        }),
        "Failed to stamp API registration token usage",
      ),
    );
  });

  it("shares one project quota across multiple registrations", async () => {
    const app = await buildApp();
    const projectId = "project-shared-budget";
    const firstClient = makeClient({
      id: "registration-a",
      projectId,
      effectiveRequestsPerMinute: 2,
      effectiveRequestsPerDay: 100,
    });
    const secondClient = makeClient({
      id: "registration-b",
      projectId,
      effectiveRequestsPerMinute: 2,
      effectiveRequestsPerDay: 100,
    });
    const firstGenerated = generateApiToken();
    const secondGenerated = generateApiToken();
    const firstToken = makeToken({
      id: "token-registration-a",
      clientId: firstClient.id,
      tokenHash: firstGenerated.hash,
    });
    const secondToken = makeToken({
      id: "token-registration-b",
      clientId: secondClient.id,
      tokenHash: secondGenerated.hash,
    });
    mockApiAccessRepo.findActiveApiClientByTokenHash.mockImplementation(async (hash: string) => {
      const project = makeProject({ id: projectId, effectiveRequestsPerMinute: 2, effectiveRequestsPerDay: 100 });
      if (hash === firstGenerated.hash) return { project, client: firstClient, token: firstToken };
      if (hash === secondGenerated.hash) return { project, client: secondClient, token: secondToken };
      return null;
    });

    const first = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": firstGenerated.raw } });
    const second = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": secondGenerated.raw },
    });
    const third = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": firstGenerated.raw } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(mockApiAccessRepo.createApiUsageEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectId,
        registrationId: firstClient.id,
        statusCode: 429,
      }),
    );
  });

  it("keeps sibling project quota buckets independent", async () => {
    const app = await buildApp();
    const firstClient = makeClient({
      id: "registration-project-a",
      projectId: "project-independent-a",
      effectiveRequestsPerMinute: 1,
      effectiveRequestsPerDay: 100,
    });
    const secondClient = makeClient({
      id: "registration-project-b",
      projectId: "project-independent-b",
      effectiveRequestsPerMinute: 1,
      effectiveRequestsPerDay: 100,
    });
    const firstGenerated = generateApiToken();
    const secondGenerated = generateApiToken();
    mockApiAccessRepo.findActiveApiClientByTokenHash.mockImplementation(async (hash: string) => {
      if (hash === firstGenerated.hash) {
        return {
          project: makeProject({
            id: firstClient.projectId,
            effectiveRequestsPerMinute: 1,
            effectiveRequestsPerDay: 100,
          }),
          client: firstClient,
          token: makeToken({ clientId: firstClient.id, tokenHash: hash }),
        };
      }
      if (hash === secondGenerated.hash) {
        return {
          project: makeProject({
            id: secondClient.projectId,
            effectiveRequestsPerMinute: 1,
            effectiveRequestsPerDay: 100,
          }),
          client: secondClient,
          token: makeToken({ clientId: secondClient.id, tokenHash: hash }),
        };
      }
      return null;
    });

    const firstProjectRequest = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": firstGenerated.raw },
    });
    const siblingProjectRequest = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": secondGenerated.raw },
    });
    const firstProjectSecondRequest = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": firstGenerated.raw },
    });

    expect(firstProjectRequest.statusCode).toBe(200);
    expect(siblingProjectRequest.statusCode).toBe(200);
    expect(firstProjectSecondRequest.statusCode).toBe(429);
  });

  it("enforces a registration cap below the owning project quota", async () => {
    const app = await buildApp();
    const client = makeClient({
      id: "registration-narrow-cap",
      projectId: "project-with-wider-quota",
      effectiveRequestsPerMinute: 1,
      effectiveRequestsPerDay: 100,
    });
    const { raw } = issueToken(client, {
      effectiveRequestsPerMinute: 10,
      effectiveRequestsPerDay: 1000,
    });

    const first = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });
    const second = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });

  it("rejects an unknown live API token with 401 and never stamps usage", async () => {
    const app = await buildApp();
    // No issueToken wiring: every hash misses, standing in for unknown,
    // revoked, and rotated tokens as well as suspended/revoked clients —
    // the repo lookup returns null for all of them.
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": "mc_live_abc123def456_abcdefghijklmnopqrstuvwxyzABCDEF0123456789-_" },
    });

    expect(response.statusCode).toBe(401);
    expect(mockApiAccessRepo.touchApiClientTokenLastUsed).not.toHaveBeenCalled();
  });

  it("rejects stale UUID-shaped public API keys without a repository lookup", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": "00000000-0000-4000-8000-000000000000" },
    });

    expect(response.statusCode).toBe(401);
    expect(mockApiAccessRepo.findActiveApiClientByTokenHash).not.toHaveBeenCalled();
    expect(mockApiAccessRepo.touchApiClientTokenLastUsed).not.toHaveBeenCalled();
  });

  it("enforces the client's effective requestsPerMinute with 429 + Retry-After", async () => {
    const app = await buildApp();
    const { raw } = issueToken(
      makeClient({
        id: "client-rpm",
        projectId: "project-rpm",
        requestsPerMinute: 2,
        requestsPerDay: 100,
        effectiveRequestsPerMinute: 2,
        effectiveRequestsPerDay: 100,
      }),
    );

    const first = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });
    const second = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });
    const third = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.headers["retry-after"]).toBeDefined();
    expect(third.json().error).toBe("MC-API-0003");
  });

  it("enforces the client's effective requestsPerDay with 429", async () => {
    const app = await buildApp();
    const { raw } = issueToken(
      makeClient({
        id: "client-rpd",
        projectId: "project-rpd",
        requestsPerMinute: 100,
        requestsPerDay: 1,
        effectiveRequestsPerMinute: 100,
        effectiveRequestsPerDay: 1,
      }),
    );

    const first = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });
    const second = await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": raw } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });

  it("skips the per-IP apiRateLimiter for token-authenticated callers", async () => {
    const app = await buildApp();
    const { raw } = issueToken(makeClient({ id: "client-bypass" }));
    const url = ROUTE_TEMPLATES.v1.link.replace(":id", "tr_missing");

    // 12 requests from one IP: the per-IP limiter (10/60s) would trip at
    // request 11, the project's own quota (60/min) would not. All twelve
    // must reach the handler (404 = auth passed, per-IP limiter skipped).
    for (let i = 0; i < 12; i++) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { "x-api-key": raw },
        remoteAddress: "10.50.0.1",
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it("keeps the per-IP apiRateLimiter for internal BFF callers", async () => {
    const app = await buildApp();
    const url = ROUTE_TEMPLATES.v1.link.replace(":id", "tr_missing");

    // Own IP for bucket isolation from the bypass test above.
    for (let i = 0; i < 10; i++) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { "x-api-key": "internal-test-key" },
        remoteAddress: "10.60.0.2",
      });
      expect(response.statusCode).toBe(404);
    }
    const eleventh = await app.inject({
      method: "GET",
      url,
      headers: { "x-api-key": "internal-test-key" },
      remoteAddress: "10.60.0.2",
    });
    expect(eleventh.statusCode).toBe(429);
  });
});
