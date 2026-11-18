/**
 * @file The bank connection's rows: the connection in force with the ones it
 * replaced, and the authorizations started and not yet returned.
 *
 * Ported from lmaa.space (`apps/backend/src/repositories/bank-connections.ts`),
 * which writes through Drizzle's query builder. musiccloud's runtime services
 * write SQL through the shared `pg` pool, as `pending-sponsorships.ts` does,
 * and keep Drizzle for the schema and its migrations.
 */

import type { BankConsentNoticeStage } from "@musiccloud/shared";
import { nanoid } from "nanoid";
import { getDatabasePool, withDatabaseTransaction } from "../db/pool.js";
import { matchAuthorizationState } from "../lib/bank-authorization-state.js";

/** The columns every read of a connection selects. */
const CONNECTION_COLUMNS =
  "id, session_id, account_uid, aspsp_name, aspsp_country, consent_valid_until, revoked_at, consent_notice_stage, created_at";

/** The columns every read of an authorization selects. */
const AUTHORIZATION_COLUMNS = "state, authorization_id, created_at, expires_at";

/** One `bank_connections` row as `pg` returns it. */
interface ConnectionRow {
  id: string;
  session_id: string;
  account_uid: string;
  aspsp_name: string;
  aspsp_country: string;
  consent_valid_until: Date | null;
  revoked_at: Date | null;
  consent_notice_stage: BankConsentNoticeStage | null;
  created_at: Date;
}

/** One `bank_authorization_states` row as `pg` returns it. */
interface AuthorizationRow {
  state: string;
  authorization_id: string;
  created_at: Date;
  expires_at: Date;
}

/** A connection as the service works with it. */
export interface BankConnectionRecord {
  /** The row's identifier, a nanoid. */
  id: string;
  /** The session Enable Banking issued, which every read presents. Never logged and never served. */
  sessionId: string;
  /** The one account the session reaches, as the provider identifies it. Never logged and never served. */
  accountUid: string;
  /** The institution as the provider names it, empty where it named none. */
  aspspName: string;
  /** Its country in two letters, empty where none was named. */
  aspspCountry: string;
  /** When the consent lapses, as stated on creation, or `null` where nothing was stated. */
  consentValidUntil: Date | null;
  /** When this connection was replaced or withdrawn, `null` while it is live. */
  revokedAt: Date | null;
  /** The furthest warning about this consent already sent, `null` before the first. */
  consentNoticeStage: BankConsentNoticeStage | null;
  /** When it was made. */
  createdAt: Date;
}

/** What a new connection is stored with; everything else is set by the store or the database. */
export interface BankConnectionInput {
  /** The session Enable Banking issued. */
  sessionId: string;
  /** The one account it reaches. */
  accountUid: string;
  /** The institution as the provider names it. */
  aspspName: string;
  /** Its country in two letters. */
  aspspCountry: string;
  /** When the consent lapses, or `null` where the provider stated nothing. */
  consentValidUntil: Date | null;
}

/** An authorization as the service works with it. */
export interface BankAuthorizationRecord {
  /** The value the return has to carry back, 64 hex characters. */
  state: string;
  /** What Enable Banking called the authorization, empty where it named none. */
  authorizationId: string;
  /** When it was started. */
  createdAt: Date;
  /** After this it no longer counts. */
  expiresAt: Date;
}

/**
 * Turns a connection row into a record.
 *
 * @param row - The row as read.
 * @returns The record.
 */
function toConnection(row: ConnectionRow): BankConnectionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    accountUid: row.account_uid,
    aspspName: row.aspsp_name,
    aspspCountry: row.aspsp_country,
    consentValidUntil: row.consent_valid_until,
    revokedAt: row.revoked_at,
    consentNoticeStage: row.consent_notice_stage,
    createdAt: row.created_at,
  };
}

/**
 * Turns an authorization row into a record.
 *
 * @param row - The row as read.
 * @returns The record.
 */
function toAuthorization(row: AuthorizationRow): BankAuthorizationRecord {
  return {
    state: row.state,
    authorizationId: row.authorization_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Records an authorization this site has just started.
 *
 * @param state - The value the bank will hand back, as hex.
 * @param authorizationId - What Enable Banking called the authorization.
 * @param expiresAt - The moment after which a return no longer counts.
 * @param now - The moment before which an authorization has expired and goes.
 * @returns The row as the database holds it, read back rather than assumed.
 *
 * @remarks
 * Whatever has expired goes first. An authorization nobody completed leaves its
 * row behind, and this is the one place that is guaranteed to run again, so it
 * is where the table is swept rather than in a job of its own. A state that
 * collides with a stored one fails on the primary key rather than being
 * absorbed, though at 256 bits that is not a thing to plan for.
 */
export async function insertAuthorizationState(
  state: string,
  authorizationId: string,
  expiresAt: Date,
  now: Date,
): Promise<BankAuthorizationRecord> {
  return withDatabaseTransaction(async (client) => {
    await client.query("DELETE FROM bank_authorization_states WHERE expires_at < $1", [now]);
    const created = await client.query<AuthorizationRow>(
      `INSERT INTO bank_authorization_states (state, authorization_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING ${AUTHORIZATION_COLUMNS}`,
      [state, authorizationId, expiresAt],
    );
    return toAuthorization(created.rows[0] as AuthorizationRow);
  }, "bank_authorization_insert");
}

/**
 * Recognizes a returning authorization and spends it.
 *
 * @param presented - The value the bank handed back through the dashboard.
 * @param now - The moment to judge expiry against.
 * @returns The authorization that matched, or `null` when none did.
 *
 * @remarks
 * Every row is loaded and the match is made in `matchAuthorizationState`, which
 * decides both the comparison and the expiry. The query does not filter by
 * expiry, because two places deciding when an authorization has run out is two
 * answers to one question. The table holds an authorization only while one is
 * in flight, so loading all of them is cheap.
 *
 * The matched row is deleted in the same transaction that found it, and the
 * delete is what decides the answer. A second return carrying the same value
 * therefore finds nothing, including when both arrive at once.
 */
export async function takeAuthorizationState(presented: string, now: Date): Promise<BankAuthorizationRecord | null> {
  return withDatabaseTransaction(async (client) => {
    const stored = await client.query<AuthorizationRow>(
      `SELECT ${AUTHORIZATION_COLUMNS} FROM bank_authorization_states`,
    );
    const matched = matchAuthorizationState(stored.rows.map(toAuthorization), presented, now);
    if (!matched) return null;

    const removed = await client.query("DELETE FROM bank_authorization_states WHERE state = $1 RETURNING state", [
      matched.state,
    ]);
    return (removed.rowCount ?? 0) > 0 ? matched : null;
  }, "bank_authorization_take");
}

/**
 * The connection in force.
 *
 * @returns The live row, or `null` where every connection has been revoked.
 */
export async function getLiveBankConnection(): Promise<BankConnectionRecord | null> {
  const result = await getDatabasePool().query<ConnectionRow>(
    `SELECT ${CONNECTION_COLUMNS} FROM bank_connections
      WHERE revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  const row = result.rows[0];
  return row ? toConnection(row) : null;
}

/**
 * Puts a new connection in force and retires whatever was in force before.
 *
 * @param data - The session, the account and the institution behind it.
 * @param now - The moment the previous connection stopped being current.
 * @returns The stored row.
 *
 * @remarks
 * Both writes are one transaction, because the database allows a single live
 * row and the insert would otherwise be refused while the old one still counts
 * as live. The old row is marked revoked rather than deleted, so it stays
 * answerable since when which connection was in force.
 */
export async function replaceBankConnection(data: BankConnectionInput, now: Date): Promise<BankConnectionRecord> {
  return withDatabaseTransaction(async (client) => {
    await client.query("UPDATE bank_connections SET revoked_at = $1 WHERE revoked_at IS NULL", [now]);
    const created = await client.query<ConnectionRow>(
      `INSERT INTO bank_connections (id, session_id, account_uid, aspsp_name, aspsp_country, consent_valid_until)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CONNECTION_COLUMNS}`,
      [nanoid(), data.sessionId, data.accountUid, data.aspspName, data.aspspCountry, data.consentValidUntil],
    );
    return toConnection(created.rows[0] as ConnectionRow);
  }, "bank_connection_replace");
}

/**
 * Records the furthest warning that has gone out about this consent.
 *
 * @param id - The connection the warning was about.
 * @param stage - The rung reached.
 *
 * @remarks
 * Written after the warning was sent rather than before, so one that failed to
 * go out is tried again at the next check instead of being counted as said.
 */
export async function setConsentNoticeStage(id: string, stage: BankConsentNoticeStage): Promise<void> {
  await getDatabasePool().query("UPDATE bank_connections SET consent_notice_stage = $2 WHERE id = $1", [id, stage]);
}

/**
 * Retires the connection in force, leaving the site with none.
 *
 * @param now - The moment it stopped being current.
 * @returns The retired row, or `null` when none was in force. The caller needs
 *   the session it held, because closing that session at the provider is what
 *   ends the consent rather than merely forgetting it.
 */
export async function revokeLiveBankConnection(now: Date): Promise<BankConnectionRecord | null> {
  const result = await getDatabasePool().query<ConnectionRow>(
    `UPDATE bank_connections SET revoked_at = $1
      WHERE revoked_at IS NULL
      RETURNING ${CONNECTION_COLUMNS}`,
    [now],
  );
  const row = result.rows[0];
  return row ? toConnection(row) : null;
}
