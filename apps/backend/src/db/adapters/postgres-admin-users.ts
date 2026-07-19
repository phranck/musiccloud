/**
 * Admin user domain: CRUD for the `admin_users` table plus pending-invite
 * lifecycle (issue / list / accept).
 *
 * Scope:
 *   - Lookup by id or username for authentication.
 *   - Creation with optional invite-token, last-login bookkeeping.
 *   - Listing + count for the admin dashboard.
 *   - Partial updates (profile, role, session timeout).
 *   - Hard delete.
 *   - Pending-invite queries (token still present, not yet expired).
 *   - Accept-invite (set password, clear token).
 *
 * Excludes:
 *   - Admin-CRUD on catalog entities (tracks/albums/artists), which lives
 *     in `postgres-admin-catalog.ts`.
 *   - Content-page / nav admin operations (see
 *     `postgres-content-pages.ts`, `postgres-content-nav.ts`).
 *   - Admin-username lookup by id batch — that helper lives with content
 *     pages because page audit metadata is its only consumer (see
 *     `postgres-content-pages.ts`).
 */

import type { Pool } from "pg";
import type { AdminUser } from "../admin-repository.js";
import { dateToMs } from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/**
 * Raw shape returned by every `admin_users` SELECT / RETURNING in this
 * module. Kept module-private; consumers receive the mapped
 * {@link AdminUser} DTO.
 */
interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  invite_token_hash: string | null;
  invite_expires_at: Date | null;
  session_timeout_minutes: number | null;
  created_at: Date;
  last_login_at: Date | null;
}

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * Maps a raw `admin_users` row to the externally-facing {@link AdminUser}
 * DTO, including ms-since-epoch conversion of the timestamp columns.
 */
function rowToAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    email: row.email,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    sessionTimeoutMinutes: row.session_timeout_minutes,
    createdAt: dateToMs(row.created_at),
    lastLoginAt: row.last_login_at ? dateToMs(row.last_login_at) : null,
  };
}

// ============================================================================
// READ
// ============================================================================

/**
 * Looks up an admin user by primary key.
 *
 * @param pool - Postgres connection pool.
 * @param id - The admin user's UUID.
 * @returns The mapped user, or `null` if no row matches.
 */
export async function findAdminById(pool: Pool, id: string): Promise<AdminUser | null> {
  const result = await pool.query(
    `SELECT id, username, password_hash, email, role, first_name, last_name,
            avatar_url, invite_token_hash, invite_expires_at,
            session_timeout_minutes, created_at, last_login_at
     FROM admin_users WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) return null;
  return rowToAdminUser(result.rows[0] as AdminUserRow);
}

/**
 * Looks up an admin user by username (used during login).
 *
 * @param pool - Postgres connection pool.
 * @param username - Case-sensitive username; matched with `=` not ILIKE.
 * @returns The mapped user, or `null` if no row matches.
 */
export async function findAdminByUsername(pool: Pool, username: string): Promise<AdminUser | null> {
  const result = await pool.query(
    `SELECT id, username, password_hash, email, role, first_name, last_name,
            avatar_url, invite_token_hash, invite_expires_at,
            session_timeout_minutes, created_at, last_login_at
     FROM admin_users WHERE username = $1`,
    [username],
  );

  if (result.rows.length === 0) return null;
  return rowToAdminUser(result.rows[0] as AdminUserRow);
}

/**
 * Returns the total number of admin user rows.
 *
 * @param pool - Postgres connection pool.
 * @returns The row count (may be returned as a string by `pg`; callers
 *   should coerce when needed).
 */
export async function countAdmins(pool: Pool): Promise<number> {
  const result = await pool.query(`SELECT COUNT(*) as count FROM admin_users`);
  return result.rows[0]?.count ?? 0;
}

/**
 * Lists every admin user ordered by creation date (oldest first).
 *
 * @param pool - Postgres connection pool.
 * @returns All admin users, mapped to DTOs.
 */
export async function listAdminUsers(pool: Pool): Promise<AdminUser[]> {
  const result = await pool.query(
    `SELECT id, username, password_hash, email, role, first_name, last_name,
            avatar_url, invite_token_hash, invite_expires_at,
            session_timeout_minutes, created_at, last_login_at
     FROM admin_users
     ORDER BY created_at ASC`,
  );
  return result.rows.map((row) => rowToAdminUser(row as AdminUserRow));
}

/**
 * Lists invites that are still claimable: token hash present and
 * `invite_expires_at` strictly in the future.
 *
 * @param pool - Postgres connection pool.
 * @returns A list of invite descriptors. Email may be `null`. The token
 *   hash is included so the caller can re-issue the same invite link.
 */
export async function listPendingInvites(pool: Pool): Promise<
  Array<{
    id: string;
    username: string;
    email: string | null;
    inviteTokenHash: string;
    inviteExpiresAt: Date;
  }>
> {
  const result = await pool.query(
    `SELECT id, username, email, invite_token_hash, invite_expires_at
     FROM admin_users
     WHERE invite_token_hash IS NOT NULL AND invite_expires_at > NOW()`,
  );
  return result.rows.map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email ?? null,
    inviteTokenHash: r.invite_token_hash,
    inviteExpiresAt: r.invite_expires_at,
  }));
}

// ============================================================================
// WRITE
// ============================================================================

/**
 * Inserts a new admin user, optionally including an invite token hash and
 * expiry.
 *
 * @param pool - Postgres connection pool.
 * @param data - User payload. `email`, `role`, `inviteTokenHash`
 *   and `inviteExpiresAt` are optional.
 */
export async function createAdminUser(
  pool: Pool,
  data: {
    id: string;
    username: string;
    passwordHash: string;
    email?: string;
    role?: string;
    inviteTokenHash?: string;
    inviteExpiresAt?: Date;
  },
): Promise<void> {
  const now = new Date();

  await pool.query(
    `INSERT INTO admin_users (id, username, password_hash, email, role,
                              invite_token_hash, invite_expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.id,
      data.username,
      data.passwordHash,
      data.email ?? null,
      data.role ?? "admin",
      data.inviteTokenHash ?? null,
      data.inviteExpiresAt ?? null,
      now,
    ],
  );
}

/**
 * Stamps `last_login_at = NOW()` on the given user.
 *
 * @param pool - Postgres connection pool.
 * @param userId - The admin user's id.
 */
export async function updateLastLogin(pool: Pool, userId: string): Promise<void> {
  const now = new Date();
  await pool.query(`UPDATE admin_users SET last_login_at = $1 WHERE id = $2`, [now, userId]);
}

/**
 * Partially updates an admin user. Only keys present on `data` are written.
 *
 * @param pool - Postgres connection pool.
 * @param id - The admin user's id.
 * @param data - Subset of mutable user fields.
 * @returns The updated row, or `null` if `data` was empty (no UPDATE ran)
 *   or the row did not exist.
 */
export async function updateAdminUser(
  pool: Pool,
  id: string,
  data: Partial<{
    username: string;
    email: string;
    passwordHash: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    role: string;
    sessionTimeoutMinutes: number | null;
  }>,
): Promise<AdminUser | null> {
  const columnMap: Record<string, string> = {
    username: "username",
    email: "email",
    passwordHash: "password_hash",
    firstName: "first_name",
    lastName: "last_name",
    avatarUrl: "avatar_url",
    role: "role",
    sessionTimeoutMinutes: "session_timeout_minutes",
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(data)) {
    const column = columnMap[key];
    if (column) {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return null;

  values.push(id);
  const result = await pool.query(
    `UPDATE admin_users SET ${setClauses.join(", ")}
     WHERE id = $${paramIndex}
     RETURNING id, username, password_hash, email, role, first_name, last_name,
               avatar_url, invite_token_hash, invite_expires_at,
               session_timeout_minutes, created_at, last_login_at`,
    values,
  );

  if (result.rows.length === 0) return null;
  return rowToAdminUser(result.rows[0] as AdminUserRow);
}

/**
 * Hard-deletes an admin user. No cascade is configured at the schema
 * level for admin-authored rows (content_pages.created_by /
 * updated_by) — those FK columns become orphaned and are tolerated by
 * downstream queries via `LEFT JOIN`.
 *
 * @param pool - Postgres connection pool.
 * @param id - The admin user's id.
 */
export async function deleteAdminUser(pool: Pool, id: string): Promise<void> {
  await pool.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
}

/**
 * Accepts a pending invite: sets the password hash and clears the invite
 * token / expiry atomically.
 *
 * @remarks The WHERE clause re-checks `invite_token_hash IS NOT NULL` and
 *   `invite_expires_at > NOW()` so a concurrent accept attempt or an
 *   already-expired invite returns `null` instead of silently overwriting
 *   the password.
 *
 * @param pool - Postgres connection pool.
 * @param id - The admin user's id.
 * @param passwordHash - The new password hash.
 * @returns The user with cleared invite fields, or `null` if no
 *   claimable invite was found for that id.
 */
export async function acceptInvite(pool: Pool, id: string, passwordHash: string): Promise<AdminUser | null> {
  const result = await pool.query(
    `UPDATE admin_users
     SET password_hash = $1,
         invite_token_hash = NULL,
         invite_expires_at = NULL
     WHERE id = $2 AND invite_token_hash IS NOT NULL AND invite_expires_at > NOW()
     RETURNING id, username, password_hash, email, role, first_name, last_name,
               avatar_url, invite_token_hash, invite_expires_at,
               session_timeout_minutes, created_at, last_login_at`,
    [passwordHash, id],
  );
  if (result.rows.length === 0) return null;
  return rowToAdminUser(result.rows[0] as AdminUserRow);
}
