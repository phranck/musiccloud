/**
 * @file The dashboard user as the backend sends it and the dashboard reads it:
 * the roles a dashboard user can hold, the check that tells a stored or
 * submitted value apart from them, and the wire shape of one user.
 */

/**
 * The roles a dashboard user can hold.
 *
 * - `Owner`: `"owner"`. Manages the other users, changes roles and reaches every
 *   area of the dashboard. The first user created through the setup form holds it.
 * - `Admin`: `"admin"`. Reaches the administration screens but not the user list
 *   or the owner-only controls. A new user gets it when the invite names no role.
 * - `Moderator`: `"moderator"`. Reaches neither the administration screens nor
 *   the owner-only controls.
 *
 * The backend's permission checks in `apps/backend/src/lib/admin-caller.ts` and
 * `apps/backend/src/routes/admin-users.ts`, and the dashboard's area guards in
 * `apps/dashboard/src/shared/constants/domain.ts`, all compare against these values.
 */
export const AdminRole = {
  Owner: "owner",
  Admin: "admin",
  Moderator: "moderator",
} as const;

/** One {@link AdminRole} member value. */
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

/** Every {@link AdminRole} value, which is what {@link isAdminRole} accepts. */
const ADMIN_ROLE_VALUES: readonly string[] = Object.values(AdminRole);

/**
 * Whether a value is one of the {@link AdminRole} values.
 *
 * The admin user routes run every submitted role through it before storing
 * one, so a row never holds a role that no permission check recognizes.
 *
 * @param value - Any value, typically a field of a request body.
 * @returns `true` when the value is the string `"owner"`, `"admin"` or
 *   `"moderator"`, and `false` for every other value, a different case included.
 */
export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && ADMIN_ROLE_VALUES.includes(value);
}

/**
 * One dashboard user as the admin routes send it: the login, invite-accept and
 * current-user answers, and every answer of the user management routes.
 *
 * It lists the safe fields by inclusion, so a password hash or an invite token
 * hash never reaches the wire. The name differs from the backend's `AdminUser`,
 * which is the database row.
 *
 * @property id - The user's id.
 * @property username - The name the user signs in with.
 * @property email - The user's address, or absent where none is on file.
 * @property role - The user's {@link AdminRole}.
 * @property isOwner - Whether `role` is {@link AdminRole} `Owner`.
 * @property firstName - The first name, or `null` where none is set.
 * @property lastName - The last name, or `null` where none is set.
 * @property avatarUrl - A `data:` image or a Gravatar address, or `null` where none is set.
 * @property sessionTimeoutMinutes - After how many minutes without input the
 *   dashboard signs the user out, or `null` where it never does.
 * @property createdAt - When the user was created, ISO 8601.
 * @property lastLoginAt - When the user last signed in, ISO 8601, or `null` before the first time.
 */
export interface AdminUserResponse {
  id: string;
  username: string;
  email?: string;
  role: AdminRole;
  isOwner: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  sessionTimeoutMinutes: number | null;
  createdAt: string;
  lastLoginAt: string | null;
}
