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
import type { ApiAccessRequest, ApiClient, ApiClientToken, DeveloperProject } from "../db/api-access-repository.js";
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
    projectId: request.projectId,
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
    projectId: client.projectId,
    publicClientId: client.publicClientId,
    registrationType: client.registrationType,
    capabilities: client.capabilities,
    projectDisplayName: client.projectDisplayName,
    projectStatus: client.projectStatus,
    appName: client.appName,
    description: client.description,
    status: client.status,
    // The portal always shows what actually applies: project limits narrowed
    // by an optional registration cap. Raw overrides are an admin concern.
    requestsPerMinute: client.effectiveRequestsPerMinute,
    requestsPerDay: client.effectiveRequestsPerDay,
    createdAt: new Date(client.createdAt).toISOString(),
    tokens: tokens.map(toTokenResponse),
  };
}

function toProjectResponse(project: DeveloperProject) {
  return {
    id: project.id,
    displayName: project.displayName,
    status: project.status,
    subscription: {
      tierId: project.tierId,
      tierName: project.tierName,
    },
    quota: {
      requestsPerMinute: project.effectiveRequestsPerMinute,
      requestsPerDay: project.effectiveRequestsPerDay,
      overrideRequestsPerMinute: project.requestsPerMinute,
      overrideRequestsPerDay: project.requestsPerDay,
    },
    createdAt: new Date(project.createdAt).toISOString(),
    updatedAt: new Date(project.updatedAt).toISOString(),
  };
}

async function loadOwnedProject(
  repo: Awaited<ReturnType<typeof getApiAccessRepository>>,
  projectId: string,
  developerAccountId: string,
): Promise<DeveloperProject | null> {
  const project = await repo.findDeveloperProjectById(projectId);
  return project?.developerAccountId === developerAccountId ? project : null;
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

/** Keeps credential issuance and rotation aligned with project/registration lifecycle. */
function rejectInactiveCredentialOwner(client: ApiClient, reply: FastifyReply): FastifyReply | null {
  if (client.projectStatus !== "active") {
    return reply.status(409).send({ error: "PROJECT_INACTIVE", message: "Project is not active." });
  }
  if (client.status !== "active") {
    return reply.status(409).send({ error: "REGISTRATION_INACTIVE", message: "Registration is not active." });
  }
  return null;
}

/**
 * Registers the developer self-service API-access routes. Must be
 * registered inside a scope whose `preHandler` is `authenticateDeveloper`
 * (see `server.ts`), so `request.developerAccountId` is always set here.
 */
export async function devApiAccessRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.dev.apiAccess.projects, async (request, reply) => {
    const repo = await getApiAccessRepository();
    const projects = await repo.listDeveloperProjectsByAccount(request.developerAccountId!);
    return reply.send({ projects: projects.map(toProjectResponse) });
  });

  app.post(ENDPOINTS.dev.apiAccess.projects, async (request, reply) => {
    const body = request.body as { displayName?: string } | null;
    const displayName = body?.displayName?.trim() ?? "";
    if (!displayName || displayName.length > MAX_APP_NAME_LENGTH) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "displayName is required (max 200 chars)." });
    }
    const repo = await getApiAccessRepository();
    const project = await repo.createDeveloperProject({
      developerAccountId: request.developerAccountId!,
      displayName,
      tierId: request.developerAccount?.tierId ?? null,
    });
    await repo.createApiAccessAuditEvent({
      projectId: project.id,
      eventType: "project_created",
      actorDeveloperAccountId: request.developerAccountId!,
      eventData: { displayName },
    });
    return reply.status(201).send({ project: toProjectResponse(project) });
  });

  app.get(ROUTE_TEMPLATES.dev.apiAccess.projectDetail, async (request, reply) => {
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const project = await loadOwnedProject(repo, id, request.developerAccountId!);
    if (!project) return reply.status(404).send({ error: "NOT_FOUND", message: "Project not found." });
    const registrations = await repo.listApiClientsByProject(project.id);
    return reply.send({
      project: toProjectResponse(project),
      registrations: await Promise.all(
        registrations.map(async (registration) =>
          toClientResponse(registration, await repo.listApiClientTokensByClient(registration.id)),
        ),
      ),
    });
  });

  app.patch(ROUTE_TEMPLATES.dev.apiAccess.projectDetail, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { displayName?: string; status?: "active" | "suspended" | "deleted" } | null;
    if (body?.status && !["active", "suspended", "deleted"].includes(body.status)) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Invalid project status." });
    }
    const displayName = body?.displayName?.trim();
    if (body?.displayName !== undefined && (!displayName || displayName.length > MAX_APP_NAME_LENGTH)) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "displayName must contain 1 to 200 chars." });
    }
    const repo = await getApiAccessRepository();
    const project = await loadOwnedProject(repo, id, request.developerAccountId!);
    if (!project) return reply.status(404).send({ error: "NOT_FOUND", message: "Project not found." });
    const updated = await repo.updateDeveloperProject(id, { displayName, status: body?.status });
    await repo.createApiAccessAuditEvent({
      projectId: id,
      eventType: body?.status ? `project_${body.status}` : "project_updated",
      actorDeveloperAccountId: request.developerAccountId!,
      eventData: { displayName, status: body?.status },
    });
    return reply.send({ project: toProjectResponse(updated!) });
  });

  app.get(ROUTE_TEMPLATES.dev.apiAccess.projectRegistrations, async (request, reply) => {
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const project = await loadOwnedProject(repo, id, request.developerAccountId!);
    if (!project) return reply.status(404).send({ error: "NOT_FOUND", message: "Project not found." });
    const registrations = await repo.listApiClientsByProject(id);
    return reply.send({ registrations: registrations.map((registration) => toClientResponse(registration, [])) });
  });

  app.post(ROUTE_TEMPLATES.dev.apiAccess.projectRegistrations, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      registrationType?: "development" | "confidential" | "public";
      capabilities?: string[];
    } | null;
    const name = body?.name?.trim() ?? "";
    if (!name || name.length > MAX_APP_NAME_LENGTH) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "name is required (max 200 chars)." });
    }
    const registrationType = body?.registrationType ?? "development";
    if (!["development", "confidential", "public"].includes(registrationType)) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Invalid registrationType." });
    }
    if (
      body?.capabilities !== undefined &&
      (!Array.isArray(body.capabilities) || !body.capabilities.every((capability) => typeof capability === "string"))
    ) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "capabilities must contain strings." });
    }
    const repo = await getApiAccessRepository();
    const project = await loadOwnedProject(repo, id, request.developerAccountId!);
    if (!project) return reply.status(404).send({ error: "NOT_FOUND", message: "Project not found." });
    if (project.status !== "active") {
      return reply.status(409).send({ error: "PROJECT_INACTIVE", message: "Project is not active." });
    }
    const registration = await repo.createApiClient({
      developerAccountId: request.developerAccountId!,
      projectId: project.id,
      registrationType,
      capabilities: body?.capabilities ?? [],
      appName: name,
      contactEmail: request.developerAccount!.email,
      description: body?.description?.trim() ?? "",
    });
    await repo.createApiAccessAuditEvent({
      projectId: project.id,
      clientId: registration.id,
      eventType: "registration_created",
      actorDeveloperAccountId: request.developerAccountId!,
      eventData: { registrationType, publicClientId: registration.publicClientId },
    });
    return reply.status(201).send({ registration: toClientResponse(registration, []) });
  });

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
      const lifecycleRejection = rejectInactiveCredentialOwner(client, reply);
      if (lifecycleRejection) return lifecycleRejection;
      const generated = generateApiToken();
      const token = await repo.createApiClientToken({
        clientId: id,
        tokenPrefix: generated.prefix,
        tokenHash: generated.hash,
        rawToken: generated.raw,
      });
      await repo.createApiAccessAuditEvent({
        projectId: client.projectId,
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
      projectId: owned.client.projectId,
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
    const lifecycleRejection = rejectInactiveCredentialOwner(owned.client, reply);
    if (lifecycleRejection) return lifecycleRejection;
    const generated = generateApiToken();
    const rotated = await repo.rotateApiClientToken(id, {
      newTokenPrefix: generated.prefix,
      newTokenHash: generated.hash,
    });
    if (!rotated) return reply.status(404).send({ error: "NOT_FOUND", message: "Active token not found." });
    await repo.createApiAccessAuditEvent({
      projectId: owned.client.projectId,
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
