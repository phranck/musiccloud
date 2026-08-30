/**
 * @file Developer self-service routes for the API-access system
 * (MC-025/MC-077): submit a request, list the caller's own requests and
 * clients, and manage the caller's own tokens (create/revoke/rotate).
 * Every handler runs behind `authenticateDeveloper` (set as this scope's
 * `preHandler` in `server.ts`) and additionally checks ownership —
 * a client/token that exists but belongs to a different developer account
 * is reported as 404, never 403, so its existence is not leaked.
 *
 * Creating a project or a registration is bounded twice, because the path is
 * open and nobody reviews it: a per-account throttle limits how fast records
 * appear, and a ceiling limits how many one account or project may hold.
 */
import { EmailAction, ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiAccessRequest, ApiClient, ApiClientToken, DeveloperProject } from "../db/api-access-repository.js";
import { getApiAccessRepository } from "../db/index.js";
import { setApiFailureDiagnostic } from "../lib/infra/api-error-handler.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { RateLimiter } from "../lib/infra/rate-limiter.js";
import { generateApiToken } from "../services/api-access-token.js";
import { getMaxProjectsPerAccount } from "../services/developer-limits.js";
import { notifyDeveloper } from "../services/developer-notifications.js";
import { listSelfServiceAssignableTiers } from "../services/signup-tier.js";

const MAX_APP_NAME_LENGTH = 200;
const MAX_APP_DESCRIPTION_LENGTH = 2000;
/** Long enough for any real application page, short enough not to be a place to put things. */
const MAX_WEBSITE_URL_LENGTH = 500;

/** Projects and registrations one account may create per minute, taken together. */
export const CREATIONS_PER_MINUTE_PER_ACCOUNT = 10;
/** Registrations one project may hold at once. Revoking a registration frees a slot. */
export const MAX_REGISTRATIONS_PER_PROJECT = 5;
/** Refusal for an account that already holds as many projects as the operator allows. */
const PROJECT_CEILING_CODE = "MC-REQ-0003";
/** Refusal for a project that already holds {@link MAX_REGISTRATIONS_PER_PROJECT} registrations. */
const REGISTRATION_CEILING_CODE = "MC-REQ-0004";
/** Refusal for a plan a developer may not put a project on themselves. */
const PLAN_NOT_ASSIGNABLE_CODE = "MC-REQ-0005";
/** The lifecycle states a registration may be moved to, matching `chk_api_clients_status`. */
const REGISTRATION_STATUSES: readonly string[] = ["active", "suspended", "revoked"];
/** The client profiles a registration may be created in, matching `chk_api_clients_registration_type`. */
const REGISTRATION_TYPES: readonly string[] = ["development", "confidential", "public"];

/** Dedicated per-developer throttle (20/min) for the three token-mutating routes, separate from the global apiRateLimiter. */
const devApiAccessTokenRateLimiter = new RateLimiter(20, 60_000);

/**
 * Dedicated per-developer throttle for creating projects and registrations.
 * It is a bucket of its own so a creation loop cannot spend the budget a
 * developer needs in order to revoke a leaked token, or the other way round.
 */
const devApiAccessCreationRateLimiter = new RateLimiter(CREATIONS_PER_MINUTE_PER_ACCOUNT, 60_000);

async function throttleTokenMutation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const check = devApiAccessTokenRateLimiter.check(request.developerAccountId!);
  if (check.limited) {
    await sendRateLimitError(reply, check);
  }
}

/**
 * Bounds how fast one account creates projects and registrations. Both count
 * into the same bucket, because both walk the same open path.
 *
 * @param request - The request, carrying the authenticated developer account id.
 * @param reply - Answers `429` with the standard rate-limit envelope once the bucket is spent.
 */
async function throttleCreation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const check = devApiAccessCreationRateLimiter.check(request.developerAccountId!);
  if (check.limited) {
    setApiFailureDiagnostic(request, {
      developerAccountId: request.developerAccountId,
      limit: check.limit,
      limitName: "creations_per_minute_per_account",
      outcome: "creation_throttled",
    });
    await sendRateLimitError(reply, check);
  }
}

/**
 * Refuses a creation that would carry its owner past a ceiling, and records
 * which ceiling fired on the request's own failure log.
 *
 * @param request - The request being refused.
 * @param reply - The reply the refusal is sent on.
 * @param ceiling - The ceiling that fired: its error code, its value, and the name it is logged under.
 * @returns The sent reply, so a handler can return it directly.
 */
function refuseOverCeiling(
  request: FastifyRequest,
  reply: FastifyReply,
  ceiling: { code: string; limit: number; name: string },
): FastifyReply {
  setApiFailureDiagnostic(request, {
    developerAccountId: request.developerAccountId,
    limit: ceiling.limit,
    limitName: ceiling.name,
    outcome: "creation_refused",
  });
  return reply.status(409).send(createApiErrorResponse(ceiling.code, { context: { limit: ceiling.limit } }));
}

/**
 * Parses an application website, returning it normalised.
 *
 * The value is parsed with `new URL` rather than matched against a pattern,
 * because a pattern accepts shapes a parser rejects and this value is rendered
 * as a link afterwards. Only `http` and `https` pass, so a `javascript:` or
 * `data:` value cannot reach a href.
 *
 * @param value - The raw value from the request body, already trimmed.
 * @returns The normalised URL, or `null` when it is not a usable web address.
 */
function parseWebsiteUrl(value: string): string | null {
  if (value.length > MAX_WEBSITE_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
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
    websiteUrl: client.websiteUrl,
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
    // The ceiling travels with the list because that is where a developer reads
    // it: the screen that shows what they hold is the one that says how many
    // more they may create. `used` is the same count the creation route
    // enforces, so the two cannot disagree on screen.
    const [projects, maxProjects, usedProjects] = await Promise.all([
      repo.listDeveloperProjectsByAccount(request.developerAccountId!),
      getMaxProjectsPerAccount(),
      repo.countDeveloperProjectsAgainstCeiling(request.developerAccountId!),
    ]);
    return reply.send({
      projects: projects.map(toProjectResponse),
      limits: { maxProjects, usedProjects },
    });
  });

  app.post(ENDPOINTS.dev.apiAccess.projects, { preHandler: throttleCreation }, async (request, reply) => {
    const body = request.body as { displayName?: string } | null;
    const displayName = body?.displayName?.trim() ?? "";
    if (!displayName || displayName.length > MAX_APP_NAME_LENGTH) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "displayName is required (max 200 chars)." });
    }
    const repo = await getApiAccessRepository();
    // The count is read before the insert rather than inside it, so requests
    // already in flight can carry an account a little past the ceiling. The
    // creation throttle bounds how many that can be.
    const maxProjects = await getMaxProjectsPerAccount();
    const heldProjects = await repo.countDeveloperProjectsAgainstCeiling(request.developerAccountId!);
    if (heldProjects >= maxProjects) {
      return refuseOverCeiling(request, reply, {
        code: PROJECT_CEILING_CODE,
        limit: maxProjects,
        name: "projects_per_account",
      });
    }
    // A project is created without a plan on purpose. Choosing one is a step a
    // developer takes and sees, so nothing here picks it for them; until they
    // do, the project grants no quota and the API refuses its keys.
    const project = await repo.createDeveloperProject({
      developerAccountId: request.developerAccountId!,
      displayName,
      tierId: null,
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

  /**
   * PUT …/projects/:id/subscription
   * The plan step: a developer chooses the plan for a project they own.
   *
   * Which tiers may be chosen is decided by `isSelfServiceAssignableTier`,
   * which signup asks as well, so the two cannot disagree about what a
   * developer is allowed to pick.
   */
  app.put(ROUTE_TEMPLATES.dev.apiAccess.projectSubscription, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { tierId?: string } | null;
    if (typeof body?.tierId !== "string" || body.tierId.trim() === "") {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "tierId is required." });
    }
    const tierId = body.tierId.trim();

    const repo = await getApiAccessRepository();
    const project = await loadOwnedProject(repo, id, request.developerAccountId!);
    if (!project) return reply.status(404).send({ error: "NOT_FOUND", message: "Project not found." });
    if (project.status !== "active") {
      return reply.status(409).send({ error: "PROJECT_INACTIVE", message: "Project is not active." });
    }

    const assignable = await listSelfServiceAssignableTiers();
    const chosen = assignable.find((tier) => tier.id === tierId);
    if (!chosen) {
      setApiFailureDiagnostic(request, {
        developerAccountId: request.developerAccountId,
        projectId: id,
        requestedTierId: tierId,
        outcome: "plan_not_assignable",
      });
      return reply.status(400).send(
        createApiErrorResponse(PLAN_NOT_ASSIGNABLE_CODE, {
          context: { assignable: assignable.map((tier) => tier.name).join(", ") || "no plan" },
        }),
      );
    }

    await repo.setDeveloperProjectSubscription({ projectId: id, tierId: chosen.id, status: "active" });
    await repo.createApiAccessAuditEvent({
      projectId: id,
      eventType: "project_plan_selected",
      actorDeveloperAccountId: request.developerAccountId!,
      eventData: { tierId: chosen.id, tierName: chosen.name },
    });
    const updated = await repo.findDeveloperProjectById(id);
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

  app.post(
    ROUTE_TEMPLATES.dev.apiAccess.projectRegistrations,
    { preHandler: throttleCreation },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        description?: string;
        websiteUrl?: string | null;
        registrationType?: "development" | "confidential" | "public";
        capabilities?: string[];
      } | null;
      const name = body?.name?.trim() ?? "";
      if (!name || name.length > MAX_APP_NAME_LENGTH) {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: "name is required (max 200 chars)." });
      }
      // The website is optional, so an absent or empty value means there is
      // none; anything else has to parse as a web address.
      const rawWebsite = typeof body?.websiteUrl === "string" ? body.websiteUrl.trim() : "";
      let websiteUrl: string | null = null;
      if (rawWebsite !== "") {
        websiteUrl = parseWebsiteUrl(rawWebsite);
        if (!websiteUrl) {
          return reply
            .status(400)
            .send({ error: "INVALID_REQUEST", message: "websiteUrl must be an http or https URL (max 500 chars)." });
        }
      }
      const registrationType = body?.registrationType ?? "development";
      if (!REGISTRATION_TYPES.includes(registrationType)) {
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
      const heldRegistrations = await repo.countActiveApiClientsByProject(project.id);
      if (heldRegistrations >= MAX_REGISTRATIONS_PER_PROJECT) {
        return refuseOverCeiling(request, reply, {
          code: REGISTRATION_CEILING_CODE,
          limit: MAX_REGISTRATIONS_PER_PROJECT,
          name: "registrations_per_project",
        });
      }
      const registration = await repo.createApiClient({
        developerAccountId: request.developerAccountId!,
        projectId: project.id,
        registrationType,
        capabilities: body?.capabilities ?? [],
        appName: name,
        contactEmail: request.developerAccount!.email,
        description: body?.description?.trim() ?? "",
        websiteUrl,
      });
      await repo.createApiAccessAuditEvent({
        projectId: project.id,
        clientId: registration.id,
        eventType: "registration_created",
        actorDeveloperAccountId: request.developerAccountId!,
        eventData: { registrationType, publicClientId: registration.publicClientId },
      });
      return reply.status(201).send({ registration: toClientResponse(registration, []) });
    },
  );

  /**
   * PATCH …/registrations/:id
   * Changes one of the caller's own registrations: its lifecycle, its
   * application website, or its description.
   *
   * Suspending or revoking a registration is what stops its tokens working:
   * `findActiveApiClientByTokenHash` admits an active registration only, so no
   * token has to be touched for the credentials under it to stop
   * authenticating.
   */
  app.patch(ROUTE_TEMPLATES.dev.apiAccess.registrationDetail, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; websiteUrl?: string | null; description?: string } | null;

    if (body?.status !== undefined && !REGISTRATION_STATUSES.includes(body.status)) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Invalid registration status." });
    }

    let websiteUrl: string | null | undefined;
    if (body?.websiteUrl !== undefined) {
      const raw = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
      if (raw === "") {
        websiteUrl = null;
      } else {
        websiteUrl = parseWebsiteUrl(raw);
        if (!websiteUrl) {
          return reply
            .status(400)
            .send({ error: "INVALID_REQUEST", message: "websiteUrl must be an http or https URL (max 500 chars)." });
        }
      }
    }

    const repo = await getApiAccessRepository();
    const registration = await repo.findApiClientById(id);
    if (!registration || registration.developerAccountId !== request.developerAccountId) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Registration not found." });
    }

    const updated = await repo.updateApiClient(id, {
      status: body?.status,
      websiteUrl,
      description: body?.description?.trim(),
    });
    if (!updated) return reply.status(404).send({ error: "NOT_FOUND", message: "Registration not found." });

    await repo.createApiAccessAuditEvent({
      projectId: registration.projectId,
      clientId: id,
      eventType: body?.status ? `registration_${body.status}` : "registration_updated",
      actorDeveloperAccountId: request.developerAccountId!,
      eventData: { status: body?.status, websiteUrl },
    });
    return reply.send({ registration: toClientResponse(updated, []) });
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
