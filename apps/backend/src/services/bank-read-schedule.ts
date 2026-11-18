/**
 * @file How often the bank account may be read, and when the next background
 * read of it is due, ported from lmaa.space
 * (`apps/backend/src/services/bank-read-schedule.ts`).
 *
 * Apart from the read itself, because the answer is also what the dashboard
 * shows, and a status asking when the next read happens has no business
 * pulling in the ledger, the bank client and the mail to find out.
 */

import type { BankConnectionRecord } from "./bank-connection-store.js";
import { getReadTimesInWindow } from "./bank-read-store.js";

/**
 * How many background reads Article 36(5) of Commission Delegated Regulation
 * (EU) 2018/389 allows while the account holder is not asking: 4.
 */
export const BACKGROUND_READS_PER_WINDOW = 4;

/** The window that cap is measured over: 24 hours, sliding rather than per calendar day. */
export const READ_WINDOW_HOURS = 24;

/** Milliseconds in an hour. */
const HOUR_MS = 60 * 60 * 1000;

/** The same window in milliseconds, for working out when it lets one through. */
export const READ_WINDOW_MS = READ_WINDOW_HOURS * HOUR_MS;

/**
 * How many reads the owner's Read now may make in the same window: 60.
 *
 * Pressing it falls under Article 36(5)(a), where the account holder asks for
 * the information themselves and no cap applies. The number is not the
 * regulation; it is a guard against a stuck page pressing it in a loop.
 */
export const MANUAL_READS_PER_WINDOW = 60;

/** How many hours lie between two background reads: 6. */
const BACKGROUND_INTERVAL_HOURS = 6;

/**
 * How often the background run looks: every 6 hours.
 *
 * Six hours meets both readings of the four-per-24-hours cap at once, so the
 * time of day it starts at does not matter. The interval only decides how
 * often the question is asked; the cap comes from the stored reads.
 */
export const BACKGROUND_INTERVAL_MS = BACKGROUND_INTERVAL_HOURS * HOUR_MS;

/**
 * When the background run will next reach the bank.
 *
 * @param connection - The connection in force, or `null` where there is none.
 * @param now - The moment the question is asked.
 * @returns The time, `now` where the read is already due, and `null` where no
 *   background read is going to happen at all: with no connection in force,
 *   and once its consent has lapsed.
 *
 * @remarks
 * Two things have to let a read through, so the answer is the later of them.
 * The timer lets one through {@link BACKGROUND_INTERVAL_MS} after the last
 * one, and the budget lets one through once the window holds fewer than
 * {@link BACKGROUND_READS_PER_WINDOW}.
 *
 * The timer lives in a container and starts again with every deployment, so it
 * cannot be read here and the recorded reads answer in its place. A restart
 * brings the next tick forward rather than pushing it back, which makes this
 * the latest the next read is due rather than a promise about the minute.
 */
export async function nextBackgroundReadAt(connection: BankConnectionRecord | null, now: Date): Promise<Date | null> {
  if (!connection) return null;
  // The same condition the read itself stops on. A lapsed consent is not a read
  // that is merely late, it is one that is not coming.
  if (connection.consentValidUntil && connection.consentValidUntil.getTime() <= now.getTime()) return null;

  const reads = await getReadTimesInWindow("background", READ_WINDOW_HOURS, now);
  const newest = reads[0];
  const oldest = reads[reads.length - 1];
  const afterTimer = newest ? newest.getTime() + BACKGROUND_INTERVAL_MS : now.getTime();
  const afterBudget =
    reads.length >= BACKGROUND_READS_PER_WINDOW && oldest ? oldest.getTime() + READ_WINDOW_MS : now.getTime();

  // Never a moment already past. While the window has room the budget term is
  // `now`, and while it is full its oldest read leaves it in the future.
  return new Date(Math.max(afterTimer, afterBudget));
}
