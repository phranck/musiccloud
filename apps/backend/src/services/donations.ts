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
  type DonationProviderValue,
  type DonationTotals,
  FundingWindowDays,
  fundingWindowStart,
} from "@musiccloud/shared";
import { nanoid } from "nanoid";
import { getDatabasePool } from "../db/pool.js";

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

/** Characters of an ISO timestamp that form the day. */
const DAY_LENGTH = 10;

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
  const result = await getDatabasePool().query<DonationRow>(
    `INSERT INTO donations (id, name, published, amount_cents, received_on, provider, note, sponsor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    ],
  );
  return toDonation(result.rows[0] as DonationRow);
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

/** One row of the per-month, per-route sum. */
interface MonthProviderRow {
  month: string;
  provider: DonationProviderValue;
  total: string;
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
export async function readDonationTotals(
  today: string = new Date().toISOString().slice(0, DAY_LENGTH),
): Promise<DonationTotals> {
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
      `SELECT to_char(received_on, 'YYYY-MM') AS month, provider, SUM(amount_cents) AS total
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

  const byMonth = months.map((month) => ({ month, byProvider: {} as Partial<Record<DonationProviderValue, number>> }));
  for (const row of perMonth.rows) {
    const entry = byMonth.find((candidate) => candidate.month === row.month);
    if (entry) entry.byProvider[row.provider] = Number(row.total);
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
