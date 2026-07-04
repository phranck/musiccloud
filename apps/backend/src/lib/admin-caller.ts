/**
 * @file Admin-caller resolution shared by admin routes (extracted from
 * `admin-api-access.ts` when the GDPR routes needed the same check, MC-085).
 * The JWT gate (`authenticateAdmin` in the `adminRoutes` block) only proves
 * "some admin"; these helpers resolve the caller's DB record and enforce the
 * finer owner/admin distinction where moderators must be excluded.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import type { AdminUser } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

/**
 * Resolves the requesting admin's full DB record from the JWT `sub` claim.
 *
 * @param request - The request whose decoded JWT payload carries `sub`.
 * @returns The admin row, or `null` when the token carries no usable subject.
 */
export async function getAdminCaller(request: { user?: unknown }): Promise<AdminUser | null> {
  const payload = request.user as { sub?: string } | undefined;
  if (!payload?.sub) return null;
  const repo = await getAdminRepository();
  return repo.findAdminById(payload.sub);
}

/**
 * Resolves the caller and rejects the request with 403 unless they are
 * `owner` or `admin`. Returns the caller so handlers can reuse it (e.g. for
 * audit fields) without a second DB round-trip.
 *
 * @returns The caller's DB record, or `null` if a 403 reply was already sent.
 */
export async function requireOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply): Promise<AdminUser | null> {
  const caller = await getAdminCaller(request);
  if (!caller || (caller.role !== "owner" && caller.role !== "admin")) {
    await reply.status(403).send({ error: "FORBIDDEN", message: "Owner or admin role required." });
    return null;
  }
  return caller;
}
