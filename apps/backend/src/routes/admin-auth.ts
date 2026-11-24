/**
 * @file Admin dashboard authentication (setup, login, me, refresh).
 *
 * Registered at the root scope in `server.ts` (unauth), because the
 * endpoints here are how an admin first obtains a JWT. The two routes that
 * require an existing session, `me` and `refresh`, run `authenticateAdmin`
 * as their own `preHandler`, which leaves the decoded payload on
 * `request.user` for the handler to look the user up by. A token that passes
 * the gate without a `sub` claim is refused with 403.
 *
 * ## First-run setup
 *
 * `setup-status` + `setup` together implement a single-use bootstrap: on
 * a fresh install, the dashboard shows a setup form; after a successful
 * POST, any further setup attempt returns 409. The created user gets
 * `role: "owner"`, distinct from regular `admin`/`moderator` users
 * invited later (managed by `routes/admin-users.ts`).
 *
 * ## Passwords and timing-attack protection
 *
 * Passwords are hashed with `hashPassword` and checked with `verifyPassword`
 * from `services/developer-auth.ts`, the functions the developer portal uses,
 * so both surfaces share one bcrypt work factor. When the username does not
 * exist, `verifyPassword` still pays a full bcrypt comparison against a dummy
 * hash, so the response time does not tell an unknown user from a wrong
 * password. Every password a route sets passes `validatePasswordLength`
 * first, the same rule the portal applies.
 *
 * ## JWT shape and lifetime
 *
 * `signAdminToken` in `lib/admin-session.ts` signs every token here. Tokens
 * carry `sub`, `username`, `role` and `dbRole`. `role` is always
 * `ADMIN_TOKEN_ROLE`, the claim `authenticateAdmin` checks; `dbRole`
 * preserves the real user role (`owner`/`admin`/`moderator`) for
 * finer-grained authorization in downstream handlers. The lifetime is
 * `ADMIN_TOKEN_LIFETIME`, 24h (vs 1h on the public API): admin sessions are
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
import { AdminRole, ENDPOINTS, ROUTE_TEMPLATES, validatePasswordLength } from "@musiccloud/shared";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { nanoid } from "nanoid";
import { getAdminRepository } from "../db/index.js";
import {
  type AdminTokenSigner,
  buildAdminUserResponse,
  readAdminTokenSubject,
  signAdminToken,
} from "../lib/admin-session.js";
import { hashPassword, verifyPassword } from "../services/developer-auth.js";

interface SetupBody {
  username: string;
  password: string;
}

interface LoginBody {
  username: string;
  password: string;
}

/**
 * The refusal of `me` and `refresh` for a token that passed `authenticateAdmin`
 * without a `sub` claim, in the shape the gate uses for a wrong role.
 */
const MISSING_SUBJECT_BODY = { error: "FORBIDDEN", message: "Admin access required." } as const;

/**
 * Registers the admin setup, login, current-user, invite and refresh routes.
 *
 * @param app - The root Fastify instance, which carries `app.jwt` and the
 *   `authenticateAdmin` decorator.
 */
async function adminAuthRoutes(app: FastifyInstance) {
  /** The token signer handed to {@link signAdminToken}, bound to this instance's key. */
  const signToken: AdminTokenSigner = (payload, options) => app.jwt.sign(payload, options);

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
    const passwordRefusal = validatePasswordLength(password);
    if (passwordRefusal) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: passwordRefusal });
    }

    const repo = await getAdminRepository();
    const count = await repo.countAdmins();

    if (count > 0) {
      return reply
        .status(409)
        .send({ error: "CONFLICT", message: "Setup already completed. An admin user already exists." });
    }

    const passwordHash = await hashPassword(password);
    await repo.createAdminUser({ id: nanoid(), username, passwordHash, role: AdminRole.Owner });

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

    // Always pays a full comparison, so the time does not reveal the username.
    const isValid = await verifyPassword(body.password, user?.passwordHash ?? null);

    if (!user || !isValid) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid username or password." });
    }

    const token = signAdminToken(signToken, user);

    // Update last login timestamp (fire and forget)
    repo.updateLastLogin(user.id).catch(() => undefined);

    return reply.send({ token, user: buildAdminUserResponse(user) });
  });
  /**
   * GET /api/admin/auth/me
   * Returns the currently authenticated admin user from the JWT.
   */
  app.get(ENDPOINTS.admin.auth.me, { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const subject = readAdminTokenSubject(request.user);
    if (!subject) {
      return reply.status(403).send(MISSING_SUBJECT_BODY);
    }

    const repo = await getAdminRepository();
    const user = await repo.findAdminById(subject);

    if (!user) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "User not found." });
    }

    return reply.send(buildAdminUserResponse(user));
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
    const passwordRefusal = validatePasswordLength(body.password);
    if (passwordRefusal) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: passwordRefusal });
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

    const passwordHash = await hashPassword(body.password);
    const user = await repo.acceptInvite(matchedId, passwordHash);
    if (!user) {
      return reply.status(404).send({ error: "INVALID_TOKEN", message: "Invite token is invalid or expired." });
    }

    const token = signAdminToken(signToken, user);

    repo.updateLastLogin(user.id).catch(() => undefined);

    return reply.send({ token, user: buildAdminUserResponse(user) });
  });

  /**
   * POST /api/admin/auth/refresh
   * Issues a new JWT for the currently authenticated admin user.
   * Requires a valid (non-expired) JWT.
   */
  app.post(ENDPOINTS.admin.auth.refresh, { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const subject = readAdminTokenSubject(request.user);
    if (!subject) {
      return reply.status(403).send(MISSING_SUBJECT_BODY);
    }

    const repo = await getAdminRepository();
    const user = await repo.findAdminById(subject);
    if (!user) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "User not found." });
    }

    const token = signAdminToken(signToken, user);

    return reply.send({ token });
  });
}

export default fp(adminAuthRoutes, { name: "admin-auth" });
