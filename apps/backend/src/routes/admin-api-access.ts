/**
 * @file Admin routes for the API-access system (MC-025/MC-077): review
 * requests, manage clients, and issue/revoke/rotate tokens on their
 * behalf (moderation/support case — the primary path is developer
 * self-service via `routes/dev-api-access.ts`). Restricted to `owner`/
 * `admin` roles; `moderator` is rejected even though `authenticateAdmin`
 * already let the JWT through, because that guard only checks the JWT's
 * `role: "admin"` claim, not the finer owner/admin/moderator distinction.
 */
import { EmailAction, ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import type { ApiAccessRequest, ApiClient, ApiClientToken } from "../db/api-access-repository.js";
import { getApiAccessRepository, getDeveloperRepository } from "../db/index.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { generateApiToken } from "../services/api-access-token.js";
import { notifyDeveloper } from "../services/developer-notifications.js";

/**
 * Resolves the caller's full DB record from the verified JWT payload,
 * mirroring `routes/admin-users.ts`'s `getCaller`: the JWT only carries
 * `sub`/`role`, but the owner/admin/moderator check here needs the fresh
 * DB role in case it changed since the token was issued.
 */

function toRequestResponse(request: ApiAccessRequest) {
  return {
    id: request.id,
    developerAccountId: request.developerAccountId,
    contactEmail: request.contactEmail,
    appName: request.appName,
    appDescription: request.appDescription,
    estimatedRequestsPerDay: request.estimatedRequestsPerDay,
    status: request.status,
    submittedAt: new Date(request.submittedAt).toISOString(),
    reviewedAt: request.reviewedAt ? new Date(request.reviewedAt).toISOString() : null,
    reviewedByAdminId: request.reviewedByAdminId,
    reviewNote: request.reviewNote,
  };
}

function toClientResponse(client: ApiClient, tokens: ApiClientToken[]) {
  return {
    id: client.id,
    requestId: client.requestId,
    developerAccountId: client.developerAccountId,
    appName: client.appName,
    contactEmail: client.contactEmail,
    description: client.description,
    status: client.status,
    requestsPerMinute: client.requestsPerMinute,
    requestsPerDay: client.requestsPerDay,
    createdAt: new Date(client.createdAt).toISOString(),
    updatedAt: new Date(client.updatedAt).toISOString(),
    tokens: tokens.map(toTokenResponse),
  };
}

function toTokenResponse(token: ApiClientToken) {
  return {
    id: token.id,
    tokenPrefix: token.tokenPrefix,
    rawToken: token.rawToken,
    status: token.status,
    createdAt: new Date(token.createdAt).toISOString(),
    lastUsedAt: token.lastUsedAt ? new Date(token.lastUsedAt).toISOString() : null,
    revokedAt: token.revokedAt ? new Date(token.revokedAt).toISOString() : null,
  };
}

/**
 * Registers the admin API-access routes. Must be registered inside a
 * scope whose `preHandler` is `authenticateAdmin` (see `server.ts`
 * `adminRoutes` block) — this module additionally re-checks the DB role.
 */
export async function adminApiAccessRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.developer.apiAccess.overview, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const repo = await getApiAccessRepository();
    const query = request.query as { status?: string };
    const [requests, clients] = await Promise.all([repo.listApiAccessRequests(query.status), repo.listApiClients()]);
    return reply.send({
      requests: requests.map(toRequestResponse),
      clients: await Promise.all(
        clients.map(async (client) => toClientResponse(client, await repo.listApiClientTokensByClient(client.id))),
      ),
    });
  });

  app.get("/api/admin/developer/accounts", async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const devRepo = await getDeveloperRepository();
    const accounts = await devRepo.listDeveloperAccounts();
    return reply.send({
      accounts: accounts.map((a: (typeof accounts)[number]) => ({
        id: a.id,
        email: a.email,
        emailVerifiedAt: a.emailVerifiedAt ? new Date(a.emailVerifiedAt).toISOString() : null,
        displayName: a.displayName,
        avatarUrl: a.avatarUrl,
        plan: a.plan,
        status: a.status,
        clientCount: a.clientCount,
        appName: a.appName,
        createdAt: new Date(a.createdAt).toISOString(),
        lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : null,
      })),
    });
  });

  app.get("/api/admin/developer/accounts/:id", async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    const devRepo = await getDeveloperRepository();
    const account = await devRepo.findDeveloperAccountById(id);
    if (!account) return reply.status(404).send({ error: "NOT_FOUND", message: "Developer account not found." });
    return reply.send({
      id: account.id,
      email: account.email,
      emailVerifiedAt: account.emailVerifiedAt ? new Date(account.emailVerifiedAt).toISOString() : null,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      plan: account.plan,
      status: account.status,
      createdAt: new Date(account.createdAt).toISOString(),
      lastLoginAt: account.lastLoginAt ? new Date(account.lastLoginAt).toISOString() : null,
    });
  });

  app.patch("/api/admin/developer/accounts/:id", async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const body = request.body as {
      email?: string;
      displayName?: string | null;
      plan?: string;
      status?: string;
    } | null;
    if (body?.status && !["active", "suspended"].includes(body.status)) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Invalid status." });
    }
    const devRepo = await getDeveloperRepository();
    const updated = await devRepo.updateDeveloperAccount(id, {
      email: body?.email,
      displayName: body?.displayName,
      plan: body?.plan,
      status: body?.status,
    });
    if (!updated) return reply.status(404).send({ error: "NOT_FOUND", message: "Developer account not found." });

    // When an account is suspended, also suspend their API clients
    if (body?.status === "suspended") {
      const apiRepo = await getApiAccessRepository();
      const clients = await apiRepo.listApiClientsByDeveloperAccount(id);
      for (const client of clients) {
        await apiRepo.updateApiClient(client.id, { status: "suspended" });
      }
    }

    return reply.send({
      id: updated.id,
      email: updated.email,
      emailVerifiedAt: updated.emailVerifiedAt ? new Date(updated.emailVerifiedAt).toISOString() : null,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      plan: updated.plan,
      status: updated.status,
      createdAt: new Date(updated.createdAt).toISOString(),
      lastLoginAt: updated.lastLoginAt ? new Date(updated.lastLoginAt).toISOString() : null,
    });
  });

  app.delete("/api/admin/developer/accounts/:id", async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const devRepo = await getDeveloperRepository();
    const deleted = await devRepo.deleteDeveloperAccount(id);
    if (!deleted) return reply.status(404).send({ error: "NOT_FOUND", message: "Developer account not found." });
    return reply.status(204).send();
  });

  app.get(ROUTE_TEMPLATES.admin.developer.apiAccess.requestDetail, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const found = await repo.findApiAccessRequestById(id);
    if (!found) return reply.status(404).send({ error: "NOT_FOUND", message: "Request not found." });
    return reply.send({ request: toRequestResponse(found) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.requestApprove, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const body = request.body as { requestsPerMinute?: number; requestsPerDay?: number } | null;
    const repo = await getApiAccessRepository();
    const found = await repo.findApiAccessRequestById(id);
    if (!found) return reply.status(404).send({ error: "NOT_FOUND", message: "Request not found." });
    if (found.status !== "pending") {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Request already reviewed." });
    }

    const reviewed = await repo.reviewApiAccessRequest(id, {
      status: "approved",
      reviewedByAdminId: caller.id,
    });
    const client = await repo.createApiClient({
      requestId: id,
      developerAccountId: found.developerAccountId,
      appName: found.appName,
      contactEmail: found.contactEmail,
      description: found.appDescription,
      requestsPerMinute: body?.requestsPerMinute,
      requestsPerDay: body?.requestsPerDay,
      createdByAdminId: caller.id,
    });
    await repo.createApiAccessAuditEvent({
      requestId: id,
      clientId: client.id,
      eventType: "request_approved",
      actorAdminId: caller.id,
    });
    await notifyDeveloper(request.log, found.developerAccountId, EmailAction.DeveloperApiAccessApproved, {
      appName: found.appName,
    });
    return reply.send({ request: toRequestResponse(reviewed!), client: toClientResponse(client, []) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.requestReject, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const body = request.body as { reviewNote?: string } | null;
    if (!body?.reviewNote?.trim()) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "reviewNote is required to reject." });
    }
    const repo = await getApiAccessRepository();
    const found = await repo.findApiAccessRequestById(id);
    if (!found) return reply.status(404).send({ error: "NOT_FOUND", message: "Request not found." });
    if (found.status !== "pending") {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Request already reviewed." });
    }
    const reviewed = await repo.reviewApiAccessRequest(id, {
      status: "rejected",
      reviewedByAdminId: caller.id,
      reviewNote: body.reviewNote.trim(),
    });
    await repo.createApiAccessAuditEvent({ requestId: id, eventType: "request_rejected", actorAdminId: caller.id });
    await notifyDeveloper(request.log, found.developerAccountId, EmailAction.DeveloperApiAccessRejected, {
      appName: found.appName,
      reviewNote: body.reviewNote.trim(),
    });
    return reply.send({ request: toRequestResponse(reviewed!) });
  });

  app.get(ROUTE_TEMPLATES.admin.developer.apiAccess.clientDetail, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const client = await repo.findApiClientById(id);
    if (!client) return reply.status(404).send({ error: "NOT_FOUND", message: "Client not found." });
    const tokens = await repo.listApiClientTokensByClient(id);
    return reply.send({ client: toClientResponse(client, tokens) });
  });

  app.patch(ROUTE_TEMPLATES.admin.developer.apiAccess.clientUpdate, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: string;
      requestsPerMinute?: number;
      requestsPerDay?: number;
    } | null;
    if (body?.status && !["active", "suspended", "revoked"].includes(body.status)) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Invalid status." });
    }
    const repo = await getApiAccessRepository();
    const updated = await repo.updateApiClient(id, {
      status: body?.status,
      requestsPerMinute: body?.requestsPerMinute,
      requestsPerDay: body?.requestsPerDay,
    });
    if (!updated) return reply.status(404).send({ error: "NOT_FOUND", message: "Client not found." });
    await repo.createApiAccessAuditEvent({
      clientId: id,
      eventType: "client_updated",
      actorAdminId: caller.id,
      eventData: body ?? {},
    });
    return reply.send({ client: toClientResponse(updated, await repo.listApiClientTokensByClient(id)) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.clientCreateToken, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const client = await repo.findApiClientById(id);
    if (!client) return reply.status(404).send({ error: "NOT_FOUND", message: "Client not found." });
    const generated = generateApiToken();
    const token = await repo.createApiClientToken({
      clientId: id,
      tokenPrefix: generated.prefix,
      tokenHash: generated.hash,
      rawToken: generated.raw,
    });
    await repo.createApiAccessAuditEvent({
      clientId: id,
      tokenId: token.id,
      eventType: "token_created",
      actorAdminId: caller.id,
    });
    await notifyDeveloper(request.log, client.developerAccountId, EmailAction.DeveloperApiTokenCreated, {
      appName: client.appName,
    });
    return reply.status(201).send({ token: { ...toTokenResponse(token), rawToken: generated.raw } });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.tokenActivate, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const token = await repo.activateApiClientToken(id);
    if (!token) return reply.status(404).send({ error: "NOT_FOUND", message: "Revoked token not found." });
    await repo.createApiAccessAuditEvent({
      clientId: token.clientId,
      tokenId: id,
      eventType: "token_activated",
      actorAdminId: caller.id,
    });
    return reply.send({ token: toTokenResponse(token) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.tokenDeactivate, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const token = await repo.revokeApiClientToken(id);
    if (!token) return reply.status(404).send({ error: "NOT_FOUND", message: "Token not found." });
    await repo.createApiAccessAuditEvent({
      clientId: token.clientId,
      tokenId: id,
      eventType: "token_deactivated",
      actorAdminId: caller.id,
    });
    return reply.send({ token: toTokenResponse(token) });
  });
}
