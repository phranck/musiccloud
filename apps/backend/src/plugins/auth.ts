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
 * | `authenticatePublic`    | Public API clients + frontend BFF | `X-API-Key` **or** `Authorization: Bearer <JWT>` |
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
 * - `INTERNAL_API_KEY` — shared secret between the frontend proxy and
 *   backend. If unset, `authenticateInternal` logs a warning and lets
 *   requests through (developer ergonomics). In production this variable
 *   **must** be set; otherwise the BFF boundary is effectively open.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { getDeveloperRepository } from "../db/index.js";
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
     * Id of the authenticated developer account, set by
     * {@link FastifyInstance.authenticateDeveloper} after a valid
     * `mc_dev_session` cookie is verified. Absent on unauthenticated requests.
     */
    developerAccountId?: string;
  }
}

async function authPlugin(app: FastifyInstance) {
  const internalApiKey = process.env.INTERNAL_API_KEY;

  /**
   * API-key authentication for internal BFF traffic.
   *
   * Intended for requests originating from the Astro SSR frontend's API proxy
   * (`apps/frontend/src/pages/api/*`) calling into the backend. The proxy
   * attaches `X-API-Key: <INTERNAL_API_KEY>`, and this handler rejects any
   * request whose header does not match the configured secret.
   *
   * **Fallback when `INTERNAL_API_KEY` is unset:** the handler emits a warn
   * log and lets the request through. This keeps local development frictionless
   * but means production deployments **must** set the variable — otherwise the
   * internal boundary is not enforced.
   *
   * @param request - incoming Fastify request; `x-api-key` header is read
   * @param reply   - responds with `401 UNAUTHORIZED` on key mismatch
   */
  app.decorate("authenticateInternal", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!internalApiKey) {
      app.log.warn("INTERNAL_API_KEY not set, skipping auth check");
      return;
    }

    const apiKey = request.headers["x-api-key"];
    if (apiKey !== internalApiKey) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or missing API key." });
    }
  });

  /**
   * Dual-credential authentication for public API endpoints.
   *
   * Accepts either credential, in this order:
   * 1. **`X-API-Key`** matching `INTERNAL_API_KEY` — used by the frontend BFF
   *    proxy so it can hit the same public routes an external client would.
   * 2. **`Authorization: Bearer <JWT>`** — for external API clients. Verified
   *    via `request.jwtVerify()` (provided by `@fastify/jwt`).
   *
   * Response matrix:
   * - missing both headers → `401 UNAUTHORIZED` ("Authentication required.")
   * - Bearer token present but invalid/expired → `401 UNAUTHORIZED`
   * - either credential valid → pass-through (no reply sent)
   *
   * @param request - incoming request; `x-api-key` and `authorization` headers are read
   * @param reply   - responds with `401` on auth failure
   */
  app.decorate("authenticatePublic", async (request: FastifyRequest, reply: FastifyReply) => {
    // Check X-API-Key first (internal)
    const apiKey = request.headers["x-api-key"];
    if (apiKey && internalApiKey && apiKey === internalApiKey) {
      return;
    }

    // Check Bearer JWT
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        await request.jwtVerify();
        return;
      } catch {
        return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
      }
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
   * - all checks pass → `request.developerAccountId` set, pass-through
   *
   * @param request - incoming request; the `mc_dev_session` cookie is read and
   *   `request.developerAccountId` is populated on success.
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
  });
}

// `fp()` opts out of Fastify's encapsulation, so the decorators above are
// attached to the root instance rather than a child scope. Without this,
// `app.authenticatePublic(...)` would not be visible to route files
// registered as siblings of this plugin.
export default fp(authPlugin, { name: "auth" });
