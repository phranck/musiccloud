/**
 * @file Admin user management endpoints (invite, update, delete, avatar).
 *
 * Registered inside the admin scope in `server.ts`, so every handler runs
 * after `authenticateAdmin`. On top of the JWT gate, each handler pulls
 * the caller's full DB record via `getCaller` and enforces a second
 * permission layer.
 *
 * ## Permission model
 *
 * Three roles live in the DB: `owner`, `admin`, `moderator`. The JWT
 * always carries `role: "admin"` for Fastify's auth plugin (the gate), so
 * finer-grained distinctions are resolved here against `dbRole` / the DB
 * row:
 *
 * | Action                 | owner | self | others |
 * | ---------------------- | ----- | ---- | ------ |
 * | List users             |  yes  | yes  |  yes   |
 * | Create user (invite)   |  yes  |  -   |  no    |
 * | Update own fields      |  yes  | yes  |  no    |
 * | Change any user's role |  yes  |  no  |  no    |
 * | Delete user            |  yes  |  no  |  no    |
 * | Update avatar          |  yes  | yes  |  no    |
 *
 * ## Self-lockout guards
 *
 * Two rules guard against the only owner accidentally locking themselves
 * out of the dashboard:
 *
 * - **Role change on self is forbidden.** An owner who demotes themselves
 *   to admin would leave the system with zero owners and no way back.
 * - **Self-deletion is forbidden.** Same motivation, stronger version.
 *
 * An owner who genuinely wants to demote or remove themselves must first
 * promote a second user to owner from a different session.
 *
 * ## Invite flow
 *
 * Creating a user hands out a single-use invite URL, not a password. The
 * raw token is returned in the response body, but the DB stores only its
 * bcrypt hash (`inviteTokenHash`). Expiry is 7 days. A placeholder random
 * password is written into `passwordHash` so the row is a valid
 * `AdminUser`; the real password is set when the invitee completes the
 * invite flow (handled elsewhere).
 *
 * ## Avatar endpoints (three of them)
 *
 * Avatars can come from three sources and each has its own route:
 *
 * - **POST** (`avatar`): direct upload as `data:image/<mime>;base64,...`.
 *   Accepts JPEG/PNG/WebP only. Fastify route body limit is 8 MB to
 *   accommodate base64 overhead, the logical image limit is 5 MB after
 *   decode (`base64Part.length * 0.75` is the standard approximation).
 * - **PATCH** (`avatar`): external Gravatar URL. The handler whitelists
 *   `https://www.gravatar.com/avatar/` explicitly, to block SSRF/phishing
 *   via arbitrary image hosts.
 * - **DELETE** (`avatar`): clears the column.
 */
import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { AdminUser } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import { requireEnv } from "../lib/env.js";
import { sendTemplatedEmail } from "../services/email-sender.js";

export default async function adminUserRoutes(app: FastifyInstance) {
  // GET /api/admin/users
  app.get(ENDPOINTS.admin.users.list, async () => {
    const repo = await getAdminRepository();
    const users = await repo.listAdminUsers();
    return users.map(toResponse);
  });

  // POST /api/admin/users (owner only)
  app.post(ENDPOINTS.admin.users.list, async (request, reply) => {
    const caller = await getCaller(request);
    if (!caller || caller.role !== "owner") {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const body = request.body as {
      username?: string;
      email?: string;
      role?: string;
      welcomeTemplateId?: number;
    } | null;
    if (!body?.username || !body?.email) {
      return reply.status(400).send({ error: "username and email required" });
    }

    const repo = await getAdminRepository();
    const id = nanoid();
    const inviteToken = nanoid(48);
    // Store only the hash so a DB dump does not expose usable invite
    // tokens. Work factor 10 is fine for one-time tokens that expire in
    // a week; bcrypt 12 (used on real passwords) is overkill here.
    const inviteTokenHash = await bcrypt.hash(inviteToken, 10);

    const role = body.role || "admin";

    await repo.createAdminUser({
      id,
      username: body.username,
      // Placeholder random password: the invitee sets the real password
      // via the invite flow. bcrypt 12 here to match the normal password
      // path in case the row is ever inspected without the invite
      // finishing.
      passwordHash: await bcrypt.hash(nanoid(32), 12),
      email: body.email,
      role,
      inviteTokenHash,
      inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const user = await repo.findAdminById(id);
    const dashboardUrl = requireEnv("DASHBOARD_URL");
    const inviteUrl = `${dashboardUrl}/invite/${inviteToken}`;

    if (body.welcomeTemplateId) {
      try {
        await sendTemplatedEmail({
          templateId: body.welcomeTemplateId,
          to: { email: body.email, name: body.username },
          variables: {
            username: body.username,
            email: body.email,
            role,
            inviteUrl,
            loginUrl: `${dashboardUrl}/login`,
          },
        });
      } catch (error) {
        // Mail send must not roll back user creation: the invite URL is
        // returned in the response and remains copy-pasteable from the
        // UI even if delivery to Brevo fails.
        request.log.error({ err: error, userId: id }, "failed to send welcome email");
      }
    }

    return reply.status(201).send({
      user: toResponse(user!),
      inviteUrl,
    });
  });

  // PATCH /api/admin/users/:id
  app.patch<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.users.detail, async (request, reply) => {
    const { id } = request.params;
    const caller = await getCaller(request);
    if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });

    // Field updates: owner can edit any user, everyone else only themselves.
    if (caller.role !== "owner" && caller.id !== id) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const body = request.body as Record<string, unknown> | null;
    if (!body) return reply.status(400).send({ error: "Body required" });

    const updates: Record<string, unknown> = {};
    if (body.username !== undefined) updates.username = body.username;
    if (body.email !== undefined) updates.email = body.email;
    if (body.password !== undefined) updates.passwordHash = await bcrypt.hash(body.password as string, 12);
    if (body.firstName !== undefined) updates.firstName = body.firstName;
    if (body.lastName !== undefined) updates.lastName = body.lastName;
    if (body.locale !== undefined) updates.locale = body.locale;
    if (body.sessionTimeoutMinutes !== undefined)
      updates.sessionTimeoutMinutes = body.sessionTimeoutMinutes as number | null;

    // Role change gets the stricter permission check: owner only, and
    // never on themselves. The self-guard prevents an owner from
    // demoting themselves to admin (which would leave the system with
    // no owner and no way back through the UI).
    if (body.role !== undefined) {
      if (caller.role !== "owner" || caller.id === id) {
        return reply.status(403).send({ error: "FORBIDDEN" });
      }
      updates.role = body.role;
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: "Nothing to update" });
    }

    const repo = await getAdminRepository();
    const updated = await repo.updateAdminUser(id, updates);
    if (!updated) return reply.status(404).send({ error: "User not found" });

    return toResponse(updated);
  });

  // DELETE /api/admin/users/:id (owner only)
  app.delete<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.users.detail, async (request, reply) => {
    const { id } = request.params;
    const caller = await getCaller(request);
    if (!caller || caller.role !== "owner") {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }
    // Self-deletion would strand the system without an owner in the
    // single-owner case. See the "Self-lockout guards" section in the
    // file header.
    if (caller.id === id) {
      return reply.status(400).send({ error: "Cannot delete yourself" });
    }

    const repo = await getAdminRepository();
    await repo.deleteAdminUser(id);
    return { message: "User deleted" };
  });

  // POST /api/admin/users/:id/avatar (upload)
  app.post<{ Params: { id: string } }>(
    ROUTE_TEMPLATES.admin.users.avatar,
    { bodyLimit: 8 * 1024 * 1024 },
    async (request, reply) => {
      const { id } = request.params;
      const caller = await getCaller(request);
      if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });
      if (caller.role !== "owner" && caller.id !== id) {
        return reply.status(403).send({ error: "FORBIDDEN" });
      }

      const body = request.body as { dataUrl?: string } | null;
      if (!body?.dataUrl) return reply.status(400).send({ error: "No image provided" });

      // Whitelist MIME types. Accepting arbitrary `image/*` would let a
      // client drop SVG (XSS vector through `<script>` or `<foreignObject>`)
      // or non-image binaries with a spoofed header.
      const match = body.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
      if (!match) {
        return reply.status(400).send({ error: "Only JPEG, PNG or WebP" });
      }

      // Logical size check on the decoded image. The 0.75 factor is the
      // standard base64 overhead (3 input bytes per 4 output chars), so
      // the check is a fast approximation of the post-decode size
      // without actually decoding. Fastify's `bodyLimit: 8 MB` above
      // already caps the HTTP body; this inner cap of 5 MB keeps the
      // stored column size reasonable for DB storage and for the
      // avatar render path.
      const base64Part = body.dataUrl.slice(body.dataUrl.indexOf(",") + 1);
      const approxBytes = Math.ceil(base64Part.length * 0.75);
      if (approxBytes > 5 * 1024 * 1024) {
        return reply.status(400).send({ error: "File too large (max 5MB)" });
      }

      const repo = await getAdminRepository();
      const updated = await repo.updateAdminUser(id, { avatarUrl: body.dataUrl });
      if (!updated) return reply.status(404).send({ error: "User not found" });

      return toResponse(updated);
    },
  );

  // PATCH /api/admin/users/:id/avatar (gravatar)
  app.patch<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.users.avatar, async (request, reply) => {
    const { id } = request.params;
    const caller = await getCaller(request);
    if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });
    if (caller.role !== "owner" && caller.id !== id) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const body = request.body as { gravatarUrl?: string } | null;
    // Origin whitelist on the URL itself. Accepting arbitrary external
    // URLs would let an attacker coax the dashboard (and any image proxy
    // in front of it) into fetching internal / malicious endpoints by
    // storing the URL as an avatar.
    if (!body?.gravatarUrl?.startsWith("https://www.gravatar.com/avatar/")) {
      return reply.status(400).send({ error: "Must be a Gravatar URL" });
    }

    const repo = await getAdminRepository();
    const updated = await repo.updateAdminUser(id, { avatarUrl: body.gravatarUrl });
    if (!updated) return reply.status(404).send({ error: "User not found" });

    return toResponse(updated);
  });

  // DELETE /api/admin/users/:id/avatar
  app.delete<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.users.avatar, async (request, reply) => {
    const { id } = request.params;
    const caller = await getCaller(request);
    if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });
    if (caller.role !== "owner" && caller.id !== id) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const repo = await getAdminRepository();
    const updated = await repo.updateAdminUser(id, { avatarUrl: null });
    if (!updated) return reply.status(404).send({ error: "User not found" });

    return toResponse(updated);
  });
}

/**
 * Resolves the caller's full DB record from the verified JWT payload.
 * Used by every mutating endpoint instead of trusting `request.user`
 * directly: the payload contains only `sub` and `role`, but the
 * permission rules here need the fresh DB row (the user's role may have
 * changed since the token was issued, and we want the latest truth).
 *
 * @param request - incoming Fastify request, post `jwtVerify` hook
 * @returns the admin user record, or `null` if the token is malformed or
 *          the referenced user has since been deleted
 */
async function getCaller(request: { user?: unknown }) {
  const payload = request.user as { sub?: string; role?: string } | undefined;
  if (!payload?.sub) return null;
  const repo = await getAdminRepository();
  return repo.findAdminById(payload.sub);
}

/**
 * Shapes a DB `AdminUser` row into the public response. Critically,
 * strips every sensitive column (`passwordHash`, `inviteTokenHash`,
 * `inviteExpiresAt`) by inclusion list rather than exclusion list, so
 * adding a new sensitive column cannot accidentally leak it through this
 * endpoint.
 *
 * @param user - row from the admin repository
 * @returns the API-safe user payload
 */
function toResponse(user: AdminUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? undefined,
    locale: user.locale as "de" | "en",
    role: user.role as "owner" | "admin" | "moderator",
    isOwner: user.role === "owner",
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    sessionTimeoutMinutes: user.sessionTimeoutMinutes,
    createdAt: new Date(user.createdAt).toISOString(),
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
  };
}
