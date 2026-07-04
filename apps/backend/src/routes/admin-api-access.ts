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
import { getApiAccessRepository } from "../db/index.js";
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

/** Never includes `tokenHash` — the create/rotate handlers add the one-time raw token separately. */
function toTokenResponse(token: ApiClientToken) {
  return {
    id: token.id,
    tokenPrefix: token.tokenPrefix,
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

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.tokenRevoke, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const token = await repo.revokeApiClientToken(id);
    if (!token) return reply.status(404).send({ error: "NOT_FOUND", message: "Token not found." });
    await repo.createApiAccessAuditEvent({
      clientId: token.clientId,
      tokenId: id,
      eventType: "token_revoked",
      actorAdminId: caller.id,
    });
    return reply.send({ token: toTokenResponse(token) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.tokenRotate, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const generated = generateApiToken();
    const rotated = await repo.rotateApiClientToken(id, {
      newTokenPrefix: generated.prefix,
      newTokenHash: generated.hash,
    });
    if (!rotated) return reply.status(404).send({ error: "NOT_FOUND", message: "Active token not found." });
    await repo.createApiAccessAuditEvent({
      clientId: rotated.newToken.clientId,
      tokenId: rotated.newToken.id,
      eventType: "token_rotated",
      actorAdminId: caller.id,
      eventData: { rotatedFromTokenId: rotated.oldToken.id },
    });
    // A rotation mints a new token, so the same "token created" notification applies.
    const rotatedClient = await repo.findApiClientById(rotated.newToken.clientId);
    if (rotatedClient) {
      await notifyDeveloper(request.log, rotatedClient.developerAccountId, EmailAction.DeveloperApiTokenCreated, {
        appName: rotatedClient.appName,
      });
    }
    return reply.status(201).send({ token: { ...toTokenResponse(rotated.newToken), rawToken: generated.raw } });
  });
}
