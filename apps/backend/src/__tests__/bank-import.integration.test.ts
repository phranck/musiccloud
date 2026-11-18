import { DonationProvider } from "@musiccloud/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, getDatabasePool } from "../db/pool.js";
import {
  claimBankRead,
  completeBankRead,
  failBankRead,
  getLastBankRead,
  getLastBookedThrough,
  getReadTimesInWindow,
} from "../services/bank-read-store.js";
import { fillDonationPayerName, insertDonation } from "../services/donations.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

/** PostgreSQL's SQLSTATE for a unique violation. */
const PG_UNIQUE_VIOLATION = "23505";

/** PostgreSQL's SQLSTATE for a check constraint violation. */
const PG_CHECK_VIOLATION = "23514";

/** How long the read window is in these cases: 24 hours. */
const WINDOW_HOURS = 24;

/** Milliseconds in an hour. */
const HOUR_MS = 60 * 60 * 1000;

/**
 * Runs the bank import's SQL against the Postgres `TEST_DATABASE_URL` names:
 * the read budget, the record of a read, and the ledger key that keeps one
 * entry from being booked twice.
 *
 * Claiming a read counts every read of its kind in the window, which is what
 * it is for, so the read cases run only against a `bank_account_reads` that
 * holds no row the suite did not create; it looks once before the first case
 * and skips them otherwise. They also claim at moments in 1990, far from any
 * real read. Every read and donation of the run is removed by its own key
 * afterwards.
 */
describe.skipIf(!integrationDatabaseUrl())("bank import (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const MARKER = `integration-bank-import-${Date.now()}`;
  const createdReadIds: string[] = [];
  let client: pg.Client;
  let holdsForeignReads = true;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
    const counts = await client.query<{ reads: string }>("SELECT count(*) AS reads FROM bank_account_reads");
    holdsForeignReads = Number(counts.rows[0]?.reads) > 0;
  });

  afterAll(async () => {
    await client.query("DELETE FROM bank_account_reads WHERE id = ANY($1::text[])", [createdReadIds]);
    await client.query("DELETE FROM donations WHERE external_ref LIKE $1", [`sepa:${MARKER}%`]);
    await client.end();
    await closeDatabasePool();
  });

  /**
   * A moment in 1990, some hours after the run's start of time.
   *
   * @param hours - How many hours later.
   */
  function at(hours: number): Date {
    return new Date(Date.UTC(1990, 0, 1) + hours * HOUR_MS);
  }

  /**
   * Claims a read of the run and remembers it for the clean-up.
   *
   * @param kind - Which budget it draws on.
   * @param maxReads - What the window allows.
   * @param now - The moment of the claim.
   */
  async function claim(kind: "background" | "manual", maxReads: number, now: Date) {
    const claimed = await claimBankRead(kind, maxReads, WINDOW_HOURS, now);
    if (claimed) createdReadIds.push(claimed.id);
    return claimed;
  }

  it("refuses a fifth background read inside 24 hours, and keeps the owner's budget apart", async ({ skip }) => {
    if (holdsForeignReads) skip();

    for (const hours of [0, 6, 12, 18]) {
      expect(await claim("background", 4, at(hours))).not.toBeNull();
    }
    expect(await claim("background", 4, at(23))).toBeNull();
    expect(await claim("manual", 60, at(23))).not.toBeNull();
    expect(await claim("background", 4, at(24))).not.toBeNull();

    expect((await getReadTimesInWindow("background", WINDOW_HOURS, at(24))).map((time) => time.getTime())).toEqual(
      [at(24), at(18), at(12), at(6)].map((time) => time.getTime()),
    );
  });

  it("lets two reads claimed at once never both take the last slot", async ({ skip }) => {
    if (holdsForeignReads) skip();

    const claims = await Promise.all(Array.from({ length: 6 }, () => claim("background", 4, at(1_000))));

    expect(claims.filter(Boolean)).toHaveLength(4);
  });

  it("records a finished read as the cursor and a failed one with its code alone", async ({ skip }) => {
    if (holdsForeignReads) skip();

    const finished = await claim("manual", 60, at(2_000));
    const failed = await claim("manual", 60, at(2_001));
    if (!finished || !failed) throw new Error("claim refused");

    await completeBankRead(finished.id, {
      bookedThrough: "1990-03-25",
      transactionsRead: 7,
      imported: 2,
      filled: 1,
      skipped: 3,
    });
    await failBankRead(failed.id, "MC-BANK-0003");

    expect(await getLastBookedThrough()).toBe("1990-03-25");
    expect(await getLastBankRead()).toMatchObject({
      id: failed.id,
      succeeded: false,
      failureReason: "MC-BANK-0003",
      bookedThrough: null,
    });
  });

  it("refuses a read of a kind that is not one", async () => {
    const id = `${MARKER}-kind`;
    createdReadIds.push(id);

    await expect(
      client.query("INSERT INTO bank_account_reads (id, kind) VALUES ($1, 'nightly')", [id]),
    ).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
  });

  /**
   * Books a payment of the run under a ledger key.
   *
   * @param key - Tells this entry apart.
   * @param name - The payer's name, empty for one the statement did not name.
   */
  function book(key: string, name: string) {
    return insertDonation(
      getDatabasePool(),
      {
        name,
        published: false,
        amountCents: 2_500,
        receivedOn: "1990-03-01",
        provider: DonationProvider.BankTransfer,
        note: "",
        sponsorId: null,
      },
      `sepa:${MARKER}-${key}`,
    );
  }

  it("refuses the same entry a second time with the index the import recognizes", async () => {
    expect((await book("twice", "")).externalRef).toBe(`sepa:${MARKER}-twice`);

    await expect(book("twice", "")).rejects.toMatchObject({
      code: PG_UNIQUE_VIOLATION,
      constraint: "uq_donations_external_ref",
    });
  });

  it("completes a stored payment's missing name once, and leaves a name somebody gave alone", async () => {
    await book("unnamed", "");
    await book("named", "Typed by hand");

    expect(await fillDonationPayerName(`sepa:${MARKER}-unnamed`, "Anna von Trapp")).toBe(true);
    expect(await fillDonationPayerName(`sepa:${MARKER}-unnamed`, "Somebody else")).toBe(false);
    expect(await fillDonationPayerName(`sepa:${MARKER}-named`, "Anna von Trapp")).toBe(false);

    const names = await client.query<{ external_ref: string; name: string }>(
      "SELECT external_ref, name FROM donations WHERE external_ref = ANY($1::text[]) ORDER BY external_ref",
      [[`sepa:${MARKER}-named`, `sepa:${MARKER}-unnamed`]],
    );
    expect(names.rows.map((row) => row.name)).toEqual(["Typed by hand", "Anna von Trapp"]);
  });
});
