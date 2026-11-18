/**
 * @file Tests for the read budget: claiming a read counts the reads of its
 * kind in the sliding window and refuses the one that would exceed it. The
 * transaction is replaced by a client that keeps the claimed rows in memory and
 * answers the store's two statements over them; the SQL itself runs against a
 * real database in `bank-import.integration.test.ts`.
 */
import type { BankReadKind } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** A claimed row as the in-memory client holds it. */
interface HeldRow {
  id: string;
  kind: BankReadKind;
  read_at: Date;
}

const held = vi.hoisted(() => ({ rows: [] as HeldRow[], statements: [] as string[] }));

/**
 * Answers the claim's statements over {@link held}: the lock, the count of one
 * kind after a moment, and the insert.
 *
 * @param sql - The statement.
 * @param params - Its parameters.
 */
async function query(sql: string, params: unknown[] = []) {
  held.statements.push(sql);
  if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}] };
  if (sql.includes("count(*)")) {
    const [kind, since] = params as [BankReadKind, Date];
    const count = held.rows.filter((row) => row.kind === kind && row.read_at > since).length;
    return { rows: [{ count }] };
  }
  if (sql.startsWith("INSERT INTO bank_account_reads")) {
    const [id, kind, readAt] = params as [string, BankReadKind, Date];
    const row = { id, kind, read_at: readAt };
    held.rows.push(row);
    return {
      rows: [
        {
          ...row,
          succeeded: false,
          booked_through: null,
          failure_reason: null,
          transactions_read: 0,
          imported: 0,
          filled: 0,
          skipped: 0,
        },
      ],
    };
  }
  throw new Error(`unexpected statement: ${sql}`);
}

vi.mock("../db/pool.js", () => ({
  getDatabasePool: () => ({ query }),
  withDatabaseTransaction: (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }),
}));

import { BACKGROUND_READS_PER_WINDOW, MANUAL_READS_PER_WINDOW, READ_WINDOW_HOURS } from "./bank-read-schedule.js";
import { claimBankRead } from "./bank-read-store.js";

/** The moment the first claim of every case is made at. */
const START = new Date("2026-09-12T00:00:00.000Z");

/** Milliseconds in an hour. */
const HOUR_MS = 60 * 60 * 1000;

/**
 * A moment some hours after {@link START}.
 *
 * @param hours - How many hours later.
 */
function hoursLater(hours: number): Date {
  return new Date(START.getTime() + hours * HOUR_MS);
}

/**
 * Claims a background read the way the worker does.
 *
 * @param now - The moment of the claim.
 */
function claimBackground(now: Date) {
  return claimBankRead("background", BACKGROUND_READS_PER_WINDOW, READ_WINDOW_HOURS, now);
}

describe("the read budget", () => {
  beforeEach(() => {
    held.rows = [];
    held.statements = [];
  });

  it("refuses a fifth background read inside 24 hours", async () => {
    for (const hours of [0, 6, 12, 18]) {
      expect(await claimBackground(hoursLater(hours))).not.toBeNull();
    }

    expect(await claimBackground(hoursLater(23))).toBeNull();
    expect(held.rows.filter((row) => row.kind === "background")).toHaveLength(BACKGROUND_READS_PER_WINDOW);
  });

  it("lets the next one through once the oldest read leaves the sliding window", async () => {
    for (const hours of [0, 1, 2, 3]) await claimBackground(hoursLater(hours));

    expect(await claimBackground(hoursLater(23))).toBeNull();
    expect(await claimBackground(hoursLater(24))).not.toBeNull();
  });

  it("keeps the owner's reads on a budget of their own, so pressing Read now never locks the background run out", async () => {
    for (const hours of [0, 6, 12, 18]) await claimBackground(hoursLater(hours));

    expect(await claimBankRead("manual", MANUAL_READS_PER_WINDOW, READ_WINDOW_HOURS, hoursLater(19))).not.toBeNull();

    held.rows = [];
    for (let index = 0; index < MANUAL_READS_PER_WINDOW; index++) {
      await claimBankRead("manual", MANUAL_READS_PER_WINDOW, READ_WINDOW_HOURS, hoursLater(0));
    }
    expect(await claimBankRead("manual", MANUAL_READS_PER_WINDOW, READ_WINDOW_HOURS, hoursLater(1))).toBeNull();
    expect(await claimBackground(hoursLater(1))).not.toBeNull();
  });

  it("takes the lock before it counts", async () => {
    await claimBackground(START);

    expect(held.statements[0]).toContain("pg_advisory_xact_lock");
  });
});
