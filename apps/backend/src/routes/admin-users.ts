import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { AdminUser } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

export default async function adminUserRoutes(app: FastifyInstance) {
  // GET /api/admin/users
  app.get("/api/admin/users", async () => {
    const repo = await getAdminRepository();
    const users = await repo.listAdminUsers();
    return users.map(toResponse);
  });

  // POST /api/admin/users (owner only)
  app.post("/api/admin/users", async (request, reply) => {
    const caller = await getCaller(request);
    if (!caller || caller.role !== "owner") {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const body = request.body as { username?: string; email?: string; role?: string } | null;
    if (!body?.username || !body?.email) {
      return reply.status(400).send({ error: "username and email required" });
    }

    const repo = await getAdminRepository();
    const id = nanoid();
    const inviteToken = nanoid(48);
    const inviteTokenHash = await bcrypt.hash(inviteToken, 10);

    await repo.createAdminUser({
      id,
      username: body.username,
      passwordHash: await bcrypt.hash(nanoid(32), 12), // random password, user sets via invite
      email: body.email,
      role: body.role || "admin",
      inviteTokenHash,
      inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const user = await repo.findAdminById(id);
    const baseUrl = process.env.PUBLIC_URL ?? "https://music.cloud";
    const inviteUrl = `${baseUrl}/dashboard/invite/${inviteToken}`;

    return reply.status(201).send({
      user: toResponse(user!),
      inviteUrl,
    });
  });

  // PATCH /api/admin/users/:id
  app.patch<{ Params: { id: string } }>("/api/admin/users/:id", async (request, reply) => {
    const { id } = request.params;
    const caller = await getCaller(request);
    if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });

    // Permission: owner can edit anyone, others only themselves
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

    // Role changes: owner only, not self
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
  app.delete<{ Params: { id: string } }>("/api/admin/users/:id", async (request, reply) => {
    const { id } = request.params;
    const caller = await getCaller(request);
    if (!caller || caller.role !== "owner") {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }
    if (caller.id === id) {
      return reply.status(400).send({ error: "Cannot delete yourself" });
    }

    const repo = await getAdminRepository();
    await repo.deleteAdminUser(id);
    return { message: "User deleted" };
  });

  // POST /api/admin/users/:id/avatar (upload)
  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/avatar",
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

      const match = body.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
      if (!match) {
        return reply.status(400).send({ error: "Only JPEG, PNG or WebP" });
      }

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
  app.patch<{ Params: { id: string } }>("/api/admin/users/:id/avatar", async (request, reply) => {
    const { id } = request.params;
    const caller = await getCaller(request);
    if (!caller) return reply.status(401).send({ error: "UNAUTHORIZED" });
    if (caller.role !== "owner" && caller.id !== id) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const body = request.body as { gravatarUrl?: string } | null;
    if (!body?.gravatarUrl?.startsWith("https://www.gravatar.com/avatar/")) {
      return reply.status(400).send({ error: "Must be a Gravatar URL" });
    }

    const repo = await getAdminRepository();
    const updated = await repo.updateAdminUser(id, { avatarUrl: body.gravatarUrl });
    if (!updated) return reply.status(404).send({ error: "User not found" });

    return toResponse(updated);
  });

  // DELETE /api/admin/users/:id/avatar
  app.delete<{ Params: { id: string } }>("/api/admin/users/:id/avatar", async (request, reply) => {
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

// Helper: get caller from JWT
async function getCaller(request: { user?: unknown }) {
  const payload = request.user as { sub?: string; role?: string } | undefined;
  if (!payload?.sub) return null;
  const repo = await getAdminRepository();
  return repo.findAdminById(payload.sub);
}

// Helper: convert DB AdminUser to API response (never expose passwordHash)
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
