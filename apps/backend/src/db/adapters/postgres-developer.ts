/**
 * Developer-account domain: persistence for the developer.musiccloud.io
 * self-service auth system (MC-064). Owns three tables —
 * `developer_accounts`, `developer_identities` and
 * `developer_email_tokens` — kept entirely separate from `admin_users`.
 *
 * Scope:
 *   - Account create / lookup (by id, by email).
 *   - Email-verification and last-login bookkeeping.
 *   - Password set (reset flow).
 *   - Auth-identity create / lookup (email today, GitHub via MC-065).
 *   - Single-use email-token create / find-active / consume.
 *
 * New ids are nanoid-generated here so callers receive a fully formed DTO.
 * Timestamp columns are mapped to epoch milliseconds via {@link dateToMs}.
 */

import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type { DeveloperAccount, DeveloperEmailToken, DeveloperIdentity } from "../developer-repository.js";
import { dateToMs } from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/**
 * Raw shape returned by every `developer_accounts` SELECT / RETURNING in
 * this module. Kept module-private; consumers receive the mapped
 * {@link DeveloperAccount} DTO.
 */
interface DeveloperAccountRow {
  id: string;
  email: string;
  email_verified_at: Date | null;
  password_hash: string | null;
  display_name: string | null;
  avatar_url: string | null;
  tier_id: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

/**
 * Raw shape returned by every `developer_identities` SELECT / RETURNING in
 * this module. Kept module-private; consumers receive the mapped
 * {@link DeveloperIdentity} DTO.
 */
interface DeveloperIdentityRow {
  id: string;
  account_id: string;
  provider: string;
  provider_user_id: string | null;
  created_at: Date;
}

/**
 * Raw shape returned by every `developer_email_tokens` SELECT / RETURNING in
 * this module. Kept module-private; consumers receive the mapped
 * {@link DeveloperEmailToken} DTO.
 */
interface DeveloperEmailTokenRow {
  id: string;
  account_id: string;
  purpose: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

const DEVELOPER_ACCOUNT_COLUMNS = `id, email, email_verified_at, password_hash, display_name,
            avatar_url, tier_id, status, created_at, updated_at, last_login_at`;

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * Maps a raw `developer_accounts` row to the externally-facing
 * {@link DeveloperAccount} DTO, converting timestamp columns to
 * ms-since-epoch.
 */
function rowToDeveloperAccount(row: DeveloperAccountRow): DeveloperAccount {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.email_verified_at ? dateToMs(row.email_verified_at) : null,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    tierId: row.tier_id,
    status: row.status,
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
    lastLoginAt: row.last_login_at ? dateToMs(row.last_login_at) : null,
  };
}

/**
 * Maps a raw `developer_identities` row to the externally-facing
 * {@link DeveloperIdentity} DTO.
 */
function rowToDeveloperIdentity(row: DeveloperIdentityRow): DeveloperIdentity {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    createdAt: dateToMs(row.created_at),
  };
}

/**
 * Maps a raw `developer_email_tokens` row to the externally-facing
 * {@link DeveloperEmailToken} DTO, converting timestamp columns to
 * ms-since-epoch.
 */
function rowToDeveloperEmailToken(row: DeveloperEmailTokenRow): DeveloperEmailToken {
  return {
    id: row.id,
    accountId: row.account_id,
    purpose: row.purpose,
    tokenHash: row.token_hash,
    expiresAt: dateToMs(row.expires_at),
    consumedAt: row.consumed_at ? dateToMs(row.consumed_at) : null,
    createdAt: dateToMs(row.created_at),
  };
}

// ============================================================================
// ACCOUNTS — READ
// ============================================================================

/**
 * Lists all developer accounts ordered by creation time (newest first), with
 * the count of active API clients each account owns and the assigned tier's
 * display fields (name + enabled) for the dashboard overview.
 *
 * @param pool - Postgres connection pool.
 * @returns Array of account DTOs, each extended with `clientCount`,
 *   `appName`, `tierName` and `tierEnabled` (the latter two `null` when no
 *   tier is assigned).
 */
export async function listDeveloperAccounts(pool: Pool): Promise<
  (DeveloperAccount & {
    clientCount: number;
    appName: string | null;
    tierName: string | null;
    tierEnabled: boolean | null;
  })[]
> {
  const result = await pool.query(
    `SELECT da.*, COUNT(ac.id)::int AS client_count,
            (SELECT ac2.app_name FROM api_clients ac2
             WHERE ac2.developer_account_id = da.id
             ORDER BY ac2.created_at DESC LIMIT 1) AS app_name,
            t.name AS tier_name, t.enabled AS tier_enabled
     FROM developer_accounts da
     LEFT JOIN api_clients ac ON ac.developer_account_id = da.id
     LEFT JOIN tiers t ON t.id = da.tier_id
     GROUP BY da.id, t.name, t.enabled
     ORDER BY da.created_at DESC`,
  );
  return result.rows.map((row) => {
    const r = row as DeveloperAccountRow & {
      client_count: number;
      app_name: string | null;
      tier_name: string | null;
      tier_enabled: boolean | null;
    };
    return {
      ...rowToDeveloperAccount(r),
      clientCount: r.client_count,
      appName: r.app_name,
      tierName: r.tier_name,
      tierEnabled: r.tier_enabled,
    };
  });
}

/**
 * Looks up a developer account by primary key.
 *
 * @param pool - Postgres connection pool.
 * @param id - The account id.
 * @returns The mapped account, or `null` if no row matches.
 */
export async function findDeveloperAccountById(pool: Pool, id: string): Promise<DeveloperAccount | null> {
  const result = await pool.query(`SELECT ${DEVELOPER_ACCOUNT_COLUMNS} FROM developer_accounts WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToDeveloperAccount(result.rows[0] as DeveloperAccountRow);
}

/**
 * Looks up a developer account by email (used during login and signup
 * collision checks).
 *
 * @param pool - Postgres connection pool.
 * @param email - Login email; matched with `=` (case-sensitive).
 * @returns The mapped account, or `null` if no row matches.
 */
export async function findDeveloperAccountByEmail(pool: Pool, email: string): Promise<DeveloperAccount | null> {
  const result = await pool.query(`SELECT ${DEVELOPER_ACCOUNT_COLUMNS} FROM developer_accounts WHERE email = $1`, [
    email,
  ]);
  if (result.rows.length === 0) return null;
  return rowToDeveloperAccount(result.rows[0] as DeveloperAccountRow);
}

// ============================================================================
// ACCOUNTS — WRITE
// ============================================================================

/**
 * Inserts a new (unverified) developer account with a nanoid id. `status`
 * falls back to the column default (`'active'`); `tier_id`,
 * `email_verified_at` and `last_login_at` start `null`.
 *
 * @param pool - Postgres connection pool.
 * @param data - Account payload. `passwordHash`, `displayName` and
 *   `avatarUrl` are optional.
 * @returns The freshly created account DTO.
 */
export async function createDeveloperAccount(
  pool: Pool,
  data: {
    email: string;
    passwordHash?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  },
): Promise<DeveloperAccount> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO developer_accounts (id, email, password_hash, display_name, avatar_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING ${DEVELOPER_ACCOUNT_COLUMNS}`,
    [nanoid(), data.email, data.passwordHash ?? null, data.displayName ?? null, data.avatarUrl ?? null, now],
  );
  return rowToDeveloperAccount(result.rows[0] as DeveloperAccountRow);
}

/**
 * Stamps `email_verified_at = NOW()` and bumps `updated_at` on the given
 * account.
 *
 * @param pool - Postgres connection pool.
 * @param id - The account id.
 * @returns The updated account, or `null` if no row matches.
 */
export async function markDeveloperEmailVerified(pool: Pool, id: string): Promise<DeveloperAccount | null> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE developer_accounts SET email_verified_at = $1, updated_at = $1
     WHERE id = $2
     RETURNING ${DEVELOPER_ACCOUNT_COLUMNS}`,
    [now, id],
  );
  if (result.rows.length === 0) return null;
  return rowToDeveloperAccount(result.rows[0] as DeveloperAccountRow);
}

/**
 * Stamps `last_login_at = NOW()` and bumps `updated_at` on the given
 * account.
 *
 * @param pool - Postgres connection pool.
 * @param id - The account id.
 */
export async function updateDeveloperLastLogin(pool: Pool, id: string): Promise<void> {
  const now = new Date();
  await pool.query(`UPDATE developer_accounts SET last_login_at = $1, updated_at = $1 WHERE id = $2`, [now, id]);
}

/**
 * Sets the account's password hash and bumps `updated_at` (password-reset
 * flow).
 *
 * @param pool - Postgres connection pool.
 * @param id - The account id.
 * @param passwordHash - The new bcrypt hash.
 * @returns The updated account, or `null` if no row matches.
 */
export async function setDeveloperPassword(
  pool: Pool,
  id: string,
  passwordHash: string,
): Promise<DeveloperAccount | null> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE developer_accounts SET password_hash = $1, updated_at = $2
     WHERE id = $3
     RETURNING ${DEVELOPER_ACCOUNT_COLUMNS}`,
    [passwordHash, now, id],
  );
  if (result.rows.length === 0) return null;
  return rowToDeveloperAccount(result.rows[0] as DeveloperAccountRow);
}

/**
 * Clears the account's password by setting `password_hash = NULL` and bumps
 * `updated_at`. Used when GitHub OAuth links to a still-unverified account, to
 * discard a password whose ownership GitHub now supersedes.
 *
 * @param pool - Postgres connection pool.
 * @param id - The account id.
 */
export async function clearDeveloperPassword(pool: Pool, id: string): Promise<void> {
  const now = new Date();
  await pool.query(`UPDATE developer_accounts SET password_hash = NULL, updated_at = $1 WHERE id = $2`, [now, id]);
}

/**
 * Updates mutable fields on a developer account and bumps `updated_at`.
 * Only the provided fields are changed; omitted/undefined fields stay as-is.
 *
 * @param pool - Postgres connection pool.
 * @param id - The account id.
 * @param data - Fields to update. `email`, `displayName`, `tierId` and
 *   `status` are all optional; `tierId: null` removes the assignment.
 * @returns The updated account, or `null` if no row matches.
 */
export async function updateDeveloperAccount(
  pool: Pool,
  id: string,
  data: {
    email?: string;
    displayName?: string | null;
    tierId?: string | null;
    status?: string;
  },
): Promise<DeveloperAccount | null> {
  const now = new Date();
  const sets: string[] = ["updated_at = $1"];
  const values: unknown[] = [now];
  let paramIdx = 2;

  if (data.email !== undefined) {
    sets.push(`email = $${paramIdx++}`);
    values.push(data.email);
  }
  if (data.displayName !== undefined) {
    sets.push(`display_name = $${paramIdx++}`);
    values.push(data.displayName);
  }
  if (data.tierId !== undefined) {
    sets.push(`tier_id = $${paramIdx++}`);
    values.push(data.tierId);
  }
  if (data.status !== undefined) {
    sets.push(`status = $${paramIdx++}`);
    values.push(data.status);
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE developer_accounts SET ${sets.join(", ")} WHERE id = $${paramIdx}
     RETURNING ${DEVELOPER_ACCOUNT_COLUMNS}`,
    values,
  );
  if (result.rows.length === 0) return null;
  return rowToDeveloperAccount(result.rows[0] as DeveloperAccountRow);
}

/**
 * Permanently deletes a developer account by primary key. `developer_accounts`
 * is the FK root for `developer_identities`, `developer_email_tokens`,
 * `api_access_requests` and `api_clients` (each `ON DELETE CASCADE`, see
 * `schemas/postgres.ts`), so this single `DELETE` removes the account's
 * entire footprint without any additional queries.
 *
 * @param pool - Postgres connection pool.
 * @param id - The account id.
 * @returns `true` if a row was deleted, `false` if no account matched `id`.
 */
export async function deleteDeveloperAccount(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM developer_accounts WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// IDENTITIES
// ============================================================================

/**
 * Inserts an authentication identity for an account, with a nanoid id.
 *
 * @param pool - Postgres connection pool.
 * @param data - Identity payload. `providerUserId` is `null` for the
 *   built-in email provider.
 * @returns The freshly created identity DTO.
 */
export async function createDeveloperIdentity(
  pool: Pool,
  data: {
    accountId: string;
    provider: string;
    providerUserId?: string | null;
  },
): Promise<DeveloperIdentity> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO developer_identities (id, account_id, provider, provider_user_id, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, account_id, provider, provider_user_id, created_at`,
    [nanoid(), data.accountId, data.provider, data.providerUserId ?? null, now],
  );
  return rowToDeveloperIdentity(result.rows[0] as DeveloperIdentityRow);
}

/**
 * Looks up an identity by `(provider, provider_user_id)` — the lookup used
 * during OAuth sign-in to resolve the linked account.
 *
 * @param pool - Postgres connection pool.
 * @param provider - `"email"` or `"github"`.
 * @param providerUserId - External provider user id.
 * @returns The mapped identity, or `null` if no row matches.
 */
export async function findDeveloperIdentity(
  pool: Pool,
  provider: string,
  providerUserId: string,
): Promise<DeveloperIdentity | null> {
  const result = await pool.query(
    `SELECT id, account_id, provider, provider_user_id, created_at
     FROM developer_identities
     WHERE provider = $1 AND provider_user_id = $2`,
    [provider, providerUserId],
  );
  if (result.rows.length === 0) return null;
  return rowToDeveloperIdentity(result.rows[0] as DeveloperIdentityRow);
}

/**
 * Lists every auth identity linked to an account, oldest first — part of the
 * GDPR export package (MC-085).
 *
 * @param pool - Postgres connection pool.
 * @param accountId - The developer account's id.
 */
export async function listDeveloperIdentitiesByAccount(pool: Pool, accountId: string): Promise<DeveloperIdentity[]> {
  const result = await pool.query(
    `SELECT id, account_id, provider, provider_user_id, created_at
     FROM developer_identities
     WHERE account_id = $1
     ORDER BY created_at ASC`,
    [accountId],
  );
  return result.rows.map(rowToDeveloperIdentity);
}

// ============================================================================
// EMAIL TOKENS
// ============================================================================

/**
 * Inserts a single-use email token (hashed by the caller) with a nanoid id.
 * `consumed_at` starts `null`.
 *
 * @param pool - Postgres connection pool.
 * @param data - Token payload. `expiresAt` is a `Date`.
 * @returns The freshly created token DTO.
 */
export async function createDeveloperEmailToken(
  pool: Pool,
  data: {
    accountId: string;
    purpose: string;
    tokenHash: string;
    expiresAt: Date;
  },
): Promise<DeveloperEmailToken> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO developer_email_tokens (id, account_id, purpose, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, account_id, purpose, token_hash, expires_at, consumed_at, created_at`,
    [nanoid(), data.accountId, data.purpose, data.tokenHash, data.expiresAt, now],
  );
  return rowToDeveloperEmailToken(result.rows[0] as DeveloperEmailTokenRow);
}

/**
 * Finds a still-claimable email token: matching `(token_hash, purpose)`,
 * not yet consumed and not yet expired.
 *
 * @param pool - Postgres connection pool.
 * @param tokenHash - Hex-encoded SHA-256 of the raw token.
 * @param purpose - `"verify"` or `"reset"`.
 * @returns The mapped token, or `null` if none is claimable.
 */
export async function findActiveDeveloperEmailToken(
  pool: Pool,
  tokenHash: string,
  purpose: string,
): Promise<DeveloperEmailToken | null> {
  const result = await pool.query(
    `SELECT id, account_id, purpose, token_hash, expires_at, consumed_at, created_at
     FROM developer_email_tokens
     WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > NOW()`,
    [tokenHash, purpose],
  );
  if (result.rows.length === 0) return null;
  return rowToDeveloperEmailToken(result.rows[0] as DeveloperEmailTokenRow);
}

/**
 * Marks a token consumed by stamping `consumed_at = NOW()`.
 *
 * @remarks The WHERE clause re-checks `consumed_at IS NULL` so a concurrent
 *   consume of the same token returns `false` instead of double-spending it.
 *
 * @param pool - Postgres connection pool.
 * @param id - The token id.
 * @returns `true` if this call consumed the token, `false` if it was
 *   already consumed or does not exist.
 */
export async function consumeDeveloperEmailToken(pool: Pool, id: string): Promise<boolean> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE developer_email_tokens SET consumed_at = $1
     WHERE id = $2 AND consumed_at IS NULL`,
    [now, id],
  );
  return (result.rowCount ?? 0) > 0;
}
