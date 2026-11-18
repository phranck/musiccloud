/**
 * @file The reads of the bank account: claiming one inside its budget,
 * recording how it ended, and answering when the account was last read.
 *
 * Ported from lmaa.space (`apps/backend/src/repositories/bank-reads.ts`), which
 * writes through Drizzle's query builder. musiccloud's runtime services write
 * SQL through the shared `pg` pool, as `bank-connection-store.ts` does, and keep
 * Drizzle for the schema and its migrations. A row holds counts and the day a
 * read reached, and nothing about any entry it saw.
 */

import type { BankErrorCodeValue, BankReadKind } from "@musiccloud/shared";
import { nanoid } from "nanoid";
import { getDatabasePool, withDatabaseTransaction } from "../db/pool.js";

/**
 * The name the advisory lock that serializes claiming a read is taken under.
 *
 * Fixed rather than derived: a changed name would stop excluding a container
 * still running the previous build. It guards the claim alone, which is one
 * short transaction, so nothing is held while the bank is being asked.
 */
const BANK_READ_CLAIM_LOCK = "musiccloud-bank-read-claim-v1";

/** Milliseconds in an hour, which the read window is stated in. */
const HOUR_MS = 60 * 60 * 1000;

/** The columns every read of a row selects. */
const READ_COLUMNS =
  "id, kind, read_at, succeeded, booked_through, failure_reason, transactions_read, imported, filled, skipped";

/** One `bank_account_reads` row as `pg` returns it. */
interface ReadRow {
  id: string;
  kind: BankReadKind;
  read_at: Date;
  succeeded: boolean;
  booked_through: string | null;
  failure_reason: BankErrorCodeValue | null;
  transactions_read: number;
  imported: number;
  filled: number;
  skipped: number;
}

/** A read as the import and the status work with it. */
export interface BankReadRecord {
  /** The row's identifier, a nanoid. */
  id: string;
  /** Which budget it drew on. */
  kind: BankReadKind;
  /** When it was claimed, which is the moment the budget counts. */
  readAt: Date;
  /** Whether it finished; `false` while in flight and once it failed. */
  succeeded: boolean;
  /** The last day a finished read covered, `YYYY-MM-DD`, or `null` while in flight and after a failure. */
  bookedThrough: string | null;
  /** The code a failed read broke off with, or `null`. */
  failureReason: BankErrorCodeValue | null;
  /** How many entries came back, before anything was decided about them. */
  transactionsRead: number;
  /** How many became a row in the ledger. */
  imported: number;
  /** How many stood in the ledger already and were completed from the entry. */
  filled: number;
  /** How many stood in the ledger already and had nothing to add. */
  skipped: number;
}

/** What a finished read reports about itself. */
export interface BankReadOutcome {
  /**
   * The last day it covered, `YYYY-MM-DD`.
   *
   * A record of what happened rather than a cursor. A read reaches a fixed
   * window back from today, so this decides only whether a read has ever
   * finished, which tells the first read from every one after it.
   */
  bookedThrough: string;
  /** How many entries came back. */
  transactionsRead: number;
  /** How many became a row in the ledger. */
  imported: number;
  /** How many stood there already and were completed from the entry. */
  filled: number;
  /** How many were recognized and already stood there unchanged. */
  skipped: number;
}

/**
 * Turns a row into a record.
 *
 * @param row - The row as read.
 * @returns The record.
 */
function toRead(row: ReadRow): BankReadRecord {
  return {
    id: row.id,
    kind: row.kind,
    readAt: row.read_at,
    succeeded: row.succeeded,
    bookedThrough: row.booked_through,
    failureReason: row.failure_reason,
    transactionsRead: row.transactions_read,
    imported: row.imported,
    filled: row.filled,
    skipped: row.skipped,
  };
}

/**
 * The start of a window that ends now.
 *
 * @param windowHours - How long the window is.
 * @param now - The moment it ends at.
 * @returns The moment it starts at.
 */
function windowStart(windowHours: number, now: Date): Date {
  return new Date(now.getTime() - windowHours * HOUR_MS);
}

/**
 * Claims one read, or refuses because the budget for the window is spent.
 *
 * @param kind - Which budget to draw on.
 * @param maxReads - How many reads of that kind the window allows.
 * @param windowHours - How long the window is, counted back from `now`.
 * @param now - The moment the claim is made, which the window ends at. Defaults to now.
 * @returns The claimed row, or `null` when the budget is spent.
 *
 * @remarks
 * Counting and claiming happen inside one transaction behind an advisory lock,
 * so two containers cannot both take the last slot after both counted the same
 * number. The window slides rather than resetting at midnight, which is what
 * Article 36(5) of Commission Delegated Regulation (EU) 2018/389 says: counting
 * per calendar day would permit four at 23:00 and four more at 01:00. The row
 * is read back through `RETURNING` rather than assumed.
 */
export async function claimBankRead(
  kind: BankReadKind,
  maxReads: number,
  windowHours: number,
  now: Date = new Date(),
): Promise<BankReadRecord | null> {
  return withDatabaseTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [BANK_READ_CLAIM_LOCK]);

    const used = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM bank_account_reads WHERE kind = $1 AND read_at > $2",
      [kind, windowStart(windowHours, now)],
    );
    if ((used.rows[0]?.count ?? 0) >= maxReads) return null;

    const claimed = await client.query<ReadRow>(
      `INSERT INTO bank_account_reads (id, kind, read_at) VALUES ($1, $2, $3) RETURNING ${READ_COLUMNS}`,
      [nanoid(), kind, now],
    );
    return toRead(claimed.rows[0] as ReadRow);
  }, "bank_read_claim");
}

/**
 * The last day any finished read covered.
 *
 * @returns The day as `YYYY-MM-DD`, or `null` when nothing has finished yet.
 *
 * @remarks
 * Only successful reads count. One that broke off says nothing about what has
 * been seen, and treating it as finished would step over the days it never
 * reached.
 */
export async function getLastBookedThrough(): Promise<string | null> {
  const result = await getDatabasePool().query<{ booked_through: string }>(
    `SELECT booked_through FROM bank_account_reads
      WHERE succeeded AND booked_through IS NOT NULL
      ORDER BY booked_through DESC
      LIMIT 1`,
  );
  return result.rows[0]?.booked_through ?? null;
}

/**
 * Records that a claimed read finished, and what it found.
 *
 * @param id - The row {@link claimBankRead} handed back.
 * @param outcome - The counts and the day reached.
 */
export async function completeBankRead(id: string, outcome: BankReadOutcome): Promise<void> {
  await getDatabasePool().query(
    `UPDATE bank_account_reads
        SET succeeded = true, booked_through = $2, transactions_read = $3, imported = $4, filled = $5, skipped = $6
      WHERE id = $1`,
    [id, outcome.bookedThrough, outcome.transactionsRead, outcome.imported, outcome.filled, outcome.skipped],
  );
}

/**
 * Records that a claimed read failed, and why.
 *
 * @param id - The row {@link claimBankRead} handed back.
 * @param reason - The `MC-BANK-*` code the read broke off with, which the dashboard maps to its own text.
 *
 * @remarks
 * Written where the read catches the failure rather than left to the row's
 * defaults. A read that only says it failed leaves the owner with a card that
 * reports a failure and no way to act on it, while the reason sits in a log
 * they cannot reach. `booked_through` stays `NULL`, because a read that did
 * not finish says nothing about what has been seen.
 */
export async function failBankRead(id: string, reason: BankErrorCodeValue): Promise<void> {
  await getDatabasePool().query("UPDATE bank_account_reads SET succeeded = false, failure_reason = $2 WHERE id = $1", [
    id,
    reason,
  ]);
}

/**
 * The most recent read of either kind, whatever became of it.
 *
 * @returns The read, or `null` before the first one.
 */
export async function getLastBankRead(): Promise<BankReadRecord | null> {
  const result = await getDatabasePool().query<ReadRow>(
    `SELECT ${READ_COLUMNS} FROM bank_account_reads ORDER BY read_at DESC, id DESC LIMIT 1`,
  );
  const row = result.rows[0];
  return row ? toRead(row) : null;
}

/**
 * When each read of one kind inside the window happened, newest first.
 *
 * @param kind - Which budget the reads draw on.
 * @param windowHours - How long the window is, counted back from `now`.
 * @param now - The moment the window ends at. Defaults to now.
 * @returns The times, newest first, empty where the window holds none.
 *
 * @remarks
 * The same set {@link claimBankRead} counts, read rather than claimed. It says
 * when the budget next has room: while the window is full, nothing can be
 * claimed until its oldest read leaves it.
 */
export async function getReadTimesInWindow(
  kind: BankReadKind,
  windowHours: number,
  now: Date = new Date(),
): Promise<Date[]> {
  const result = await getDatabasePool().query<{ read_at: Date }>(
    "SELECT read_at FROM bank_account_reads WHERE kind = $1 AND read_at > $2 ORDER BY read_at DESC",
    [kind, windowStart(windowHours, now)],
  );
  return result.rows.map((row) => row.read_at);
}
