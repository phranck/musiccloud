/**
 * @file Admin-caller resolution shared by every admin route that needs the
 * caller's own record. The JWT gate (`authenticateAdmin` in the `adminRoutes`
 * block) only proves "some admin"; these helpers resolve the caller's DB record
 * and enforce the finer owner/admin distinction where moderators must be excluded.
 */

import { AdminRole } from "@musiccloud/shared";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AdminUser } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import { readAdminTokenSubject } from "./admin-session.js";
import { createApiErrorResponse } from "./infra/api-errors.js";

/**
 * Resolves the requesting admin's full DB record from the JWT `sub` claim.
 *
 * The record is read fresh on every call rather than trusted from the token,
 * because the user's role may have changed, or the user been deleted, since
 * the token was issued.
 *
 * @param request - The request whose decoded JWT payload carries `sub`.
 * @returns The admin row, or `null` when the token carries no usable subject
 *   or the user it names no longer exists.
 */
export async function getAdminCaller(request: { user?: unknown }): Promise<AdminUser | null> {
  const subject = readAdminTokenSubject(request.user);
  if (!subject) return null;
  const repo = await getAdminRepository();
  return repo.findAdminById(subject);
}

/**
 * Resolves the caller and rejects the request with 403 unless they are
 * `owner` or `admin`. Returns the caller so handlers can reuse it (e.g. for
 * audit fields) without a second DB round-trip.
 *
 * @param request - The request whose decoded JWT payload carries `sub`.
 * @param reply - Answers the 403.
 * @returns The caller's DB record, or `null` if a 403 reply was already sent.
 */
export async function requireOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply): Promise<AdminUser | null> {
  const caller = await getAdminCaller(request);
  if (!caller || (caller.role !== AdminRole.Owner && caller.role !== AdminRole.Admin)) {
    await reply.status(403).send({ error: "FORBIDDEN", message: "Owner or admin role required." });
    return null;
  }
  return caller;
}

/**
 * Resolves the caller and rejects the request with 403 unless they are the
 * sole `owner` role. Use this for operational controls whose effect reaches
 * beyond ordinary dashboard administration.
 *
 * @param request - The request whose decoded JWT payload carries `sub`.
 * @param reply - Answers the 403.
 * @returns The owner's DB record, or `null` if a 403 reply was already sent.
 */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<AdminUser | null> {
  const caller = await getAdminCaller(request);
  if (!caller || caller.role !== AdminRole.Owner) {
    await reply.status(403).send(createApiErrorResponse("MC-AUTH-0002", { overrideMessage: "Owner role required." }));
    return null;
  }
  return caller;
}
