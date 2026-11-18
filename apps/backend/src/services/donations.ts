/**
 * @file Reads and writes the donations ledger, and sums it.
 *
 * Every funding figure on the site and in the dashboard comes from
 * {@link readDonationTotals}, so the figures can never disagree with the rows
 * an operator sees.
 */

import {
  type Donation,
  type DonationInput,
  type DonationMonth,
  type DonationProviderValue,
  type DonationTotals,
  FundingWindowDays,
  fundingWindowStart,
  utcDay,
} from "@musiccloud/shared";
import { nanoid } from "nanoid";
import { type DatabaseQueryable, getDatabasePool } from "../db/pool.js";

/** One `donations` row as `pg` returns it. */
interface DonationRow {
  id: string;
  name: string;
  published: boolean;
  amount_cents: number;
  received_on: string;
  provider: DonationProviderValue;
  note: string;
  external_ref: string | null;
  sponsor_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/** The columns every read selects, with the day as text so no time zone can move it. */
const DONATION_COLUMNS = `id, name, published, amount_cents, to_char(received_on, 'YYYY-MM-DD') AS received_on,
  provider, note, external_ref, sponsor_id, created_at, updated_at`;

/** Characters of a day that form its month, `YYYY-MM`. */
const MONTH_LENGTH = 7;

/** Months the dashboard's income chart covers: the twelve of the funding year plus the current one. */
const CHART_MONTHS = 13;

/**
 * Turns a row into what the API returns.
 *
 * @param row - The row as read.
 * @returns The donation.
 */
function toDonation(row: DonationRow): Donation {
  return {
    id: row.id,
    name: row.name,
    published: row.published,
    amountCents: row.amount_cents,
    receivedOn: row.received_on,
    provider: row.provider,
    note: row.note,
    externalRef: row.external_ref,
    sponsorId: row.sponsor_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Lists every donation, newest first.
 *
 * @returns The ledger.
 */
export async function listDonations(): Promise<Donation[]> {
  const result = await getDatabasePool().query<DonationRow>(
    `SELECT ${DONATION_COLUMNS} FROM donations ORDER BY received_on DESC, created_at DESC`,
  );
  return result.rows.map(toDonation);
}

/**
 * Records a donation entered by hand.
 *
 * @param input - The validated donation.
 * @returns The stored donation.
 */
export async function createDonation(input: DonationInput): Promise<Donation> {
  return insertDonation(getDatabasePool(), input);
}

/**
 * Writes one donation row through the given connection, so a caller can make
 * it part of a transaction.
 *
 * @param db - The pool, or the client of an open transaction.
 * @param input - The validated donation.
 * @param externalRef - The bank's own key of a payment the bank import read,
 *   `sepa:<entry reference>`, or `null`, the default, for one entered by hand. Its
 *   unique index refuses the same entry a second time with a unique violation on
 *   `uq_donations_external_ref`, which is how a second read recognizes it.
 * @returns The stored donation.
 */
export async function insertDonation(
  db: DatabaseQueryable,
  input: DonationInput,
  externalRef: string | null = null,
): Promise<Donation> {
  const result = await db.query<DonationRow>(
    `INSERT INTO donations (id, name, published, amount_cents, received_on, provider, note, sponsor_id, external_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${DONATION_COLUMNS}`,
    [
      nanoid(),
      input.name,
      input.published,
      input.amountCents,
      input.receivedOn,
      input.provider,
      input.note,
      input.sponsorId,
      externalRef,
    ],
  );
  return toDonation(result.rows[0] as DonationRow);
}

/**
 * Gives a payment the ledger already holds the name it was stored without.
 *
 * @param externalRef - The entry as the ledger names it, `sepa:<entry reference>`.
 * @param name - The name as the statement writes it. Nothing is written when it is empty,
 *   since a read that learned no name has nothing to add.
 * @returns `true` when a row was completed, `false` when none matched or the one that did
 *   already carried a name.
 *
 * @remarks
 * Only a row whose name is empty is touched, and only that field of it. A name an
 * operator typed into the editor is better than the statement's, and a read repeating
 * over days already read must not undo that. The condition sits in the statement rather
 * than in a read followed by a write, so two overlapping reads cannot both decide the
 * row was empty.
 */
export async function fillDonationPayerName(externalRef: string, name: string): Promise<boolean> {
  if (!name) return false;
  const result = await getDatabasePool().query(
    "UPDATE donations SET name = $2, updated_at = NOW() WHERE external_ref = $1 AND name = ''",
    [externalRef, name],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Changes a donation. The bank's reference of an imported payment is not
 * part of the input and stays as it was.
 *
 * @param id - The donation to change.
 * @param input - The validated new values.
 * @returns The stored donation, or `null` when no donation has that id.
 */
export async function updateDonation(id: string, input: DonationInput): Promise<Donation | null> {
  const result = await getDatabasePool().query<DonationRow>(
    `UPDATE donations
        SET name = $2, published = $3, amount_cents = $4, received_on = $5, provider = $6, note = $7,
            sponsor_id = $8, updated_at = NOW()
      WHERE id = $1
      RETURNING ${DONATION_COLUMNS}`,
    [id, input.name, input.published, input.amountCents, input.receivedOn, input.provider, input.note, input.sponsorId],
  );
  const row = result.rows[0];
  return row ? toDonation(row) : null;
}

/**
 * Removes a donation.
 *
 * @param id - The donation to remove.
 * @returns `true` when a row was removed, `false` when no donation has that id.
 */
export async function deleteDonation(id: string): Promise<boolean> {
  const result = await getDatabasePool().query("DELETE FROM donations WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/** One row of the per-month, per-route sum, with the part of it linked to a sponsor. */
interface MonthProviderRow {
  month: string;
  provider: DonationProviderValue;
  total: string;
  sponsored: string;
}

/**
 * The calendar months the income chart shows, oldest first.
 *
 * @param today - The current day, `YYYY-MM-DD`.
 * @returns {@link CHART_MONTHS} months as `YYYY-MM`, ending with the current one.
 */
function chartMonths(today: string): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, MONTH_LENGTH));
  return Array.from({ length: CHART_MONTHS }, (_unused, index) => {
    const date = new Date(Date.UTC(year, month - CHART_MONTHS + index, 1));
    return date.toISOString().slice(0, MONTH_LENGTH);
  });
}

/**
 * Sums the ledger for the site's figures and the dashboard's charts.
 *
 * The year and the month are rolling windows that include today, as
 * {@link fundingWindowStart} counts them. The chart covers whole calendar
 * months, so a bar never shows a part of a month as if it were all of it.
 *
 * @param today - The day the windows end on, `YYYY-MM-DD`. Defaults to today in UTC.
 * @returns The sums.
 */
export async function readDonationTotals(today: string = utcDay()): Promise<DonationTotals> {
  const pool = getDatabasePool();
  const yearStart = fundingWindowStart(today, FundingWindowDays.Year);
  const monthStart = fundingWindowStart(today, FundingWindowDays.Month);
  const months = chartMonths(today);

  const [windows, perMonth, yearByProvider] = await Promise.all([
    pool.query<{ year: string; month: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE received_on >= $1::date), 0) AS year,
              COALESCE(SUM(amount_cents) FILTER (WHERE received_on >= $2::date), 0) AS month
         FROM donations
        WHERE received_on <= $3::date`,
      [yearStart, monthStart, today],
    ),
    pool.query<MonthProviderRow>(
      `SELECT to_char(received_on, 'YYYY-MM') AS month, provider, SUM(amount_cents) AS total,
              COALESCE(SUM(amount_cents) FILTER (WHERE sponsor_id IS NOT NULL), 0) AS sponsored
         FROM donations
        WHERE received_on >= $1::date AND received_on <= $2::date
        GROUP BY 1, 2`,
      [`${months[0]}-01`, today],
    ),
    // The route split covers the funding year, the same window as the year's sum.
    pool.query<{ provider: DonationProviderValue; total: string }>(
      `SELECT provider, SUM(amount_cents) AS total
         FROM donations
        WHERE received_on >= $1::date AND received_on <= $2::date
        GROUP BY provider`,
      [yearStart, today],
    ),
  ]);

  const byMonth: DonationMonth[] = months.map((month) => ({ month, byProvider: {}, sponsoredCents: 0 }));
  for (const row of perMonth.rows) {
    const entry = byMonth.find((candidate) => candidate.month === row.month);
    if (!entry) continue;
    entry.byProvider[row.provider] = Number(row.total);
    entry.sponsoredCents += Number(row.sponsored);
  }
  const byProvider: Partial<Record<DonationProviderValue, number>> = {};
  for (const row of yearByProvider.rows) byProvider[row.provider] = Number(row.total);

  const sums = windows.rows[0];
  return {
    donatedYearCents: Number(sums?.year ?? 0),
    donatedMonthCents: Number(sums?.month ?? 0),
    byMonth,
    byProvider,
  };
}
