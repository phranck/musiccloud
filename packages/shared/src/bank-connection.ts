/**
 * @file The link between musiccloud and the bank account it reads through
 * Enable Banking, as the backend and the dashboard both see it.
 *
 * Ported from lmaa.space (`packages/contracts/src/bank-connection.ts`). Only the
 * owner and the admins ever see any of this. musiccloud validates with JSON
 * schema rather than Zod, so the callback's constraints are a request schema
 * here, and the dashboard's two addresses live here as well, because the
 * backend builds the address the bank returns to from the same constant the
 * dashboard routes.
 */

import { DAY_PATTERN } from "./donations.js";

/** How many characters the value carried through the return has: 64, which is 32 random bytes as hex. */
export const BANK_AUTHORIZATION_STATE_LENGTH = 64;

/**
 * The longest authorization code the return may carry: 512 characters.
 *
 * Enable Banking documents that a `code` comes back and not what it looks
 * like, so the code is bounded by an alphabet and a length rather than by a
 * shape, and anything stricter would be a guess that refuses valid returns.
 */
export const BANK_AUTHORIZATION_CODE_MAX_LENGTH = 512;

/**
 * The largest body any bank connection route takes: 2,048 bytes.
 *
 * The largest body is a code and a state, which is a few hundred characters.
 * The global limit exists for media uploads and says nothing useful here.
 */
export const BANK_CONNECTION_BODY_LIMIT_BYTES = 2048;

/**
 * How many days before the consent lapses each warning is reached.
 *
 * - `soon`: 14 days. The dashboard calls the connection expiring from here on,
 *   and the first notice to the owner goes out.
 * - `imminent`: 3 days, which catches whoever was away for the first one.
 *
 * Warning earlier buys nothing, because renewing takes two minutes. The
 * dashboard's state and the backend's notices both read these, so the badge
 * and the mail cannot disagree about when the window opens.
 */
export const BANK_CONSENT_NOTICE_DAYS = {
  soon: 14,
  imminent: 3,
} as const;

/**
 * The warnings a lapsing consent produces, in the order they are reached.
 *
 * - `soon`: {@link BANK_CONSENT_NOTICE_DAYS} `soon` days or fewer are left.
 * - `imminent`: {@link BANK_CONSENT_NOTICE_DAYS} `imminent` days or fewer are left.
 * - `lapsed`: the consent has run out, or a read was refused.
 *
 * Three in half a year, and each of them once. More often and they stop being
 * read, which is the failure they exist to prevent. The connection records the
 * furthest one already sent, and the database holds that column to this list.
 */
export const BANK_CONSENT_NOTICE_STAGES = ["soon", "imminent", "lapsed"] as const;

/** One rung of {@link BANK_CONSENT_NOTICE_STAGES}. */
export type BankConsentNoticeStage = (typeof BANK_CONSENT_NOTICE_STAGES)[number];

/** The dashboard page that shows the connection and starts, renews and ends it. */
export const BANK_CONNECTION_DASHBOARD_PATH = "/sponsoring/bank-connection";

/**
 * The dashboard page the bank returns the account holder to.
 *
 * The backend builds the return address from `DASHBOARD_URL` and this path,
 * and the same address is registered with Enable Banking, which refuses any
 * other. Renaming it here therefore also means registering the new address
 * there.
 */
export const BANK_CONNECTION_CALLBACK_DASHBOARD_PATH = `${BANK_CONNECTION_DASHBOARD_PATH}/callback`;

/**
 * The stable error codes of the bank connection, as the backend answers with
 * them and the dashboard tells them apart.
 *
 * - `NotConfigured`: the deployment holds no Enable Banking credential.
 * - `Unreachable`: the provider could not be reached, or did not answer in time.
 * - `RequestRefused`: the provider answered with a status that is not a success.
 * - `BadAnswer`: the provider answered in a shape that is not the one expected.
 * - `BadDestination`: a request would have left the provider's host, so it was not made.
 * - `StateUnknown`: a return carries a state this site never issued, or one already spent or expired.
 * - `UnexpectedAccounts`: the session reaches a number of accounts other than one.
 * - `NotConnected`: disconnecting while no connection is in force.
 * - `CloseFailed`: the connection was withdrawn locally, but the provider would not close the consent.
 * - `ReadFailed`: a read of the account broke off for a reason the bank client does not name, such as
 *   a database failure while booking. A read records it as its failure, so the dashboard still names one.
 */
export const BankErrorCode = {
  NotConfigured: "MC-BANK-0001",
  Unreachable: "MC-BANK-0002",
  RequestRefused: "MC-BANK-0003",
  BadAnswer: "MC-BANK-0004",
  BadDestination: "MC-BANK-0005",
  StateUnknown: "MC-BANK-0006",
  UnexpectedAccounts: "MC-BANK-0007",
  NotConnected: "MC-BANK-0008",
  CloseFailed: "MC-BANK-0009",
  ReadFailed: "MC-BANK-0010",
} as const;

/** A {@link BankErrorCode} member value. */
export type BankErrorCodeValue = (typeof BankErrorCode)[keyof typeof BankErrorCode];

/**
 * What the bank hands back through the dashboard, which posts it straight on
 * to the backend, the only place that can spend it.
 *
 * @property code - The code the bank issued, to be exchanged for a session.
 * @property state - The value this site sent out, which says the return belongs to it.
 */
export interface BankConnectionCallback {
  code: string;
  state: string;
}

/**
 * The request schema of the return.
 *
 * Both values may arrive with surrounding whitespace, which the route trims
 * before using them, as lmaa.space's schema trims. The code is 1 to
 * {@link BANK_AUTHORIZATION_CODE_MAX_LENGTH} characters of `[A-Za-z0-9._~-]`,
 * the state exactly {@link BANK_AUTHORIZATION_STATE_LENGTH} lowercase hex
 * characters. `propertyNames` refuses a body that names anything else, because
 * Fastify's validator strips unknown properties under `additionalProperties`
 * rather than refusing them.
 */
export const BANK_CONNECTION_CALLBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["code", "state"],
  propertyNames: { enum: ["code", "state"] },
  properties: {
    code: { type: "string", pattern: `^\\s*[A-Za-z0-9._~-]{1,${BANK_AUTHORIZATION_CODE_MAX_LENGTH}}\\s*$` },
    state: { type: "string", pattern: `^\\s*[0-9a-f]{${BANK_AUTHORIZATION_STATE_LENGTH}}\\s*$` },
  },
} as const;

/**
 * What the dashboard shows about the connection.
 *
 * Every field comes from the backend's own database, so the page answers
 * while the bank is unreachable. Nothing here could reach the account: the
 * session and the account identifier never leave the backend.
 *
 * @property configured - Whether the deployment holds the credential that reaches the provider at all.
 * @property connected - Whether a connection is in force.
 * @property institutionName - The institution as the provider names it, empty while unconnected.
 * @property institutionCountry - Its country, in two letters, empty while unconnected.
 * @property consentValidUntil - When the consent lapses, ISO 8601, or `null` where none was stated.
 * @property connectedAt - When the connection in force was made, ISO 8601, or `null` where there is none.
 * @property lastReadAt - When the account was last read, or `null` before the first time.
 * @property lastReadSucceeded - Whether that read finished, or `null` where there has been none.
 * @property lastReadImported - How many payments that read took into the ledger, `0` before the first read.
 * @property lastReadFilled - How many payments that read completed rather than added, `0` before the first read.
 * @property lastReadFailure - Why the last read failed, as a {@link BankErrorCode} value, or `null`
 *   where it succeeded and before the first read. A code rather than a sentence, so the wording
 *   belongs to the dashboard, which maps it to a fixed text.
 * @property nextReadAt - When the background run next reaches the bank, or `null` where it will not:
 *   with no connection in force, and once the consent has lapsed. A time that is not in the future
 *   means the read is due now.
 *
 * The six read fields come from the stored reads of the account, the most recent one of either
 * kind, and from the schedule of the background run.
 */
export interface BankConnectionStatus {
  configured: boolean;
  connected: boolean;
  institutionName: string;
  institutionCountry: string;
  consentValidUntil: string | null;
  connectedAt: string | null;
  lastReadAt: string | null;
  lastReadSucceeded: boolean | null;
  lastReadImported: number;
  lastReadFilled: number;
  lastReadFailure: string | null;
  nextReadAt: string | null;
}

/**
 * Where to send the browser so the account holder can identify themselves.
 *
 * @property url - The bank's own address, always `https`, which the dashboard navigates to.
 */
export interface BankAuthorizationStart {
  url: string;
}

/**
 * Who asked the bank for the account's entries.
 *
 * - `background`: the backend's own run every six hours. It draws on a budget of
 *   four reads in a sliding 24 hours, which Article 36(5) of Commission Delegated
 *   Regulation (EU) 2018/389 allows while the account holder is not asking.
 * - `manual`: the owner pressing Read now in the dashboard, which is the account
 *   holder asking for their own information. It draws on a budget of its own, so
 *   it can never lock the background run out.
 *
 * The database holds the read table's `kind` column to this list.
 */
export const BANK_READ_KINDS = ["background", "manual"] as const;

/** One of {@link BANK_READ_KINDS}. */
export type BankReadKind = (typeof BANK_READ_KINDS)[number];

/**
 * What the owner may ask a read for: the day it starts at, and nothing else.
 *
 * The end is always today, because a read exists to bring the ledger up to
 * date and a window ending in the past cannot.
 *
 * @property from - The first day to ask the bank for, `YYYY-MM-DD`. Left out,
 *   the read takes the days it takes by itself. A day after today is ignored,
 *   because a range whose start lies after its end is one the bank refuses. How
 *   far back the bank goes is its own decision, and a range it refuses comes back
 *   as a failed read.
 */
export interface BankReadRequest {
  from?: string;
}

/**
 * The request schema of a read.
 *
 * `from` matches `YYYY-MM-DD`; whether it names a day that exists is checked by
 * the route, because a pattern cannot tell 2026-02-30 from 2026-02-28. The body
 * is a JSON object, `{}` where no day is asked for, and may name nothing else: `propertyNames` refuses an unknown
 * property, because Fastify's validator strips unknown properties under
 * `additionalProperties` rather than refusing them.
 */
export const BANK_READ_REQUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  propertyNames: { enum: ["from"] },
  properties: {
    from: { type: "string", pattern: DAY_PATTERN },
  },
} as const;

/**
 * Why a read did nothing.
 *
 * - `NotConnected`: no connection is in force.
 * - `ConsentExpired`: the consent has lapsed, so nothing is asked and nothing is written.
 * - `BudgetSpent`: the read's kind has used up its reads in the sliding 24 hours.
 * - `ReadFailed`: the bank was asked and the read broke off; the read carries the failure.
 */
export const BankReadSkip = {
  NotConnected: "not_connected",
  ConsentExpired: "consent_expired",
  BudgetSpent: "budget_spent",
  ReadFailed: "read_failed",
} as const;

/** A {@link BankReadSkip} member value. */
export type BankReadSkipValue = (typeof BankReadSkip)[keyof typeof BankReadSkip];

/**
 * What a read of the account did, or why it did nothing. The read route answers
 * with it; a read that did nothing is an ordinary answer rather than a failure.
 *
 * When it ran:
 *
 * @property from - The first day asked for, `YYYY-MM-DD`.
 * @property to - The last day asked for, which is today, `YYYY-MM-DD`.
 * @property read - How many entries came back, before anything was decided about them.
 * @property imported - How many became a row in the ledger.
 * @property filled - How many stood in the ledger already and were completed from the entry.
 * @property skipped - How many stood in the ledger already and had nothing to add.
 *
 * When it did not:
 *
 * @property reason - One of {@link BankReadSkip}.
 * @property failure - With `read_failed` only, the {@link BankErrorCode} value the read broke off with.
 */
export type BankReadResult =
  | { ran: true; from: string; to: string; read: number; imported: number; filled: number; skipped: number }
  | { ran: false; reason: BankReadSkipValue; failure?: BankErrorCodeValue };
