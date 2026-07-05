/**
 * @file Developer self-service routes for the API-access system
 * (MC-025/MC-077): submit a request, list the caller's own requests and
 * clients, and manage the caller's own tokens (create/revoke/rotate).
 * Every handler runs behind `authenticateDeveloper` (set as this scope's
 * `preHandler` in `server.ts`) and additionally checks ownership —
 * a client/token that exists but belongs to a different developer account
 * is reported as 404, never 403, so its existence is not leaked.
 */
import { EmailAction, ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiAccessRequest, ApiClient, ApiClientToken } from "../db/api-access-repository.js";
import { getApiAccessRepository } from "../db/index.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { RateLimiter } from "../lib/infra/rate-limiter.js";
import { generateApiToken } from "../services/api-access-token.js";
import { notifyDeveloper } from "../services/developer-notifications.js";

const MAX_APP_NAME_LENGTH = 200;
const MAX_APP_DESCRIPTION_LENGTH = 2000;

/** Dedicated per-developer throttle (20/min) for the three token-mutating routes, separate from the global apiRateLimiter. */
const devApiAccessTokenRateLimiter = new RateLimiter(20, 60_000);

async function throttleTokenMutation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const check = devApiAccessTokenRateLimiter.check(request.developerAccountId!);
  if (check.limited) {
    await sendRateLimitError(reply, check);
  }
}

function toRequestResponse(request: ApiAccessRequest) {
  return {
    id: request.id,
    appName: request.appName,
    appDescription: request.appDescription,
    estimatedRequestsPerDay: request.estimatedRequestsPerDay,
    status: request.status,
    submittedAt: new Date(request.submittedAt).toISOString(),
    reviewedAt: request.reviewedAt ? new Date(request.reviewedAt).toISOString() : null,
    reviewNote: request.reviewNote,
  };
}

function toClientResponse(client: ApiClient, tokens: ApiClientToken[]) {
  return {
    id: client.id,
    appName: client.appName,
    description: client.description,
    status: client.status,
    requestsPerMinute: client.requestsPerMinute,
    requestsPerDay: client.requestsPerDay,
    createdAt: new Date(client.createdAt).toISOString(),
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
 * Loads the token's owning client and verifies it belongs to the caller.
 *
 * @returns The client if the token exists and is owned by `developerAccountId`, else `null`.
 */
async function loadOwnedClientForToken(
  repo: Awaited<ReturnType<typeof getApiAccessRepository>>,
  tokenId: string,
  developerAccountId: string,
): Promise<{ token: ApiClientToken; client: ApiClient } | null> {
  const token = await repo.findApiClientTokenById(tokenId);
  if (!token) return null;
  const client = await repo.findApiClientById(token.clientId);
  if (!client || client.developerAccountId !== developerAccountId) return null;
  return { token, client };
}

/**
 * Registers the developer self-service API-access routes. Must be
 * registered inside a scope whose `preHandler` is `authenticateDeveloper`
 * (see `server.ts`), so `request.developerAccountId` is always set here.
 */
export async function devApiAccessRoutes(app: FastifyInstance) {
  app.post(ENDPOINTS.dev.apiAccess.requestsCreate, async (request, reply) => {
    const body = request.body as {
      appName?: string;
      appDescription?: string;
      estimatedRequestsPerDay?: number;
    } | null;
    const appName = body?.appName?.trim() ?? "";
    const appDescription = body?.appDescription?.trim() ?? "";
    const estimatedRequestsPerDay = body?.estimatedRequestsPerDay;
    if (!appName || appName.length > MAX_APP_NAME_LENGTH) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "appName is required (max 200 chars)." });
    }
    if (!appDescription || appDescription.length > MAX_APP_DESCRIPTION_LENGTH) {
      return reply
        .status(400)
        .send({ error: "INVALID_REQUEST", message: "appDescription is required (max 2000 chars)." });
    }
    if (!Number.isInteger(estimatedRequestsPerDay) || (estimatedRequestsPerDay as number) <= 0) {
      return reply
        .status(400)
        .send({ error: "INVALID_REQUEST", message: "estimatedRequestsPerDay must be a positive integer." });
    }

    const repo = await getApiAccessRepository();
    const created = await repo.createApiAccessRequest({
      developerAccountId: request.developerAccountId!,
      contactEmail: request.developerAccount!.email,
      appName,
      appDescription,
      estimatedRequestsPerDay: estimatedRequestsPerDay as number,
    });
    await repo.createApiAccessAuditEvent({
      requestId: created.id,
      eventType: "request_submitted",
      actorDeveloperAccountId: request.developerAccountId!,
    });
    return reply.status(201).send({ request: toRequestResponse(created) });
  });

  app.get(ENDPOINTS.dev.apiAccess.requestsList, async (request, reply) => {
    const repo = await getApiAccessRepository();
    const requests = await repo.listApiAccessRequestsByDeveloperAccount(request.developerAccountId!);
    return reply.send({ requests: requests.map(toRequestResponse) });
  });

  app.get(ENDPOINTS.dev.apiAccess.clientsList, async (request, reply) => {
    const repo = await getApiAccessRepository();
    const clients = await repo.listApiClientsByDeveloperAccount(request.developerAccountId!);
    const withTokens = await Promise.all(
      clients.map(async (client) => toClientResponse(client, await repo.listApiClientTokensByClient(client.id))),
    );
    return reply.send({ clients: withTokens });
  });

  app.post(
    ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken,
    { preHandler: throttleTokenMutation },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const repo = await getApiAccessRepository();
      const client = await repo.findApiClientById(id);
      if (!client || client.developerAccountId !== request.developerAccountId) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Client not found." });
      }
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
        actorDeveloperAccountId: request.developerAccountId!,
      });
      await notifyDeveloper(request.log, client.developerAccountId, EmailAction.DeveloperApiTokenCreated, {
        appName: client.appName,
      });
      return reply.status(201).send({ token: { ...toTokenResponse(token), rawToken: generated.raw } });
    },
  );

  app.post(ROUTE_TEMPLATES.dev.apiAccess.tokenRevoke, { preHandler: throttleTokenMutation }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const owned = await loadOwnedClientForToken(repo, id, request.developerAccountId!);
    if (!owned) return reply.status(404).send({ error: "NOT_FOUND", message: "Token not found." });
    const token = await repo.revokeApiClientToken(id);
    await repo.createApiAccessAuditEvent({
      clientId: owned.client.id,
      tokenId: id,
      eventType: "token_revoked",
      actorDeveloperAccountId: request.developerAccountId!,
    });
    return reply.send({ token: toTokenResponse(token!) });
  });

  app.post(ROUTE_TEMPLATES.dev.apiAccess.tokenRotate, { preHandler: throttleTokenMutation }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const owned = await loadOwnedClientForToken(repo, id, request.developerAccountId!);
    if (!owned) return reply.status(404).send({ error: "NOT_FOUND", message: "Token not found." });
    const generated = generateApiToken();
    const rotated = await repo.rotateApiClientToken(id, {
      newTokenPrefix: generated.prefix,
      newTokenHash: generated.hash,
    });
    if (!rotated) return reply.status(404).send({ error: "NOT_FOUND", message: "Active token not found." });
    await repo.createApiAccessAuditEvent({
      clientId: owned.client.id,
      tokenId: rotated.newToken.id,
      eventType: "token_rotated",
      actorDeveloperAccountId: request.developerAccountId!,
      eventData: { rotatedFromTokenId: rotated.oldToken.id },
    });
    // A rotation mints a new token, so the same "token created" notification applies.
    await notifyDeveloper(request.log, owned.client.developerAccountId, EmailAction.DeveloperApiTokenCreated, {
      appName: owned.client.appName,
    });
    return reply.status(201).send({ token: { ...toTokenResponse(rotated.newToken), rawToken: generated.raw } });
  });
}
