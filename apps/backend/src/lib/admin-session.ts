/**
 * @file The admin dashboard session: the token the admin auth routes sign, the
 * claim `authenticateAdmin` checks on it, and the user payload those routes and
 * the user management routes answer with.
 *
 * The signed claim and the checked claim both read {@link ADMIN_TOKEN_ROLE}, so
 * a token this module signs is a token the gate admits.
 */

import { AdminRole, type AdminUserResponse } from "@musiccloud/shared";

import type { AdminUser } from "../db/admin-repository.js";

/**
 * The `role` claim of every admin token: `"admin"`, whatever role the user
 * holds. `authenticateAdmin` in `plugins/auth.ts` admits a token only with this
 * claim, and the user's real role travels separately as `dbRole`.
 */
export const ADMIN_TOKEN_ROLE = "admin";

/**
 * How long an admin token stays valid: `"24h"`, in the notation `@fastify/jwt`
 * reads. Admin sessions are interactive, so a shorter lifetime would sign the
 * dashboard out mid-task; `POST /api/admin/auth/refresh` issues a new one while
 * the current one still verifies.
 */
export const ADMIN_TOKEN_LIFETIME = "24h";

/**
 * The claims of an admin token.
 *
 * @property sub - The admin user's id.
 * @property username - The admin user's sign-in name.
 * @property role - Always {@link ADMIN_TOKEN_ROLE}, the claim the gate checks.
 * @property dbRole - The role stored for the user, for the finer checks behind the gate.
 */
export interface AdminTokenPayload {
  sub: string;
  username: string;
  role: typeof ADMIN_TOKEN_ROLE;
  dbRole: string;
}

/** Signs an admin token the way `app.jwt.sign` does. Passed in so this module stays framework-free. */
export type AdminTokenSigner = (payload: AdminTokenPayload, options: { expiresIn: string }) => string;

/**
 * Signs the session token for an admin user who has just signed in, accepted
 * an invite or asked for a refresh.
 *
 * @param sign - The signer, `(payload, options) => app.jwt.sign(payload, options)`.
 * @param user - The admin user the token is for, as stored.
 * @returns The signed token, valid for {@link ADMIN_TOKEN_LIFETIME}.
 */
export function signAdminToken(sign: AdminTokenSigner, user: Pick<AdminUser, "id" | "username" | "role">): string {
  return sign(
    { sub: user.id, username: user.username, role: ADMIN_TOKEN_ROLE, dbRole: user.role },
    { expiresIn: ADMIN_TOKEN_LIFETIME },
  );
}

/**
 * Reads the admin user id from a verified token's payload.
 *
 * @param payload - `request.user` after `authenticateAdmin` has verified the token.
 * @returns The `sub` claim, or `null` where the payload carries none or an empty one.
 */
export function readAdminTokenSubject(payload: unknown): string | null {
  return (payload as { sub?: string } | undefined)?.sub || null;
}

/**
 * Shapes a stored admin user into the payload every admin route answers with.
 *
 * It copies the safe fields by inclusion, so a password hash, an invite token
 * hash or any column added later stays off the wire. A missing address becomes
 * an absent `email` rather than `null`, and both timestamps become ISO 8601.
 *
 * @param user - The admin user as the repository returns it.
 * @returns The user as {@link AdminUserResponse} describes it.
 */
export function buildAdminUserResponse(user: AdminUser): AdminUserResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? undefined,
    role: user.role as AdminRole,
    isOwner: user.role === AdminRole.Owner,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    sessionTimeoutMinutes: user.sessionTimeoutMinutes,
    createdAt: new Date(user.createdAt).toISOString(),
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
  };
}
