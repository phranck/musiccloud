/**
 * @file Route tests for the developer self-service API-access surface
 * (`/api/dev/api-access/*`, MC-077). Drives the real {@link devApiAccessRoutes}
 * handlers through `app.inject` against a Fastify instance wired like
 * `server.ts`'s `devProtectedRoutes` scope: a `preHandler` stands in for
 * `authenticateDeveloper` by setting `request.developerAccountId` and
 * `request.developerAccount` directly (the cookie-verification half is
 * already covered by `plugins/auth.ts`/`developer-github.test.ts`; this
 * suite's job is the route logic once the caller is known).
 *
 * ## What is real vs. mocked
 *
 * - **Real:** route logic, ownership checks (`loadOwnedClientForToken`),
 *   input validation, response shaping, the per-developer token-mutation
 *   rate limiter (disabled via `DISABLE_RATE_LIMIT`).
 * - **Mocked:** the persistence layer (`getApiAccessRepository` from
 *   `../db/index.js`) so no Postgres pool is built. `generateApiToken` runs
 *   for real.
 */
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { EmailAction, EmailRecipientKind, ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAccessRequest, ApiClient, ApiClientToken, DeveloperProject } from "../db/api-access-repository.js";
import type { DeveloperAccount } from "../db/developer-repository.js";

vi.stubEnv("DISABLE_RATE_LIMIT", "true");

const mockDeveloperRepo = {
  findDeveloperAccountById: vi.fn(async () => ({
    id: "dev-1",
    email: "dev@example.com",
    displayName: "Dev Jane",
  })),
};

const mockRepo = {
  createDeveloperProject: vi.fn(),
  findDeveloperProjectById: vi.fn(),
  listDeveloperProjectsByAccount: vi.fn().mockResolvedValue([]),
  updateDeveloperProject: vi.fn(),
  createApiAccessRequest: vi.fn(),
  findApiAccessRequestById: vi.fn(),
  listApiAccessRequestsByDeveloperAccount: vi.fn().mockResolvedValue([]),
  listApiAccessRequests: vi.fn(),
  reviewApiAccessRequest: vi.fn(),
  createApiClient: vi.fn(),
  findApiClientById: vi.fn(),
  listApiClientsByDeveloperAccount: vi.fn().mockResolvedValue([]),
  listApiClientsByProject: vi.fn().mockResolvedValue([]),
  listApiClients: vi.fn(),
  updateApiClient: vi.fn(),
  createApiClientToken: vi.fn(),
  listApiClientTokensByClient: vi.fn().mockResolvedValue([]),
  findApiClientTokenById: vi.fn(),
  revokeApiClientToken: vi.fn(),
  rotateApiClientToken: vi.fn(),
  createApiAccessAuditEvent: vi.fn().mockResolvedValue({}),
};

vi.mock("../db/index.js", () => ({
  getApiAccessRepository: async () => mockRepo,
  getDeveloperRepository: async () => mockDeveloperRepo,
}));

vi.mock("../services/email-actions.js", () => ({
  triggerEmailAction: vi.fn(async () => undefined),
}));

import { triggerEmailAction } from "../services/email-actions.js";
import { devApiAccessRoutes } from "./dev-api-access.js";

/**
 * Builds a complete {@link DeveloperAccount} DTO for stamping onto
 * `request.developerAccount` in the `buildApp` preHandler stub, standing in
 * for the row `authenticateDeveloper` would have loaded.
 *
 * @param developerAccountId - The account id, matching `request.developerAccountId`.
 * @returns A fully populated developer-account DTO.
 */
function makeDeveloperAccount(developerAccountId: string): DeveloperAccount {
  return {
    id: developerAccountId,
    email: "dev@example.com",
    emailVerifiedAt: 1_700_000_000_000,
    passwordHash: null,
    displayName: null,
    avatarUrl: null,
    tierId: null,
    status: "active",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastLoginAt: null,
  };
}

/**
 * Builds a complete {@link ApiAccessRequest} DTO that tests can override field-by-field.
 *
 * @param overrides - Partial request fields to override the defaults.
 * @returns A fully populated API-access-request DTO.
 */
function makeRequest(overrides: Partial<ApiAccessRequest> = {}): ApiAccessRequest {
  return {
    id: "req-1",
    developerAccountId: "dev-1",
    projectId: null,
    contactEmail: "dev@example.com",
    appName: "App",
    appDescription: "Desc",
    estimatedRequestsPerDay: 100,
    status: "pending",
    submittedAt: 1_700_000_000_000,
    reviewedAt: null,
    reviewedByAdminId: null,
    reviewNote: null,
    ...overrides,
  };
}

/**
 * Builds a complete {@link ApiClient} DTO that tests can override field-by-field.
 *
 * @param overrides - Partial client fields to override the defaults.
 * @returns A fully populated API-client DTO.
 */
function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    id: "client-1",
    requestId: "req-1",
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
 * Builds a complete {@link ApiClientToken} DTO that tests can override field-by-field.
 *
 * @param overrides - Partial token fields to override the defaults.
 * @returns A fully populated API-client-token DTO.
 */
function makeToken(overrides: Partial<ApiClientToken> = {}): ApiClientToken {
  return {
    id: "token-1",
    clientId: "client-1",
    tokenPrefix: "mcpat_abc",
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
 * Wires a Fastify instance mirroring `server.ts`'s `devProtectedRoutes` scope:
 * a `preHandler` that sets `request.developerAccountId`/`request.developerAccount`
 * directly (standing in for `authenticateDeveloper`'s cookie-verification and
 * account-load half, which is exercised separately in `plugins/auth.ts`),
 * plus the routes under test. `jwt`/`cookie` are registered for parity with
 * the real app even though these routes don't read them directly.
 *
 * @param developerAccountId - The account id the preHandler stamps onto the request.
 * @returns The ready app.
 */
async function buildApp(developerAccountId = "dev-1"): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(jwt, { secret: "test-dev-api-access-secret" });
  await app.register(cookie);
  await app.register(async function devProtectedRoutes(devApp) {
    devApp.addHook("preHandler", async (request) => {
      request.developerAccountId = developerAccountId;
      request.developerAccount = makeDeveloperAccount(developerAccountId);
    });
    await devApp.register(devApiAccessRoutes);
  });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.listApiClientTokensByClient.mockResolvedValue([]);
  mockRepo.listApiAccessRequestsByDeveloperAccount.mockResolvedValue([]);
  mockRepo.listApiClientsByDeveloperAccount.mockResolvedValue([]);
  mockRepo.listDeveloperProjectsByAccount.mockResolvedValue([]);
  mockRepo.listApiClientsByProject.mockResolvedValue([]);
  mockRepo.createApiAccessAuditEvent.mockResolvedValue({});
});

describe("devApiAccessRoutes", () => {
  describe("project aggregate", () => {
    it("creates and lists independent caller-owned projects", async () => {
      const app = await buildApp("dev-1");
      mockRepo.createDeveloperProject.mockResolvedValue(makeProject());
      mockRepo.listDeveloperProjectsByAccount.mockResolvedValue([
        makeProject(),
        makeProject({ id: "project-2", displayName: "Second app", tierId: "tier-pro", tierName: "Pro" }),
      ]);

      const created = await app.inject({
        method: "POST",
        url: ENDPOINTS.dev.apiAccess.projects,
        payload: { displayName: "App project" },
      });
      const listed = await app.inject({ method: "GET", url: ENDPOINTS.dev.apiAccess.projects });

      expect(created.statusCode).toBe(201);
      for (const secretField of ["rawToken", "tokenHash", "tokens", "publicClientId", "creemSubscriptionId"]) {
        expect(created.json().project).not.toHaveProperty(secretField);
      }
      expect(mockRepo.createDeveloperProject).toHaveBeenCalledWith(
        expect.objectContaining({ developerAccountId: "dev-1", displayName: "App project" }),
      );
      expect(listed.statusCode).toBe(200);
      expect(listed.json().projects).toHaveLength(2);
      expect(mockRepo.listDeveloperProjectsByAccount).toHaveBeenCalledWith("dev-1");
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "project-1", eventType: "project_created" }),
      );
    });

    it("does not expose a project owned by another account", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findDeveloperProjectById.mockResolvedValue(makeProject({ developerAccountId: "dev-2" }));

      const response = await app.inject({
        method: "GET",
        url: ROUTE_TEMPLATES.dev.apiAccess.projectDetail.replace(":id", "project-1"),
      });

      expect(response.statusCode).toBe(404);
    });

    it("creates typed registrations only below an owned active project", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findDeveloperProjectById.mockResolvedValue(makeProject());
      mockRepo.createApiClient.mockResolvedValue(
        makeClient({ registrationType: "confidential", publicClientId: "mc_client_distinct" }),
      );

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.projectRegistrations.replace(":id", "project-1"),
        payload: { name: "Production", registrationType: "confidential", capabilities: ["client_credentials"] },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().registration).toMatchObject({
        projectId: "project-1",
        publicClientId: "mc_client_distinct",
        registrationType: "confidential",
      });
      expect(mockRepo.createApiClient).toHaveBeenCalledWith(
        expect.objectContaining({
          developerAccountId: "dev-1",
          projectId: "project-1",
          registrationType: "confidential",
          capabilities: ["client_credentials"],
        }),
      );
    });

    it("rejects non-array registration capabilities before persistence", async () => {
      const app = await buildApp("dev-1");

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.projectRegistrations.replace(":id", "project-1"),
        payload: { name: "Production", registrationType: "confidential", capabilities: "client_credentials" },
      });

      expect(response.statusCode).toBe(400);
      expect(mockRepo.findDeveloperProjectById).not.toHaveBeenCalled();
      expect(mockRepo.createApiClient).not.toHaveBeenCalled();
    });

    it("rejects registration creation below a suspended project", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findDeveloperProjectById.mockResolvedValue(makeProject({ status: "suspended" }));

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.projectRegistrations.replace(":id", "project-1"),
        payload: { name: "Production", registrationType: "public" },
      });

      expect(response.statusCode).toBe(409);
      expect(mockRepo.createApiClient).not.toHaveBeenCalled();
    });
  });

  describe("POST requestsCreate", () => {
    it("rejects a payload missing all fields with 400", async () => {
      const app = await buildApp();
      const response = await app.inject({ method: "POST", url: ENDPOINTS.dev.apiAccess.requestsCreate, payload: {} });
      expect(response.statusCode).toBe(400);
      expect(mockRepo.createApiAccessRequest).not.toHaveBeenCalled();
    });

    it("rejects a blank appName with 400", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: ENDPOINTS.dev.apiAccess.requestsCreate,
        payload: { appName: "   ", appDescription: "Desc", estimatedRequestsPerDay: 100 },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects a non-positive estimatedRequestsPerDay with 400", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: ENDPOINTS.dev.apiAccess.requestsCreate,
        payload: { appName: "App", appDescription: "Desc", estimatedRequestsPerDay: 0 },
      });
      expect(response.statusCode).toBe(400);
    });

    it("succeeds with a valid payload, stamping the caller's account and email", async () => {
      const app = await buildApp();
      mockRepo.createApiAccessRequest.mockResolvedValue(makeRequest());

      const response = await app.inject({
        method: "POST",
        url: ENDPOINTS.dev.apiAccess.requestsCreate,
        payload: { appName: "App", appDescription: "Desc", estimatedRequestsPerDay: 100 },
      });

      expect(response.statusCode).toBe(201);
      expect(mockRepo.createApiAccessRequest).toHaveBeenCalledWith(
        expect.objectContaining({ developerAccountId: "dev-1", contactEmail: "dev@example.com", appName: "App" }),
      );
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-1",
          eventType: "request_submitted",
          actorDeveloperAccountId: "dev-1",
        }),
      );
      // Response never carries the developerAccountId (dev self-service DTO omits it).
      expect(response.json().request).not.toHaveProperty("developerAccountId");
    });
  });

  describe("GET requestsList / clientsList", () => {
    it("lists only the caller's own requests", async () => {
      const app = await buildApp("dev-1");
      mockRepo.listApiAccessRequestsByDeveloperAccount.mockResolvedValue([makeRequest()]);

      const response = await app.inject({ method: "GET", url: ENDPOINTS.dev.apiAccess.requestsList });

      expect(response.statusCode).toBe(200);
      expect(mockRepo.listApiAccessRequestsByDeveloperAccount).toHaveBeenCalledWith("dev-1");
      expect(response.json().requests).toHaveLength(1);
    });

    it("lists only the caller's own clients with their tokens", async () => {
      const app = await buildApp("dev-1");
      mockRepo.listApiClientsByDeveloperAccount.mockResolvedValue([makeClient()]);
      mockRepo.listApiClientTokensByClient.mockResolvedValue([makeToken()]);

      const response = await app.inject({ method: "GET", url: ENDPOINTS.dev.apiAccess.clientsList });

      expect(response.statusCode).toBe(200);
      expect(mockRepo.listApiClientsByDeveloperAccount).toHaveBeenCalledWith("dev-1");
      const body = response.json();
      expect(body.clients).toHaveLength(1);
      expect(body.clients[0].tokens).toHaveLength(1);
      expect(body.clients[0].tokens[0].tokenHash).toBeUndefined();
    });
  });

  describe("POST clientCreateToken", () => {
    it("notifies the developer that a token was created for their app", async () => {
      mockRepo.findApiClientById.mockResolvedValue(
        makeClient({ developerAccountId: "dev-1", appName: "My Music App" }),
      );
      mockRepo.createApiClientToken.mockResolvedValue(makeToken());
      const app = await buildApp("dev-1");

      const res = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken.replace(":id", "client-1"),
      });

      expect(res.statusCode).toBe(201);
      expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledWith(EmailAction.DeveloperApiTokenCreated, {
        to: { email: "dev@example.com" },
        recipient: { kind: EmailRecipientKind.DeveloperAccount, email: "dev@example.com", displayName: "Dev Jane" },
        context: { appName: "My Music App" },
      });
    });

    it("returns the raw token once for an owned client, never the hash", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientById.mockResolvedValue(makeClient({ developerAccountId: "dev-1" }));
      mockRepo.createApiClientToken.mockResolvedValue(makeToken());

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken.replace(":id", "client-1"),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.token.rawToken).toBeTruthy();
      expect(typeof body.token.rawToken).toBe("string");
      expect(body.token.tokenHash).toBeUndefined();
      expect(Object.keys(body.token)).not.toContain("tokenHash");
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          clientId: "client-1",
          eventType: "token_created",
          actorDeveloperAccountId: "dev-1",
        }),
      );
    });

    it("returns 404 (not 403) for a client owned by a different developer account", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientById.mockResolvedValue(makeClient({ developerAccountId: "someone-else" }));

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken.replace(":id", "client-1"),
      });

      expect(response.statusCode).toBe(404);
      expect(mockRepo.createApiClientToken).not.toHaveBeenCalled();
    });

    it("rejects token creation while the owning project is suspended", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientById.mockResolvedValue(
        makeClient({ developerAccountId: "dev-1", projectStatus: "suspended" }),
      );

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken.replace(":id", "client-1"),
      });

      expect(response.statusCode).toBe(409);
      expect(mockRepo.createApiClientToken).not.toHaveBeenCalled();
    });

    it("returns 404 for a nonexistent client", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientById.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken.replace(":id", "missing"),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST tokenRevoke", () => {
    it("revokes an owned token and audits it without leaking secrets", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientTokenById.mockResolvedValue(makeToken());
      mockRepo.findApiClientById.mockResolvedValue(makeClient({ developerAccountId: "dev-1" }));
      mockRepo.revokeApiClientToken.mockResolvedValue(makeToken({ status: "revoked", revokedAt: 1_700_000_200_000 }));

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.tokenRevoke.replace(":id", "token-1"),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.token.tokenHash).toBeUndefined();
      expect(body.token.rawToken).toBeUndefined();
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          clientId: "client-1",
          tokenId: "token-1",
          eventType: "token_revoked",
          actorDeveloperAccountId: "dev-1",
        }),
      );
      const auditCall = mockRepo.createApiAccessAuditEvent.mock.calls[0]![0];
      expect(JSON.stringify(auditCall)).not.toContain("deadbeef");
    });

    it("returns 404 (not 403) when the token belongs to a different developer account", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientTokenById.mockResolvedValue(makeToken());
      mockRepo.findApiClientById.mockResolvedValue(makeClient({ developerAccountId: "someone-else" }));

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.tokenRevoke.replace(":id", "token-1"),
      });

      expect(response.statusCode).toBe(404);
      expect(mockRepo.revokeApiClientToken).not.toHaveBeenCalled();
    });

    it("returns 404 for a nonexistent token", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientTokenById.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.tokenRevoke.replace(":id", "missing"),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST tokenRotate", () => {
    it("notifies the developer that a new token was created by the rotation", async () => {
      const owned = makeClient({ developerAccountId: "dev-1", appName: "My Music App" });
      mockRepo.findApiClientTokenById.mockResolvedValue(makeToken({ clientId: "client-1" }));
      mockRepo.findApiClientById.mockResolvedValue(owned);
      mockRepo.rotateApiClientToken.mockResolvedValue({
        oldToken: makeToken({ id: "token-old", status: "revoked" }),
        newToken: makeToken({ id: "token-new" }),
      });
      const app = await buildApp("dev-1");

      const res = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.tokenRotate.replace(":id", "token-old"),
      });

      expect(res.statusCode).toBe(201);
      expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledWith(
        EmailAction.DeveloperApiTokenCreated,
        expect.objectContaining({ context: { appName: "My Music App" } }),
      );
    });

    it("rotates an owned token, returns the new raw token once, and audits without leaking secrets", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientTokenById.mockResolvedValue(makeToken({ id: "token-1" }));
      mockRepo.findApiClientById.mockResolvedValue(makeClient({ developerAccountId: "dev-1" }));
      mockRepo.rotateApiClientToken.mockResolvedValue({
        oldToken: makeToken({ id: "token-1", status: "rotated" }),
        newToken: makeToken({ id: "token-2" }),
      });

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.tokenRotate.replace(":id", "token-1"),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.token.id).toBe("token-2");
      expect(body.token.rawToken).toBeTruthy();
      expect(body.token.tokenHash).toBeUndefined();
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          clientId: "client-1",
          tokenId: "token-2",
          eventType: "token_rotated",
          actorDeveloperAccountId: "dev-1",
          eventData: { rotatedFromTokenId: "token-1" },
        }),
      );
      const auditCall = mockRepo.createApiAccessAuditEvent.mock.calls[0]![0];
      expect(JSON.stringify(auditCall)).not.toContain("deadbeef");
    });

    it("returns 404 (not 403) when rotating a token owned by a different developer account", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientTokenById.mockResolvedValue({ id: "token-1", clientId: "client-1" });
      mockRepo.findApiClientById.mockResolvedValue({ id: "client-1", developerAccountId: "someone-else" });

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.tokenRotate.replace(":id", "token-1"),
      });

      expect(response.statusCode).toBe(404);
      expect(mockRepo.rotateApiClientToken).not.toHaveBeenCalled();
    });

    it("rejects token rotation while the owning project is suspended", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientTokenById.mockResolvedValue(makeToken({ id: "token-1" }));
      mockRepo.findApiClientById.mockResolvedValue(
        makeClient({ developerAccountId: "dev-1", projectStatus: "suspended" }),
      );

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.tokenRotate.replace(":id", "token-1"),
      });

      expect(response.statusCode).toBe(409);
      expect(mockRepo.rotateApiClientToken).not.toHaveBeenCalled();
    });

    it("returns 404 when there is no active token to rotate", async () => {
      const app = await buildApp("dev-1");
      mockRepo.findApiClientTokenById.mockResolvedValue(makeToken({ id: "token-1" }));
      mockRepo.findApiClientById.mockResolvedValue(makeClient({ developerAccountId: "dev-1" }));
      mockRepo.rotateApiClientToken.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.dev.apiAccess.tokenRotate.replace(":id", "token-1"),
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
