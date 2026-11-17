/**
 * @file The donations ledger: every payment that reached musiccloud, whatever
 * route it took.
 *
 * The ledger is the only source of every funding figure. The support page's
 * variables, the dashboard's charts and the sponsor wall all sum the same rows,
 * so no two of them can disagree about what came in.
 */

import { RECORD_ID_SCHEMA } from "./record-id.js";

/**
 * The route a payment took.
 *
 * - `BankTransfer`: a SEPA transfer to the payee account, entered by hand or
 *   taken in by the bank import.
 * - `Paypal`: a PayPal.Me payment, entered by hand.
 * - `GithubSponsors`: a GitHub Sponsors payout, entered by hand.
 * - `Other`: anything else, such as cash, entered by hand with a note.
 */
export const DonationProvider = {
  BankTransfer: "bank-transfer",
  Paypal: "paypal",
  GithubSponsors: "github-sponsors",
  Other: "other",
} as const;

/** A {@link DonationProvider} member value. */
export type DonationProviderValue = (typeof DonationProvider)[keyof typeof DonationProvider];

/** Every route, in the order the dashboard lists them. The database's check constraint is built from it. */
export const DONATION_PROVIDERS: readonly DonationProviderValue[] = Object.values(DonationProvider);

/** The one currency the ledger holds. A SEPA transfer, PayPal.Me and the payee account all run in euros. */
export const DONATION_CURRENCY = "EUR";

/** Bounds on every field of a donation. The request schema and the dashboard's inputs read them. */
export const DONATION_LIMITS = {
  /** Longest donor name: 160 characters, as a bank statement or a form gives it. */
  nameMaxLength: 160,
  /** Longest note: 500 characters. */
  noteMaxLength: 500,
  /** Largest single payment: 10,000,000 cents, which is 100,000 euros. */
  amountMaxCents: 10_000_000,
} as const;

/** A day as the ledger states one, `YYYY-MM-DD`. */
export const DAY_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

/**
 * Everything an operator records about one payment.
 *
 * @property name - Who paid, as they gave it. May be empty for an anonymous payment.
 * @property published - Whether the donor agreed to be named on the site.
 *   What they gave counts towards the year either way.
 * @property amountCents - The amount in euro cents, 1 to {@link DONATION_LIMITS.amountMaxCents}.
 * @property receivedOn - The day the money arrived, `YYYY-MM-DD`.
 * @property provider - The route it took.
 * @property note - Anything the operator wants to remember about it.
 * @property sponsorId - The annual sponsor this payment belongs to, or `null` for a free
 *   donation. A linked payment adds to that sponsor's amount; the money counts towards
 *   the year either way.
 */
export interface DonationInput {
  name: string;
  published: boolean;
  amountCents: number;
  receivedOn: string;
  provider: DonationProviderValue;
  note: string;
  sponsorId: string | null;
}

/**
 * One payment as stored and read back.
 *
 * @property id - The row's identifier.
 * @property externalRef - The bank's own reference for a payment the bank
 *   import took in, which keeps the same payment from being booked twice.
 *   `null` for a payment entered by hand.
 * @property createdAt - When the row was written, ISO 8601.
 * @property updatedAt - When the row was last changed, ISO 8601.
 */
export interface Donation extends DonationInput {
  id: string;
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The request schema of a donation, for the backend route.
 *
 * Built from {@link DONATION_LIMITS} and {@link DONATION_PROVIDERS}, so the
 * route, the database and the dashboard agree on what a donation may be. The
 * day's calendar validity is checked in code, because a pattern cannot tell
 * 2026-02-30 from 2026-02-28.
 */
export const DONATION_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "published", "amountCents", "receivedOn", "provider", "note", "sponsorId"],
  properties: {
    name: { type: "string", maxLength: DONATION_LIMITS.nameMaxLength },
    published: { type: "boolean" },
    amountCents: { type: "integer", minimum: 1, maximum: DONATION_LIMITS.amountMaxCents },
    receivedOn: { type: "string", pattern: DAY_PATTERN },
    provider: { type: "string", enum: DONATION_PROVIDERS },
    note: { type: "string", maxLength: DONATION_LIMITS.noteMaxLength },
    sponsorId: { anyOf: [RECORD_ID_SCHEMA, { type: "null" }] },
  },
} as const;

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Characters of an ISO timestamp that form the day. */
const DAY_LENGTH = 10;

/**
 * Checks that a `YYYY-MM-DD` string names a day that exists.
 *
 * @param day - The day as typed.
 * @returns `true` for a real calendar day, `false` for 2026-02-30 and the like.
 */
export function isCalendarDay(day: string): boolean {
  if (!new RegExp(DAY_PATTERN).test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, DAY_LENGTH) === day;
}

/**
 * Today's day in UTC, which every funding window and every sponsor's year is
 * counted against, so the server's time zone cannot move a day.
 *
 * @param now - The moment to read the day from. Defaults to now.
 * @returns The day, `YYYY-MM-DD`.
 */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, DAY_LENGTH);
}

/**
 * How many days the funding year and the funding month reach back.
 *
 * - `Year`: 365 days, the window the annual cost is measured against. It is
 *   rolling rather than a calendar year, so the page never resets to nothing
 *   on the first of January.
 * - `Month`: 30 days, for "what came in lately".
 */
export const FundingWindowDays = {
  Year: 365,
  Month: 30,
} as const;

/**
 * The first day a funding window includes, counted back from today.
 *
 * Today is day one of the window, so a 365-day window starting on 2025-11-18
 * ends on 2026-11-17.
 *
 * @param today - The day the window ends on, `YYYY-MM-DD`.
 * @param days - The window's length, such as {@link FundingWindowDays.Year}.
 * @returns The window's first day, `YYYY-MM-DD`.
 */
export function fundingWindowStart(today: string, days: number): string {
  const end = Date.parse(`${today}T00:00:00Z`);
  return new Date(end - (days - 1) * DAY_MS).toISOString().slice(0, DAY_LENGTH);
}

/**
 * How far the year's donations carry the year's costs.
 *
 * @property coveredCents - What came in, capped at the annual cost.
 * @property missingCents - What is still missing, zero once the year is carried.
 * @property ratio - The covered share, 0 to 1. Zero when nothing costs anything.
 */
export interface FundingProgress {
  coveredCents: number;
  missingCents: number;
  ratio: number;
}

/**
 * Compares what came in over the funding year with what the year costs.
 *
 * The support page's `{missingYear}`, the dashboard's funding bar and the
 * sponsor wall's status sentence all read this, so a page and the bar beside
 * it can never disagree about what is missing.
 *
 * @param annualCostCents - The sum of the running costs.
 * @param donatedYearCents - What came in over the last {@link FundingWindowDays.Year} days.
 * @returns The covered amount, the missing amount and the ratio.
 */
export function fundingProgress(annualCostCents: number, donatedYearCents: number): FundingProgress {
  const coveredCents = Math.min(Math.max(donatedYearCents, 0), Math.max(annualCostCents, 0));
  const missingCents = Math.max(annualCostCents - coveredCents, 0);
  return {
    coveredCents,
    missingCents,
    ratio: annualCostCents > 0 ? coveredCents / annualCostCents : 0,
  };
}

/**
 * What came in, for the dashboard's charts and the site's figures.
 *
 * @property donatedYearCents - The sum over the last {@link FundingWindowDays.Year} days.
 * @property donatedMonthCents - The sum over the last {@link FundingWindowDays.Month} days.
 * @property byMonth - Per calendar month of the funding year, oldest first,
 *   the sum per route. A month without payments is present with an empty map.
 * @property byProvider - The funding year's sum per route.
 */
export interface DonationTotals {
  donatedYearCents: number;
  donatedMonthCents: number;
  byMonth: { month: string; byProvider: Partial<Record<DonationProviderValue, number>> }[];
  byProvider: Partial<Record<DonationProviderValue, number>>;
}
