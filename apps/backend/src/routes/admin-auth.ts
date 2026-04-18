/**
 * @file Admin dashboard authentication (setup, login, me, refresh).
 *
 * Registered at the root scope in `server.ts` (unauth), because the
 * endpoints here are how an admin first obtains a JWT. Routes that
 * require an existing session verify the Bearer token inline via
 * `request.jwtVerify()` rather than through the `authenticateAdmin`
 * decorator, because the handlers need the decoded payload to look up
 * the user anyway.
 *
 * ## First-run setup
 *
 * `setup-status` + `setup` together implement a single-use bootstrap: on
 * a fresh install, the dashboard shows a setup form; after a successful
 * POST, any further setup attempt returns 409. The created user gets
 * `role: "owner"`, distinct from regular `admin`/`moderator` users
 * invited later (managed by `routes/admin-users.ts`).
 *
 * ## Login flow and timing-attack protection
 *
 * If the username does not exist, the handler still runs `bcrypt.compare`
 * against a dummy hash. This keeps response time statistically identical
 * between "unknown user" and "known user + wrong password", so an
 * attacker cannot enumerate valid usernames by measuring latency. bcrypt
 * is already a constant-time comparator for its own purposes; the dummy
 * compare covers the outer shape of the check.
 *
 * bcrypt work factor is 12. That is two rungs above the library default
 * of 10 (roughly 4x slower), accepted here as a deliberate trade against
 * brute-force budget at the cost of per-login latency.
 *
 * ## JWT shape and lifetime
 *
 * Tokens carry `sub`, `username`, `role: "admin"`, and `dbRole`. `role`
 * is hardcoded to `"admin"` because `authenticateAdmin` checks that exact
 * string; `dbRole` preserves the real user role (`owner`/`admin`/
 * `moderator`) for finer-grained authorization in downstream handlers.
 * Lifetime is 24h (vs 1h on the public API): admin sessions are
 * interactive and a shorter expiry would thrash the dashboard.
 *
 * The refresh endpoint issues a new 24h token provided the current one
 * still verifies. Once a token is expired, the user must log in again:
 * there is no refresh-token flow.
 *
 * ## Fire-and-forget last-login
 *
 * `updateLastLogin` is intentionally not awaited. A failed stat write
 * must not block or fail the login response, so the promise's rejection
 * is swallowed.
 */
import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { nanoid } from "nanoid";
import type { AdminUser } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

interface SetupBody {
  username: string;
  password: string;
}

interface LoginBody {
  username: string;
  password: string;
}

/**
 * Shapes an internal `AdminUser` row into the public user payload returned
 * by `/login` and `/me`. Centralized here so the two endpoints cannot
 * drift apart accidentally (they are consumed by the same React store on
 * the dashboard, which assumes one shape).
 *
 * Fields coerced here, not in the DB layer:
 * - `email` goes from DB `null` to wire-level `undefined` (tells the
 *   frontend to omit the field rather than render an empty value).
 * - `locale` falls back to `"de"` when the DB row predates the column.
 * - `createdAt`/`lastLoginAt` become ISO strings for JSON-safe transport.
 *
 * @param user - row as returned by the admin repository
 * @returns user payload with DB types normalised for the dashboard client
 */
function buildUserResponse(user: AdminUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? undefined,
    role: user.role as "owner" | "admin" | "moderator",
    isOwner: user.role === "owner",
    locale: (user.locale || "de") as "de" | "en",
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    sessionTimeoutMinutes: user.sessionTimeoutMinutes,
    createdAt: new Date(user.createdAt).toISOString(),
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
  };
}

async function adminAuthRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/auth/setup-status
   * Returns whether first-run setup is required (no admin users exist yet).
   */
  app.get(ENDPOINTS.admin.auth.setupStatus, async (_request, reply) => {
    const repo = await getAdminRepository();
    const count = await repo.countAdmins();
    return reply.send({ needsSetup: count === 0 });
  });

  /**
   * POST /api/admin/auth/setup
   * Creates the first admin user. Returns 409 if any admin already exists.
   */
  app.post(ENDPOINTS.admin.auth.setup, async (request, reply) => {
    const body = request.body as SetupBody | null;

    if (!body?.username || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "username and password are required." });
    }

    const username = body.username.trim();
    const password = body.password;

    if (username.length < 3 || username.length > 32) {
      return reply
        .status(400)
        .send({ error: "INVALID_REQUEST", message: "username must be between 3 and 32 characters." });
    }
    if (password.length < 8 || password.length > 128) {
      return reply
        .status(400)
        .send({ error: "INVALID_REQUEST", message: "password must be between 8 and 128 characters." });
    }

    const repo = await getAdminRepository();
    const count = await repo.countAdmins();

    if (count > 0) {
      return reply
        .status(409)
        .send({ error: "CONFLICT", message: "Setup already completed. An admin user already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await repo.createAdminUser({ id: nanoid(), username, passwordHash, role: "owner", locale: "de" });

    app.log.info("[Admin] First admin user created");
    return reply.status(201).send({ message: "Admin user created." });
  });

  /**
   * POST /api/admin/auth/login
   * Authenticates an admin user and returns a signed JWT.
   */
  app.post(ENDPOINTS.admin.auth.login, async (request, reply) => {
    const body = request.body as LoginBody | null;

    if (!body?.username || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "username and password are required." });
    }

    const repo = await getAdminRepository();
    const user = await repo.findAdminByUsername(body.username.trim());

    // Constant-time comparison: always hash-compare to prevent timing attacks
    const dummyHash = "$2a$12$invalidhashfortimingprotection000000000000000000000000";
    const isValid = user
      ? await bcrypt.compare(body.password, user.passwordHash)
      : await bcrypt.compare(body.password, dummyHash);

    if (!user || !isValid) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid username or password." });
    }

    const token = app.jwt.sign(
      { sub: user.id, username: user.username, role: "admin", dbRole: user.role },
      { expiresIn: "24h" },
    );

    // Update last login timestamp (fire and forget)
    repo.updateLastLogin(user.id).catch(() => undefined);

    return reply.send({ token, user: buildUserResponse(user) });
  });
  /**
   * GET /api/admin/auth/me
   * Returns the currently authenticated admin user from the JWT.
   */
  app.get(ENDPOINTS.admin.auth.me, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
    }

    const payload = request.user as { sub?: string; role?: string };
    if (payload.role !== "admin" || !payload.sub) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required." });
    }

    const repo = await getAdminRepository();
    const user = await repo.findAdminById(payload.sub);

    if (!user) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "User not found." });
    }

    return reply.send(buildUserResponse(user));
  });

  /**
   * GET /api/admin/invite/:token
   * Validates the invite token (bcrypt-compared against every unexpired
   * invite hash) and returns the invitee's username + email so the
   * dashboard can show the accept-invite form.
   */
  app.get<{ Params: { token: string } }>(ROUTE_TEMPLATES.admin.invite.state, async (request, reply) => {
    const { token } = request.params;
    if (!token) return reply.status(400).send({ error: "INVALID_REQUEST", message: "Token required." });

    const repo = await getAdminRepository();
    const pending = await repo.listPendingInvites();

    for (const row of pending) {
      if (await bcrypt.compare(token, row.inviteTokenHash)) {
        return reply.send({ username: row.username, email: row.email ?? "" });
      }
    }

    return reply.status(404).send({ error: "INVALID_TOKEN", message: "Invite token is invalid or expired." });
  });

  /**
   * POST /api/admin/invite/accept
   * Consumes the invite token: sets the user's real password and clears
   * the invite columns so the token cannot be replayed.
   */
  app.post(ENDPOINTS.admin.invite.accept, async (request, reply) => {
    const body = request.body as { token?: string; password?: string } | null;
    if (!body?.token || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "token and password are required." });
    }
    if (body.password.length < 8 || body.password.length > 128) {
      return reply
        .status(400)
        .send({ error: "INVALID_REQUEST", message: "password must be between 8 and 128 characters." });
    }

    const repo = await getAdminRepository();
    const pending = await repo.listPendingInvites();

    let matchedId: string | null = null;
    for (const row of pending) {
      if (await bcrypt.compare(body.token, row.inviteTokenHash)) {
        matchedId = row.id;
        break;
      }
    }

    if (!matchedId) {
      return reply.status(404).send({ error: "INVALID_TOKEN", message: "Invite token is invalid or expired." });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await repo.acceptInvite(matchedId, passwordHash);
    if (!user) {
      return reply.status(404).send({ error: "INVALID_TOKEN", message: "Invite token is invalid or expired." });
    }

    const token = app.jwt.sign(
      { sub: user.id, username: user.username, role: "admin", dbRole: user.role },
      { expiresIn: "24h" },
    );

    repo.updateLastLogin(user.id).catch(() => undefined);

    return reply.send({ token, user: buildUserResponse(user) });
  });

  /**
   * POST /api/admin/auth/refresh
   * Issues a new JWT for the currently authenticated admin user.
   * Requires a valid (non-expired) JWT.
   */
  app.post(ENDPOINTS.admin.auth.refresh, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
    }

    const payload = request.user as { sub?: string; role?: string };
    if (payload.role !== "admin" || !payload.sub) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required." });
    }

    const repo = await getAdminRepository();
    const user = await repo.findAdminById(payload.sub);
    if (!user) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "User not found." });
    }

    const token = app.jwt.sign(
      { sub: user.id, username: user.username, role: "admin", dbRole: user.role },
      { expiresIn: "24h" },
    );

    return reply.send({ token });
  });
}

export default fp(adminAuthRoutes, { name: "admin-auth" });
