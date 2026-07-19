/**
 * @file Route tests for the admin API-access surface
 * (`/api/admin/developer/api-access/*`, MC-077). Drives the real
 * {@link adminApiAccessRoutes} handlers through `app.inject` against a
 * Fastify instance wired like `server.ts`'s `adminRoutes` scope: `@fastify/jwt`
 * → a `preHandler` that verifies the Bearer JWT (standing in for
 * `authenticateAdmin`, since the module under test performs its own
 * finer-grained owner/admin/moderator check via {@link getAdminRepository})
 * → `@fastify/cookie` → route registration.
 *
 * ## What is real vs. mocked
 *
 * - **Real:** route logic, the `requireOwnerOrAdmin` role gate, JWT
 *   verification, response shaping (`toRequestResponse`/`toClientResponse`/
 *   `toTokenResponse`).
 * - **Mocked:** the persistence layer (`getApiAccessRepository` and
 *   `getAdminRepository` from `../db/index.js`) so no Postgres pool is built,
 *   and `generateApiToken` is exercised for real (no network/secrets
 *   involved) to produce a genuine raw/hash/prefix triple.
 */
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminUser } from "../db/admin-repository.js";
import type { ApiAccessRequest, ApiClient, ApiClientToken, DeveloperProject } from "../db/api-access-repository.js";

vi.stubEnv("DISABLE_RATE_LIMIT", "true");

const mockRepo = {
  createDeveloperProject: vi.fn(),
  findDeveloperProjectById: vi.fn(),
  listDeveloperProjectsByAccount: vi.fn().mockResolvedValue([]),
  updateDeveloperProject: vi.fn(),
  setDeveloperProjectSubscription: vi.fn(),
  findDeveloperProjectSubscription: vi.fn(),
  createApiAccessRequest: vi.fn(),
  findApiAccessRequestById: vi.fn(),
  listApiAccessRequestsByDeveloperAccount: vi.fn(),
  listApiAccessRequests: vi.fn(),
  reviewApiAccessRequest: vi.fn(),
  createApiClient: vi.fn(),
  findApiClientById: vi.fn(),
  listApiClientsByDeveloperAccount: vi.fn(),
  listApiClients: vi.fn(),
  updateApiClient: vi.fn(),
  createApiClientToken: vi.fn(),
  listApiClientTokensByClient: vi.fn().mockResolvedValue([]),
  findApiClientTokenById: vi.fn(),
  revokeApiClientToken: vi.fn(),
  activateApiClientToken: vi.fn(),
  createApiAccessAuditEvent: vi.fn().mockResolvedValue({}),
};

const mockTierRepo = {
  listTiers: vi.fn().mockResolvedValue([]),
};

const mockAdminRepo = {
  findAdminById: vi.fn(),
};

const mockDeveloperRepo = {
  findDeveloperAccountById: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getApiAccessRepository: async () => mockRepo,
  getAdminRepository: async () => mockAdminRepo,
  getDeveloperRepository: async () => mockDeveloperRepo,
  getTierRepository: async () => mockTierRepo,
}));

vi.mock("../services/email-actions.js", () => ({
  triggerEmailAction: vi.fn(async () => undefined),
}));

import { EmailAction, EmailRecipientKind } from "@musiccloud/shared";
import { triggerEmailAction } from "../services/email-actions.js";
import { adminApiAccessRoutes } from "./admin-api-access.js";

const TEST_JWT_SECRET = "test-admin-api-access-secret-key-do-not-use-in-prod";

/**
 * Builds a complete {@link AdminUser} DTO that tests can override field-by-field.
 *
 * @param overrides - Partial admin fields to override the defaults.
 * @returns A fully populated admin-user DTO.
 */
function makeAdmin(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "admin-1",
    username: "admin",
    passwordHash: "$2b$bcrypt-hash",
    email: "admin@example.com",
    role: "admin",
    firstName: null,
    lastName: null,
    avatarUrl: null,
    locale: "en",
    sessionTimeoutMinutes: null,
    createdAt: 1_699_000_000_000,
    lastLoginAt: null,
    ...overrides,
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
    contactEmail: "a@b.com",
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
    contactEmail: "a@b.com",
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
    createdByAdminId: "admin-1",
    ...overrides,
  };
}

function makeProject(overrides: Partial<DeveloperProject> = {}): DeveloperProject {
  return {
    id: "project-1",
    developerAccountId: "dev-1",
    displayName: "Official app",
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
 * Wires a Fastify instance mirroring `server.ts`'s `adminRoutes` scope: a JWT
 * plugin, a `preHandler` that verifies the Bearer token (standing in for
 * `authenticateAdmin`'s JWT-verification half — the finer owner/admin/
 * moderator distinction is `requireOwnerOrAdmin`'s own job inside the route
 * module), the cookie plugin (registered app-wide in `server.ts`), and the
 * routes under test.
 *
 * @param role - The DB role `getAdminRepository().findAdminById` resolves to.
 * @returns The ready app and a signed Bearer token for `sub: "admin-1"`.
 */
async function buildApp(role: "owner" | "admin" | "moderator") {
  const app: FastifyInstance = Fastify();
  await app.register(jwt, { secret: TEST_JWT_SECRET });
  await app.register(cookie);
  await app.register(async function adminRoutes(adminApp) {
    adminApp.addHook("preHandler", async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: "UNAUTHORIZED" });
      }
    });
    await adminApp.register(adminApiAccessRoutes);
  });
  await app.ready();
  mockAdminRepo.findAdminById.mockResolvedValue(makeAdmin({ role }));
  const token = app.jwt.sign({ sub: "admin-1", role: "admin" });
  return { app, token };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.listApiClientTokensByClient.mockResolvedValue([]);
  mockRepo.createApiAccessAuditEvent.mockResolvedValue({});
  mockRepo.createDeveloperProject.mockResolvedValue(makeProject());
  mockRepo.listDeveloperProjectsByAccount.mockResolvedValue([]);
  mockTierRepo.listTiers.mockResolvedValue([]);
});

describe("adminApiAccessRoutes", () => {
  describe("role gate (requireOwnerOrAdmin)", () => {
    it("rejects a moderator with 403 on the overview endpoint", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "GET",
        url: ENDPOINTS.admin.developer.apiAccess.overview,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(403);
      expect(mockRepo.listApiAccessRequests).not.toHaveBeenCalled();
    });

    it("rejects a moderator with 403 on requestDetail", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "GET",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestDetail.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it("rejects a moderator with 403 on requestApprove (a mutating endpoint)", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestApprove.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      // The 403 must be sent before any DB mutation is attempted.
      expect(mockRepo.findApiAccessRequestById).not.toHaveBeenCalled();
      expect(mockRepo.createApiClient).not.toHaveBeenCalled();
    });

    it("rejects a moderator with 403 on requestReject", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestReject.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { reviewNote: "no" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("rejects a moderator with 403 on clientDetail", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "GET",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientDetail.replace(":id", "client-1"),
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it("rejects a moderator with 403 on clientUpdate", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "PATCH",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientUpdate.replace(":id", "client-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "suspended" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("rejects a moderator with 403 on clientCreateToken", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientCreateToken.replace(":id", "client-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(mockRepo.createApiClientToken).not.toHaveBeenCalled();
    });

    it("rejects a moderator with 403 on tokenDeactivate", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.tokenDeactivate.replace(":id", "token-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(mockRepo.revokeApiClientToken).not.toHaveBeenCalled();
    });

    it("rejects a moderator with 403 on tokenActivate", async () => {
      const { app, token } = await buildApp("moderator");
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.tokenActivate.replace(":id", "token-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(mockRepo.activateApiClientToken).not.toHaveBeenCalled();
    });
  });

  describe("GET overview", () => {
    it("returns requests and clients for an owner", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.listApiAccessRequests.mockResolvedValue([]);
      mockRepo.listApiClients.mockResolvedValue([]);
      const response = await app.inject({
        method: "GET",
        url: ENDPOINTS.admin.developer.apiAccess.overview,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ requests: [], clients: [] });
    });

    it("passes the status query through to listApiAccessRequests", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.listApiAccessRequests.mockResolvedValue([]);
      mockRepo.listApiClients.mockResolvedValue([]);
      const response = await app.inject({
        method: "GET",
        url: `${ENDPOINTS.admin.developer.apiAccess.overview}?status=pending`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(mockRepo.listApiAccessRequests).toHaveBeenCalledWith("pending");
    });
  });

  describe("project administration", () => {
    it("lists projects for the selected developer account", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.listDeveloperProjectsByAccount.mockResolvedValue([
        makeProject(),
        makeProject({ id: "project-2", displayName: "Second app" }),
      ]);

      const response = await app.inject({
        method: "GET",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.accountProjects.replace(":accountId", "dev-1"),
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().projects).toHaveLength(2);
      expect(mockRepo.listDeveloperProjectsByAccount).toHaveBeenCalledWith("dev-1");
    });

    it("targets quota overrides and suspension at one project only", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.findDeveloperProjectById.mockResolvedValue(makeProject());
      mockRepo.updateDeveloperProject.mockResolvedValue(
        makeProject({ status: "suspended", requestsPerMinute: 500, effectiveRequestsPerMinute: 500 }),
      );

      const response = await app.inject({
        method: "PATCH",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.projectDetail.replace(":id", "project-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "suspended", requestsPerMinute: 500 },
      });

      expect(response.statusCode).toBe(200);
      expect(mockRepo.updateDeveloperProject).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({ status: "suspended", requestsPerMinute: 500 }),
      );
      expect(mockRepo.updateApiClient).not.toHaveBeenCalled();
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "project-1", eventType: "project_updated" }),
      );
    });

    it("changes the subscription tier for one project", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.findDeveloperProjectById.mockResolvedValue(makeProject());
      mockTierRepo.listTiers.mockResolvedValue([{ id: "tier-pro", enabled: true, name: "Pro" }]);
      mockRepo.setDeveloperProjectSubscription.mockResolvedValue({
        id: "subscription-1",
        projectId: "project-1",
        tierId: "tier-pro",
        creemSubscriptionId: null,
        creemCustomerId: null,
        status: "active",
        interval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      });

      const response = await app.inject({
        method: "PUT",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.projectSubscription.replace(":id", "project-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { tierId: "tier-pro" },
      });

      expect(response.statusCode).toBe(200);
      expect(mockRepo.setDeveloperProjectSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "project-1", tierId: "tier-pro" }),
      );
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "project-1", eventType: "project_subscription_updated" }),
      );
    });

    it("rejects an invalid subscription period date before persistence", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.findDeveloperProjectById.mockResolvedValue(makeProject());
      mockTierRepo.listTiers.mockResolvedValue([{ id: "tier-pro", enabled: true, name: "Pro" }]);

      const response = await app.inject({
        method: "PUT",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.projectSubscription.replace(":id", "project-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { tierId: "tier-pro", currentPeriodEnd: "not-a-date" },
      });

      expect(response.statusCode).toBe(400);
      expect(mockRepo.setDeveloperProjectSubscription).not.toHaveBeenCalled();
    });

    it.each([
      { label: "status", payload: { tierId: "tier-pro", status: "unknown" } },
      { label: "interval", payload: { tierId: "tier-pro", interval: "week" } },
      { label: "cancel flag", payload: { tierId: "tier-pro", cancelAtPeriodEnd: "yes" } },
    ])("rejects an invalid project subscription $label before persistence", async ({ payload }) => {
      const { app, token } = await buildApp("admin");
      mockRepo.findDeveloperProjectById.mockResolvedValue(makeProject());
      mockTierRepo.listTiers.mockResolvedValue([{ id: "tier-pro", enabled: true, name: "Pro" }]);

      const response = await app.inject({
        method: "PUT",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.projectSubscription.replace(":id", "project-1"),
        headers: { authorization: `Bearer ${token}` },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(mockRepo.setDeveloperProjectSubscription).not.toHaveBeenCalled();
    });
  });

  describe("POST requestApprove", () => {
    it("creates a client and marks the request approved", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.findApiAccessRequestById.mockResolvedValue(makeRequest());
      mockRepo.reviewApiAccessRequest.mockResolvedValue(
        makeRequest({ status: "approved", reviewedAt: 1_700_000_100_000, reviewedByAdminId: "admin-1" }),
      );
      mockRepo.createApiClient.mockResolvedValue(makeClient());

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestApprove.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(mockRepo.createApiClient).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-1",
          projectId: "project-1",
          registrationType: "development",
          createdByAdminId: "admin-1",
        }),
      );
      expect(mockRepo.createDeveloperProject).toHaveBeenCalledWith(
        expect.objectContaining({ developerAccountId: "dev-1", displayName: "App" }),
      );
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          requestId: "req-1",
          clientId: "client-1",
          eventType: "request_approved",
          actorAdminId: "admin-1",
        }),
      );
    });

    it("notifies the developer about the approval with the app name as context", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.findApiAccessRequestById.mockResolvedValue(makeRequest({ appName: "My Music App" }));
      mockRepo.reviewApiAccessRequest.mockResolvedValue(makeRequest({ status: "approved" }));
      mockRepo.createApiClient.mockResolvedValue(makeClient());
      mockDeveloperRepo.findDeveloperAccountById.mockResolvedValue({
        id: "dev-acc-1",
        email: "dev@example.com",
        displayName: "Dev Jane",
      });

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestApprove.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledWith(EmailAction.DeveloperApiAccessApproved, {
        to: { email: "dev@example.com" },
        recipient: { kind: EmailRecipientKind.DeveloperAccount, email: "dev@example.com", displayName: "Dev Jane" },
        context: { appName: "My Music App" },
      });
    });

    it("still approves when the notification trigger throws", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.findApiAccessRequestById.mockResolvedValue(makeRequest());
      mockRepo.reviewApiAccessRequest.mockResolvedValue(makeRequest({ status: "approved" }));
      mockRepo.createApiClient.mockResolvedValue(makeClient());
      mockDeveloperRepo.findDeveloperAccountById.mockResolvedValue({
        id: "dev-acc-1",
        email: "dev@example.com",
        displayName: null,
      });
      vi.mocked(triggerEmailAction).mockRejectedValueOnce(new Error("smtp down"));

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestApprove.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it("rejects an already-reviewed request with 400 and performs no mutation", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.findApiAccessRequestById.mockResolvedValue(makeRequest({ status: "approved" }));

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestApprove.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(mockRepo.reviewApiAccessRequest).not.toHaveBeenCalled();
      expect(mockRepo.createApiClient).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown request id", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.findApiAccessRequestById.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestApprove.replace(":id", "missing"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST requestReject", () => {
    it("notifies the developer about the rejection with app name and review note", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.findApiAccessRequestById.mockResolvedValue(makeRequest({ appName: "My Music App" }));
      mockRepo.reviewApiAccessRequest.mockResolvedValue(
        makeRequest({ status: "rejected", reviewNote: "Not enough detail." }),
      );
      mockDeveloperRepo.findDeveloperAccountById.mockResolvedValue({
        id: "dev-acc-1",
        email: "dev@example.com",
        displayName: "Dev Jane",
      });

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestReject.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { reviewNote: "Not enough detail." },
      });

      expect(response.statusCode).toBe(200);
      expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledWith(EmailAction.DeveloperApiAccessRejected, {
        to: { email: "dev@example.com" },
        recipient: { kind: EmailRecipientKind.DeveloperAccount, email: "dev@example.com", displayName: "Dev Jane" },
        context: { appName: "My Music App", reviewNote: "Not enough detail." },
      });
    });

    it("requires reviewNote and returns 400 without it", async () => {
      const { app, token } = await buildApp("owner");
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestReject.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(mockRepo.findApiAccessRequestById).not.toHaveBeenCalled();
    });

    it("returns 400 for a whitespace-only reviewNote", async () => {
      const { app, token } = await buildApp("owner");
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestReject.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { reviewNote: "   " },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects an already-reviewed request with 400", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.findApiAccessRequestById.mockResolvedValue(makeRequest({ status: "rejected" }));

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestReject.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { reviewNote: "already handled" },
      });

      expect(response.statusCode).toBe(400);
      expect(mockRepo.reviewApiAccessRequest).not.toHaveBeenCalled();
    });

    it("rejects a pending request and writes an audit event", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.findApiAccessRequestById.mockResolvedValue(makeRequest());
      mockRepo.reviewApiAccessRequest.mockResolvedValue(
        makeRequest({ status: "rejected", reviewedByAdminId: "admin-1", reviewNote: "not a fit" }),
      );

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.requestReject.replace(":id", "req-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { reviewNote: "not a fit" },
      });

      expect(response.statusCode).toBe(200);
      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req-1", eventType: "request_rejected", actorAdminId: "admin-1" }),
      );
    });
  });

  describe("PATCH clientUpdate", () => {
    it("rejects an invalid status value with 400 and performs no mutation", async () => {
      const { app, token } = await buildApp("owner");
      const response = await app.inject({
        method: "PATCH",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientUpdate.replace(":id", "client-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "not-a-real-status" },
      });
      expect(response.statusCode).toBe(400);
      expect(mockRepo.updateApiClient).not.toHaveBeenCalled();
    });

    it.each(["active", "suspended", "revoked"])("accepts the valid status %s", async (status) => {
      const { app, token } = await buildApp("owner");
      mockRepo.updateApiClient.mockResolvedValue(makeClient({ status }));
      const response = await app.inject({
        method: "PATCH",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientUpdate.replace(":id", "client-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: { status },
      });
      expect(response.statusCode).toBe(200);
      expect(mockRepo.updateApiClient).toHaveBeenCalledWith("client-1", expect.objectContaining({ status }));
    });

    it("returns 404 when the client does not exist", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.updateApiClient.mockResolvedValue(null);
      const response = await app.inject({
        method: "PATCH",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientUpdate.replace(":id", "missing"),
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "suspended" },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST clientCreateToken (admin-issued)", () => {
    it("notifies the developer that a token was created for their app", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.findApiClientById.mockResolvedValue(makeClient({ appName: "My Music App" }));
      mockRepo.createApiClientToken.mockResolvedValue(makeToken());
      mockDeveloperRepo.findDeveloperAccountById.mockResolvedValue({
        id: "dev-acc-1",
        email: "dev@example.com",
        displayName: "Dev Jane",
      });

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientCreateToken.replace(":id", "client-1"),
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(triggerEmailAction)).toHaveBeenCalledWith(EmailAction.DeveloperApiTokenCreated, {
        to: { email: "dev@example.com" },
        recipient: { kind: EmailRecipientKind.DeveloperAccount, email: "dev@example.com", displayName: "Dev Jane" },
        context: { appName: "My Music App" },
      });
    });

    it("returns the raw token once, never the hash", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.findApiClientById.mockResolvedValue(makeClient());
      mockRepo.createApiClientToken.mockResolvedValue(makeToken());

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientCreateToken.replace(":id", "client-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
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
          actorAdminId: "admin-1",
        }),
      );
    });

    it("returns 404 for an unknown client", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.findApiClientById.mockResolvedValue(null);
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.clientCreateToken.replace(":id", "missing"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST tokenDeactivate", () => {
    it("revokes the token and writes an audit event without leaking secrets", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.revokeApiClientToken.mockResolvedValue(makeToken({ status: "revoked", revokedAt: 1_700_000_200_000 }));
      mockRepo.findApiClientById.mockResolvedValue(makeClient());

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.tokenDeactivate.replace(":id", "token-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
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
          eventType: "token_deactivated",
          actorAdminId: "admin-1",
        }),
      );
      const auditCall = mockRepo.createApiAccessAuditEvent.mock.calls[0]![0];
      expect(JSON.stringify(auditCall)).not.toContain("deadbeef");
    });

    it("returns 404 for an unknown token", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.revokeApiClientToken.mockResolvedValue(null);
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.tokenDeactivate.replace(":id", "missing"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(404);
      expect(mockRepo.createApiAccessAuditEvent).not.toHaveBeenCalled();
    });
  });

  describe("POST tokenActivate", () => {
    it("re-activates a revoked token and writes an audit event without leaking secrets", async () => {
      const { app, token } = await buildApp("admin");
      mockRepo.activateApiClientToken.mockResolvedValue(makeToken({ status: "active", revokedAt: null }));
      mockRepo.findApiClientById.mockResolvedValue(makeClient());

      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.tokenActivate.replace(":id", "token-1"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.token.status).toBe("active");
      expect(body.token.tokenHash).toBeUndefined();

      expect(mockRepo.createApiAccessAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          clientId: "client-1",
          tokenId: "token-1",
          eventType: "token_activated",
          actorAdminId: "admin-1",
        }),
      );
      const auditCall = mockRepo.createApiAccessAuditEvent.mock.calls[0]![0];
      expect(JSON.stringify(auditCall)).not.toContain("deadbeef");
    });

    it("returns 404 when there is no revoked token to activate", async () => {
      const { app, token } = await buildApp("owner");
      mockRepo.activateApiClientToken.mockResolvedValue(null);
      const response = await app.inject({
        method: "POST",
        url: ROUTE_TEMPLATES.admin.developer.apiAccess.tokenActivate.replace(":id", "missing"),
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(404);
      expect(mockRepo.createApiAccessAuditEvent).not.toHaveBeenCalled();
    });
  });
});
