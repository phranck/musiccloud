/**
 * @file Authentication plugin for the musiccloud backend.
 *
 * This is a **Fastify plugin** that registers three authentication strategies
 * as instance decorators. Each strategy is intended to be attached as a
 * `preHandler` hook to a specific route group in `server.ts`:
 *
 * | Decorator              | Consumer                          | Credential                                  |
 * | ---------------------- | --------------------------------- | ------------------------------------------- |
 * | `authenticateInternal`  | Astro SSR frontend BFF proxy      | `X-API-Key` header matching `INTERNAL_API_KEY` |
 * | `authenticatePublic`    | Public API clients + frontend BFF | `X-API-Key` (internal key **or** issued `mc_live_…` token) |
 * | `authenticateAdmin`     | Admin dashboard                   | `Authorization: Bearer <JWT>` with `role: "admin"` claim |
 * | `authenticateDeveloper` | developer.musiccloud.io portal    | `mc_dev_session` httpOnly cookie carrying a `kind: "developer"` JWT |
 *
 * ## Why a plugin?
 *
 * - `app.decorate(...)` is Fastify's officially supported way to extend the
 *   server instance with custom methods. Only code that runs inside a plugin
 *   may decorate the instance.
 * - The `fastify-plugin` wrapper (`fp`) bypasses Fastify's default
 *   encapsulation, so the decorators are visible on the **root** instance
 *   and can be referenced by route files registered as siblings (not only
 *   inside this plugin's scope).
 * - The `declare module "fastify"` block performs TypeScript module
 *   augmentation so that `app.authenticatePublic(...)` is fully typed
 *   wherever the FastifyInstance is used.
 *
 * ## Registration
 *
 * Registered once during app bootstrap:
 * ```ts
 * import authPlugin from "./plugins/auth.js";
 * await app.register(authPlugin);
 * ```
 *
 * ## Environment
 *
 * - `INTERNAL_API_KEY` is the shared secret between the frontend proxy and the
 *   backend. In production it is required: `assertRequiredBootEnv` fails the
 *   boot when it is missing, and `authenticateInternal` rejects rather than
 *   passing through should the process reach that state anyway. Outside
 *   production an unset key lets requests through with a warning, because there
 *   is nothing to protect locally and demanding it would only add friction.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { ApiClient, DeveloperProject } from "../db/api-access-repository.js";
import type { DeveloperAccount } from "../db/developer-repository.js";
import { getApiAccessRepository, getDeveloperRepository } from "../db/index.js";
import { createApiErrorResponse, sanitizeErrorForLog } from "../lib/infra/api-errors.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import {
  projectDayRateLimiter,
  projectMinuteRateLimiter,
  registrationDayRateLimiter,
  registrationMinuteRateLimiter,
} from "../lib/infra/rate-limiter.js";
import { secretsMatch } from "../lib/infra/secret-compare.js";
import { hashApiToken, looksLikeApiAccessToken } from "../services/api-access-token.js";
import { SESSION_COOKIE_NAME, SessionKind } from "../services/developer-auth.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticateInternal: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticatePublic: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateDeveloper: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /**
     * The resolved API registration, set by {@link FastifyInstance.authenticatePublic}
     * when the request authenticated with an issued `mc_live_…` token
     * (MC-088). Routes use it to skip the per-IP `apiRateLimiter` (the
     * request has already passed the project quota and any narrower
     * registration cap). Absent for BFF-key and anonymous
     * requests.
     */
    apiClient?: ApiClient;
    /** Project aggregate resolved together with an issued registration token. */
    apiProject?: DeveloperProject;
    /** Registration-owned token id used for safe project usage attribution. */
    apiClientTokenId?: string;
    /** Local monotonic-enough start timestamp for the completed-request usage event. */
    apiUsageStartedAt?: number;
    /**
     * Id of the authenticated developer account, set by
     * {@link FastifyInstance.authenticateDeveloper} after a valid
     * `mc_dev_session` cookie is verified. Absent on unauthenticated requests.
     */
    developerAccountId?: string;
    /**
     * The full developer account row loaded by
     * {@link FastifyInstance.authenticateDeveloper} while checking
     * `status === "active"`. Downstream handlers reuse this instead of
     * re-fetching the account by {@link developerAccountId}. Absent on
     * unauthenticated requests.
     */
    developerAccount?: DeveloperAccount;
  }
}

/** Refusal for a project whose plan grants nothing, distinct from a spent quota. */
const PLAN_NOT_ACTIVE_CODE = "MC-AUTH-0003";

/**
 * The four numbers the quota checks need, or `null` when the project's plan
 * grants nothing. All four are absent together, because a registration cap
 * only narrows limits a plan has already granted.
 *
 * @param project - The project resolved from the presented token.
 * @param client - The registration resolved from the presented token.
 * @returns The limits to enforce, or `null` when no plan grants any.
 */
function resolvedQuota(
  project: DeveloperProject,
  client: ApiClient,
): { projectMinute: number; projectDay: number; registrationMinute: number; registrationDay: number } | null {
  const { effectiveRequestsPerMinute: projectMinute, effectiveRequestsPerDay: projectDay } = project;
  const { effectiveRequestsPerMinute: registrationMinute, effectiveRequestsPerDay: registrationDay } = client;
  if (projectMinute === null || projectDay === null || registrationMinute === null || registrationDay === null) {
    return null;
  }
  return { projectMinute, projectDay, registrationMinute, registrationDay };
}

async function authPlugin(app: FastifyInstance) {
  const internalApiKey = process.env.INTERNAL_API_KEY;

  app.addHook("onResponse", async (request, reply) => {
    if (!request.apiProject || !request.apiClient || !request.apiClientTokenId) return;
    try {
      const repo = await getApiAccessRepository();
      await repo.createApiUsageEvent({
        requestId: request.id,
        projectId: request.apiProject.id,
        registrationId: request.apiClient.id,
        tokenId: request.apiClientTokenId,
        method: request.method,
        endpointTemplate: request.routeOptions.url ?? request.url.split("?")[0] ?? "unknown",
        statusCode: reply.statusCode,
        durationMs: Math.max(0, Date.now() - (request.apiUsageStartedAt ?? Date.now())),
      });
    } catch (error) {
      request.log.warn(
        {
          cause: sanitizeErrorForLog(error, process.env.NODE_ENV !== "production"),
          component: "PublicApiAuth",
          errorCode: "MC-SYS-0001",
          operation: "createApiUsageEvent",
          outcome: "usage_not_recorded",
          projectId: request.apiProject.id,
          registrationId: request.apiClient.id,
          requestId: request.id,
          method: request.method,
          route: request.routeOptions.url ?? request.url.split("?")[0] ?? "unknown",
          statusCode: reply.statusCode,
          result: "usage_not_recorded",
        },
        "Failed to persist API usage event",
      );
    }
  });

  /**
   * API-key authentication for internal BFF traffic.
   *
   * Intended for requests originating from the Astro SSR frontend's API proxy
   * (`apps/frontend/src/pages/api/*`) calling into the backend. The proxy
   * attaches `X-API-Key: <INTERNAL_API_KEY>`, and this handler rejects any
   * request whose header does not match the configured secret.
   *
   * **When `INTERNAL_API_KEY` is unset** the behaviour depends on the
   * environment. Outside production the handler emits a warn log and lets the
   * request through, which keeps local development frictionless. In production
   * it logs an error and rejects, so a misconfiguration cannot silently open
   * the boundary. That branch is unreachable in a healthy deployment, because
   * `assertRequiredBootEnv` refuses to start without the key.
   *
   * @param request - incoming Fastify request; `x-api-key` header is read
   * @param reply   - responds with `401 UNAUTHORIZED` on key mismatch, and on a
   *   missing key in production
   */
  app.decorate("authenticateInternal", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!internalApiKey) {
      // `assertRequiredBootEnv` refuses to start a production process without
      // the key, so reaching this branch there would mean the boot check was
      // circumvented. The boundary closes rather than trusting that it was not.
      if (process.env.NODE_ENV === "production") {
        app.log.error(
          {
            component: "InternalAuth",
            errorCode: "MC-SYS-0001",
            operation: "authenticateInternal",
            outcome: "rejected_unconfigured",
            route: request.routeOptions.url ?? request.url.split("?")[0] ?? "unknown",
            requestId: request.id,
          },
          "INTERNAL_API_KEY is not set in production; refusing the request",
        );
        return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or missing API key." });
      }

      app.log.warn("INTERNAL_API_KEY not set, skipping auth check (development only)");
      return;
    }

    const apiKey = request.headers["x-api-key"];
    if (!secretsMatch(apiKey, internalApiKey)) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or missing API key." });
    }
  });

  /**
   * API-key authentication for public API endpoints.
   *
   * Accepts one of two credentials, checked in this order:
   * 1. **`X-API-Key`** matching `INTERNAL_API_KEY` — used by the frontend BFF
   *    proxy so it can hit the same public routes an external client would.
   * 2. **`X-API-Key`** carrying an issued **`mc_live_…` API-access token**
   *    (MC-088). Validated by SHA-256 hash against `api_client_tokens`; the
   *    project, registration, and token must all be `"active"`. On success
   *    the registration is attached as `request.apiClient`, the token's
   *    `lastUsedAt` is stamped fire-and-forget, and project quotas plus any
   *    narrower registration caps are enforced here, so every
   *    route in the `authenticatePublic` scope is covered without per-route
   *    wiring. Project limits resolve from the project override and the tier
   *    of the subscription that currently grants one; registration caps can
   *    only narrow them. A project whose subscription grants nothing has no
   *    limits at all and is refused here.
   * Response matrix:
   * - missing all credentials → `401 UNAUTHORIZED` ("Authentication required.")
   * - malformed, unknown, revoked, rotated, or stale UUID-shaped key; or
   *   project or registration suspended/revoked →
   *   `401 UNAUTHORIZED` (one shape for every miss, so existence is not leaked)
   * - valid key but the project's plan grants nothing → `403` with `MC-AUTH-0003`
   * - valid key but project quota or registration cap exhausted → `429` with the
   *   standard `MC-API-0003` envelope and `Retry-After`
   * - any credential valid → pass-through (no reply sent)
   *
   * @param request - incoming request; `x-api-key` and `authorization` headers are read,
   *   `request.apiClient` is populated for token-authenticated callers
   * @param reply   - responds with `401` on auth failure, `403` on an inactive plan, `429` on quota exhaustion
   */
  app.decorate("authenticatePublic", async (request: FastifyRequest, reply: FastifyReply) => {
    // Check X-API-Key first (internal)
    const apiKey = request.headers["x-api-key"];
    if (secretsMatch(apiKey, internalApiKey)) {
      return;
    }

    // Issued developer token: hash lookup plus project and registration limits.
    if (typeof apiKey === "string" && looksLikeApiAccessToken(apiKey)) {
      const repo = await getApiAccessRepository();
      const resolved = await repo.findActiveApiClientByTokenHash(hashApiToken(apiKey));
      if (!resolved) {
        return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or revoked API key." });
      }

      request.apiProject = resolved.project;
      request.apiClient = resolved.client;
      request.apiClientTokenId = resolved.token.id;
      request.apiUsageStartedAt = Date.now();

      // Usage stamp is fire-and-forget: the auth hot path must not block on
      // (or fail because of) a bookkeeping write. Quota checks below still
      // count this request even when it ends up 429 — a blocked request is
      // still usage.
      repo.touchApiClientTokenLastUsed(resolved.token.id).catch((error) => {
        request.log.warn(
          {
            cause: sanitizeErrorForLog(error, process.env.NODE_ENV !== "production"),
            component: "PublicApiAuth",
            errorCode: "MC-DB-0004",
            operation: "touchApiClientTokenLastUsed",
            outcome: "last_used_not_recorded",
            projectId: resolved.project.id,
            registrationId: resolved.client.id,
            requestId: request.id,
            method: request.method,
            route: request.routeOptions.url ?? request.url.split("?")[0] ?? "unknown",
          },
          "Failed to stamp API registration token usage",
        );
      });

      const quota = resolvedQuota(resolved.project, resolved.client);
      if (!quota) {
        return reply.status(403).send(createApiErrorResponse(PLAN_NOT_ACTIVE_CODE));
      }

      const quotaChecks = [
        projectMinuteRateLimiter.check(resolved.project.id, quota.projectMinute),
        projectDayRateLimiter.check(resolved.project.id, quota.projectDay),
      ];
      if (quota.registrationMinute < quota.projectMinute) {
        quotaChecks.push(registrationMinuteRateLimiter.check(resolved.client.id, quota.registrationMinute));
      }
      if (quota.registrationDay < quota.projectDay) {
        quotaChecks.push(registrationDayRateLimiter.check(resolved.client.id, quota.registrationDay));
      }
      const limitedCheck = quotaChecks.find((check) => check.limited);
      if (limitedCheck) return sendRateLimitError(reply, limitedCheck);
      return;
    }

    return reply.status(401).send({ error: "UNAUTHORIZED", message: "Authentication required." });
  });

  /**
   * JWT + role-based authentication for admin dashboard endpoints.
   *
   * Requires a valid `Authorization: Bearer <JWT>` header **and** a JWT
   * payload claim of `role === "admin"`. Unlike `authenticatePublic`, there
   * is no API-key fallback — the admin surface is JWT-only so every admin
   * action can be traced to an authenticated user.
   *
   * Response matrix:
   * - no/invalid Bearer header → `401 UNAUTHORIZED` ("Authentication required." / "Invalid or expired token.")
   * - valid JWT but `role !== "admin"` → `403 FORBIDDEN` ("Admin access required.")
   * - valid JWT with admin role → pass-through (no reply sent)
   *
   * @param request - incoming request; `authorization` header is read, `request.user` is populated on success
   * @param reply   - responds with `401` on auth failure or `403` on role mismatch
   */
  app.decorate("authenticateAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Authentication required." });
    }
    try {
      await request.jwtVerify();
      const payload = request.user as { role?: string };
      if (payload.role !== "admin") {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required." });
      }
    } catch {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
    }
  });

  /**
   * Cookie-based session authentication for the developer portal
   * (developer.musiccloud.io).
   *
   * Unlike the admin/public guards this reads the session from the
   * `mc_dev_session` **httpOnly cookie** rather than the `Authorization`
   * header, so `request.jwtVerify()` (which only inspects the header) is the
   * wrong tool here — the cookie value is verified directly via the synchronous
   * `app.jwt.verify`. The JWT carries `{ sub: accountId, kind: "developer" }`;
   * the account is then re-loaded so a suspended/deleted account cannot keep
   * acting on a still-valid token.
   *
   * Response matrix (all failures share the `{ error: "UNAUTHORIZED" }` shape
   * used by the other guards; the portal never needs to distinguish them):
   * - cookie absent → `401`
   * - cookie present but JWT invalid/expired → `401`
   * - JWT valid but `kind !== "developer"` or `sub` missing → `401`
   * - account missing or `status !== "active"` → `401`
   * - all checks pass → `request.developerAccountId` and `request.developerAccount` set, pass-through
   *
   * @param request - incoming request; the `mc_dev_session` cookie is read and
   *   `request.developerAccountId`/`request.developerAccount` are populated on success.
   * @param reply - responds with `401 UNAUTHORIZED` on any auth failure.
   */
  app.decorate("authenticateDeveloper", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    let payload: { sub?: string; kind?: string };
    try {
      payload = app.jwt.verify(token);
    } catch {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired session." });
    }

    if (payload.kind !== SessionKind.Developer || !payload.sub) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired session." });
    }

    const repo = await getDeveloperRepository();
    const account = await repo.findDeveloperAccountById(payload.sub);
    if (!account || account.status !== "active") {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found or inactive." });
    }

    request.developerAccountId = account.id;
    request.developerAccount = account;
  });
}

// `fp()` opts out of Fastify's encapsulation, so the decorators above are
// attached to the root instance rather than a child scope. Without this,
// `app.authenticatePublic(...)` would not be visible to route files
// registered as siblings of this plugin.
export default fp(authPlugin, { name: "auth" });
