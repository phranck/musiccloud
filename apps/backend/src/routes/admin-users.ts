/**
 * @file Admin user management endpoints (invite, update, delete, avatar).
 *
 * Registered inside the admin scope in `server.ts`, so every handler runs
 * after `authenticateAdmin`. On top of the JWT gate, each handler pulls
 * the caller's full DB record via `getAdminCaller` and enforces a second
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
 * - **POST** (`avatar`): direct upload as `data:image/<mime>;base64,...`,
 *   checked by `parseImageDataUrl` in `lib/image-upload.ts`, the rule every
 *   upload route shares: JPEG, PNG or WebP, at most 5 MB once decoded.
 * - **PATCH** (`avatar`): external Gravatar URL, checked by
 *   `isGravatarAddress` in `lib/gravatar.ts` so only Gravatar's own hosts
 *   are stored, to block SSRF/phishing via arbitrary image hosts.
 * - **DELETE** (`avatar`): clears the column.
 */
import {
  AdminRole,
  EmailAction,
  EmailRecipientKind,
  ENDPOINTS,
  isAdminRole,
  ROUTE_TEMPLATES,
  validatePasswordLength,
} from "@musiccloud/shared";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { getAdminRepository } from "../db/index.js";
import { getAdminCaller } from "../lib/admin-caller.js";
import { buildAdminUserResponse } from "../lib/admin-session.js";
import { INVALID_EMAIL_CODE, normalizeEmailAddress } from "../lib/email-address.js";
import { requireEnv } from "../lib/env.js";
import { isGravatarAddress } from "../lib/gravatar.js";
import { ADMIN_IMAGE_REFUSAL_ERRORS, IMAGE_UPLOAD_BODY_LIMIT_BYTES, parseImageDataUrl } from "../lib/image-upload.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { hashPassword } from "../services/developer-auth.js";
import { triggerEmailAction } from "../services/email-actions.js";

/**
 * The 400 body for a role outside `AdminRole`. A stored role of any other
 * name would match neither the owner check nor the admin check, so the
 * create and update handlers refuse it before writing.
 */
const INVALID_ROLE_BODY = {
  error: "INVALID_REQUEST",
  message: `Role must be one of: ${Object.values(AdminRole).join(", ")}.`,
} as const;

/**
 * Registers the admin user management routes: list, invite, update, delete
 * and the three avatar routes. See the file header for the permission model.
 *
 * @param app - The admin scope, whose `authenticateAdmin` gate runs first.
 */
export default async function adminUserRoutes(app: FastifyInstance) {
  // GET /api/admin/users
  app.get(ENDPOINTS.admin.users.list, async () => {
    const repo = await getAdminRepository();
    const users = await repo.listAdminUsers();
    return users.map(buildAdminUserResponse);
  });

  // POST /api/admin/users (owner only)
  app.post(ENDPOINTS.admin.users.list, async (request, reply) => {
    const caller = await getAdminCaller(request);
    if (!caller || caller.role !== AdminRole.Owner) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const body = request.body as {
      username?: string;
      email?: string;
      role?: unknown;
    } | null;
    if (!body?.username || !body?.email) {
      return reply.status(400).send({ error: "username and email required" });
    }
    // The invite mail goes to this address, so it has to be one.
    const email = normalizeEmailAddress(body.email);
    if (!email) return reply.status(400).send(createApiErrorResponse(INVALID_EMAIL_CODE));

    // An absent or empty role invites an admin.
    const role = body.role || AdminRole.Admin;
    if (!isAdminRole(role)) return reply.status(400).send(INVALID_ROLE_BODY);

    const repo = await getAdminRepository();
    const id = nanoid();
    const inviteToken = nanoid(48);
    // Store only the hash so a DB dump does not expose usable invite
    // tokens. Work factor 10 is fine for one-time tokens that expire in
    // a week; bcrypt 12 (used on real passwords) is overkill here.
    const inviteTokenHash = await bcrypt.hash(inviteToken, 10);

    await repo.createAdminUser({
      id,
      username: body.username,
      // Placeholder random password, because the invitee sets the real one
      // through the invite flow. It is hashed like a real password in case
      // the row is ever inspected without the invite finishing.
      passwordHash: await hashPassword(nanoid(32)),
      email,
      role,
      inviteTokenHash,
      inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const user = await repo.findAdminById(id);
    const dashboardUrl = requireEnv("DASHBOARD_URL");
    const inviteUrl = `${dashboardUrl}/invite/${inviteToken}`;

    try {
      await triggerEmailAction(EmailAction.AdminInviteSent, {
        to: { email, name: body.username },
        recipient: {
          kind: EmailRecipientKind.AdminUser,
          username: body.username,
          email,
          role,
        },
        // System variables (websiteUrl, dashboardUrl, loginUrl, …) resolve
        // inside the trigger; only the action's context extras go here.
        context: { inviteUrl },
      });
    } catch (error) {
      // Mail send must not roll back user creation: the invite URL is
      // returned in the response and remains copy-pasteable from the UI
      // even if email delivery fails. `triggerEmailAction` can now throw for
      // reasons beyond "SMTP failed" (e.g. no enabled template bound to
      // AdminInviteSent, or a bound template's required variable this route
      // does not supply) — those are still just logged here, not surfaced
      // as a failed user creation, matching the previous resilience
      // behavior.
      request.log.error({ err: error, userId: id }, "failed to send welcome email");
    }

    return reply.status(201).send({
      user: buildAdminUserResponse(user!),
      inviteUrl,
    });
  });

  // PATCH /api/admin/users/:id
  app.patch<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.users.detail, async (request, reply) => {
    const { id } = request.params;
    const caller = await getAdminCaller(request);
    if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });

    // Field updates: owner can edit any user, everyone else only themselves.
    if (caller.role !== AdminRole.Owner && caller.id !== id) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const body = request.body as Record<string, unknown> | null;
    if (!body) return reply.status(400).send({ error: "Body required" });

    const updates: Record<string, unknown> = {};
    if (body.username !== undefined) updates.username = body.username;
    if (body.email !== undefined) {
      const email = normalizeEmailAddress(body.email);
      if (!email) return reply.status(400).send(createApiErrorResponse(INVALID_EMAIL_CODE));
      updates.email = email;
    }
    if (body.password !== undefined) {
      // The same rule the sign-up, reset and invite paths apply, so an admin
      // account cannot be given a password those paths would refuse.
      const passwordRefusal = validatePasswordLength(body.password);
      if (passwordRefusal) return reply.status(400).send({ error: "INVALID_REQUEST", message: passwordRefusal });
      updates.passwordHash = await hashPassword(body.password as string);
    }
    if (body.firstName !== undefined) updates.firstName = body.firstName;
    if (body.lastName !== undefined) updates.lastName = body.lastName;
    if (body.sessionTimeoutMinutes !== undefined)
      updates.sessionTimeoutMinutes = body.sessionTimeoutMinutes as number | null;

    // Role change gets the stricter permission check: owner only, and
    // never on themselves. The self-guard prevents an owner from
    // demoting themselves to admin (which would leave the system with
    // no owner and no way back through the UI).
    if (body.role !== undefined) {
      if (caller.role !== AdminRole.Owner || caller.id === id) {
        return reply.status(403).send({ error: "FORBIDDEN" });
      }
      if (!isAdminRole(body.role)) return reply.status(400).send(INVALID_ROLE_BODY);
      updates.role = body.role;
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: "Nothing to update" });
    }

    const repo = await getAdminRepository();
    const updated = await repo.updateAdminUser(id, updates);
    if (!updated) return reply.status(404).send({ error: "User not found" });

    return buildAdminUserResponse(updated);
  });

  // DELETE /api/admin/users/:id (owner only)
  app.delete<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.users.detail, async (request, reply) => {
    const { id } = request.params;
    const caller = await getAdminCaller(request);
    if (!caller || caller.role !== AdminRole.Owner) {
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
    { bodyLimit: IMAGE_UPLOAD_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const { id } = request.params;
      const caller = await getAdminCaller(request);
      if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });
      if (caller.role !== AdminRole.Owner && caller.id !== id) {
        return reply.status(403).send({ error: "FORBIDDEN" });
      }

      const body = request.body as { dataUrl?: string } | null;
      if (!body?.dataUrl) return reply.status(400).send({ error: "No image provided" });

      // The rule every upload route applies, which keeps SVG out because it
      // can carry script.
      const image = parseImageDataUrl(body.dataUrl);
      if (!image.ok) {
        return reply.status(400).send({ error: ADMIN_IMAGE_REFUSAL_ERRORS[image.reason] });
      }

      const repo = await getAdminRepository();
      const updated = await repo.updateAdminUser(id, { avatarUrl: body.dataUrl });
      if (!updated) return reply.status(404).send({ error: "User not found" });

      return buildAdminUserResponse(updated);
    },
  );

  // PATCH /api/admin/users/:id/avatar (gravatar)
  app.patch<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.users.avatar, async (request, reply) => {
    const { id } = request.params;
    const caller = await getAdminCaller(request);
    if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });
    if (caller.role !== AdminRole.Owner && caller.id !== id) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const body = request.body as { gravatarUrl?: unknown } | null;
    // The address is rendered as an image later, so anything outside
    // Gravatar's hosts would make the dashboard fetch from wherever it names.
    if (!isGravatarAddress(body?.gravatarUrl)) {
      return reply.status(400).send({ error: "Must be a Gravatar URL" });
    }

    const repo = await getAdminRepository();
    const updated = await repo.updateAdminUser(id, { avatarUrl: body.gravatarUrl });
    if (!updated) return reply.status(404).send({ error: "User not found" });

    return buildAdminUserResponse(updated);
  });

  // DELETE /api/admin/users/:id/avatar
  app.delete<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.users.avatar, async (request, reply) => {
    const { id } = request.params;
    const caller = await getAdminCaller(request);
    if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });
    if (caller.role !== AdminRole.Owner && caller.id !== id) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const repo = await getAdminRepository();
    const updated = await repo.updateAdminUser(id, { avatarUrl: null });
    if (!updated) return reply.status(404).send({ error: "User not found" });

    return buildAdminUserResponse(updated);
  });
}
