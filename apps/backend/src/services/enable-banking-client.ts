/**
 * @file The one client that speaks to Enable Banking about musiccloud's bank
 * account.
 *
 * Ported from lmaa.space (`apps/backend/src/services/enable-banking-client.ts`).
 * Three things differ because musiccloud differs. Every request goes through
 * the backend's guarded `fetchWithTimeout`, which also refuses a non-public
 * address. The answers are checked by small readers in this file rather than by
 * Zod, which this backend does not use, and each keeps only the fields that are
 * read. A failure is a {@link BankConnectionError} carrying its `MC-BANK-*`
 * code, and the log names a request by its path template, so a session or an
 * account identifier that is part of a path never reaches a log line.
 */

import { createSign } from "node:crypto";
import { BankErrorCode } from "@musiccloud/shared";
import { getEnableBankingConfig } from "../lib/enable-banking-config.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { BankConnectionError } from "./bank-connection-error.js";

/** The component every log line of this module names. */
const LOG_COMPONENT = "EnableBankingClient";

/** The one host this backend ever speaks to about the bank account. */
const ENABLE_BANKING_HOST = "api.enablebanking.com";

/** Everything below is a path against this. */
const ENABLE_BANKING_BASE_URL = `https://${ENABLE_BANKING_HOST}`;

/** The only scheme a request or the bank's authorization address may use. */
const HTTPS_PROTOCOL = "https:";

/** Who the request token says it comes from, per the provider's JWT contract. */
const JWT_ISSUER = "enablebanking.com";

/** The token type the header names. */
const JWT_TYPE = "JWT";

/** The signature algorithm the provider expects, RSA with SHA-256. */
const JWT_ALGORITHM = "RS256";

/** The `node:crypto` name of {@link JWT_ALGORITHM}. */
const SIGNING_ALGORITHM = "RSA-SHA256";

/** Milliseconds in a second, for the token's whole-second timestamps. */
const MS_PER_SECOND = 1000;

/**
 * How long a request token stays valid: 300 seconds.
 *
 * The contract allows up to 86,400 seconds. A token is signed for one request
 * and used immediately, so it is given the minutes that cover a slow response
 * and nothing beyond them.
 */
const JWT_LIFETIME_SECONDS = 300;

/** How long to wait for the provider, answer included, before giving up: 15 seconds. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The institution the account sits with, as Enable Banking names it.
 *
 * musiccloud and lmaa.space receive their money on the same account at
 * Sparkasse Bregenz, which the provider covers under the Erste Bank entry for
 * Austria, because the Austrian savings banks share that integration.
 */
const ASPSP = { name: "Erste Bank", country: "AT" } as const;

/** Which kind of account holder is authorizing, per the provider's vocabulary. */
const PSU_TYPE = "personal";

/**
 * What an identifier may consist of before it is put into a path: 1 to 200
 * unreserved URL characters.
 *
 * Both the session and the account come from this site's own database and
 * originally from the provider, so neither is caller input. The pattern is here
 * because they are about to become part of a URL, and a value that cannot hold
 * a slash or a dot segment cannot leave the path it was meant for, whatever
 * else changes around it.
 */
const PATH_IDENTIFIER_PATTERN = /^[A-Za-z0-9._~-]{1,200}$/;

/** An identifier made only of dots is a path segment rather than a name. */
const DOT_SEGMENT_PATTERN = /^\.+$/;

/** Money arriving, as the interface names the direction. */
const CREDIT_INDICATOR = "CRDT";

/** Only entries the bank has actually booked, never ones still pending. */
const BOOKED_STATUS = "BOOK";

/**
 * Use the dates that were asked for.
 *
 * The alternative, `longest`, looks for the longest period the bank will give,
 * ignores `date_to`, and costs extra calls at the bank to find out. A read
 * knows exactly which days it wants.
 */
const FETCH_STRATEGY = "default";

/** Cents in a euro, or in any currency the interface states with two decimals. */
const CENTS_PER_UNIT = 100;

/** How many characters of a date the client keeps: `YYYY-MM-DD`, 10. */
const DAY_LENGTH = 10;

/** The longest identifier the provider's answers may carry: 200 characters. */
const IDENTIFIER_MAX_LENGTH = 200;

/** The longest institution country code an answer may carry: 8 characters. */
const COUNTRY_MAX_LENGTH = 8;

/** The longest timestamp or day an answer may carry: 64 characters for a consent end, 32 for a day. */
const TIMESTAMP_MAX_LENGTH = 64;

/** The longest day an entry may carry: 32 characters. */
const DAY_MAX_LENGTH = 32;

/** The longest currency an entry may carry: 8 characters. */
const CURRENCY_MAX_LENGTH = 8;

/** The longest amount, a decimal as text, an entry may carry: 32 characters. */
const AMOUNT_MAX_LENGTH = 32;

/** The longest direction indicator an entry may carry: 8 characters. */
const INDICATOR_MAX_LENGTH = 8;

/** The longest remittance line an entry may carry: 500 characters. */
const REMITTANCE_LINE_MAX_LENGTH = 500;

/** The most remittance lines an entry may carry: 50. */
const REMITTANCE_LINES_MAX_COUNT = 50;

/** The longest continuation key a page may carry: 2,000 characters. */
const CONTINUATION_KEY_MAX_LENGTH = 2000;

/** The path templates the log names requests by, never the paths with identifiers in them. */
const LOG_PATH = {
  authorization: "/auth",
  sessions: "/sessions",
  session: "/sessions/{id}",
  transactions: "/accounts/{uid}/transactions",
} as const;

/** One entry of the account, reduced to what deciding about it needs. */
export interface BankTransaction {
  /** The bank's own name for the entry. */
  entryReference: string;
  /** What moved, in cents, always positive. */
  amountCents: number;
  /** The currency it moved in. */
  currency: string;
  /** Whether the money arrived rather than left. */
  isCredit: boolean;
  /** The day it was booked, as `YYYY-MM-DD`. */
  bookedOn: string;
  /**
   * The remittance text, line by line.
   *
   * Never stored and never logged. It is read to decide whether the entry
   * concerns musiccloud and is dropped with the entry when it does not.
   */
  remittanceLines: string[];
  /**
   * Who sent the money, as the statement writes them.
   *
   * Empty where the entry named nobody. Never logged, and kept only for an
   * entry that turns out to concern musiccloud, so a payment belonging to
   * somebody's ordinary life leaves the read with its name as with everything
   * else about it.
   */
  payerName: string;
}

/** One page of the account's entries. */
export interface BankTransactionPage {
  /** The entries this page carried that could be dated, named and priced. */
  transactions: BankTransaction[];
  /** What to ask for to get the next page, or `null` at the end. */
  continuationKey: string | null;
}

/** An authorization that has been started and is waiting for the person. */
export interface StartedAuthorization {
  /** Where to send the browser, always `https`. */
  url: string;
  /** What the provider called this authorization, kept for the log; empty where it named none. */
  authorizationId: string;
}

/** A session the provider issued, reduced to what this site stores. */
export interface EnableBankingSession {
  /** The credential every later read of the account presents. */
  sessionId: string;
  /** Every account the session reaches. One of them, or the session is refused. */
  accountUids: string[];
  /** The institution as the provider names it; empty where the answer named none. */
  aspspName: string;
  /** Its country, in the two letters the provider pairs with the name; empty where none. */
  aspspCountry: string;
  /** When the consent lapses, or `null` where the answer carried no readable date. */
  consentValidUntil: Date | null;
}

/**
 * An answer that does not fit what is read, with the field where it stopped
 * fitting. Thrown by the readers below and caught by {@link parseAnswer}.
 */
class AnswerShapeError extends Error {
  /**
   * @param field - The dotted path of the field that did not fit. A path, never a value.
   */
  constructor(readonly field: string) {
    super(`Unexpected answer at ${field}`);
    this.name = "AnswerShapeError";
  }
}

/** A plain JSON object from an answer. */
type AnswerObject = Record<string, unknown>;

/**
 * Reads a value as a JSON object.
 *
 * @param value - The value to read.
 * @param field - Its dotted path, for the refusal.
 * @returns The object.
 * @throws {AnswerShapeError} When the value is not an object.
 */
function readObject(value: unknown, field: string): AnswerObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AnswerShapeError(field);
  return value as AnswerObject;
}

/**
 * Reads an optional object field, which may be left out.
 *
 * @param container - The object holding the field.
 * @param key - The field's name.
 * @param field - Its dotted path, for the refusal.
 * @param allowNull - Whether `null` counts as left out, as the interface sends for an unnamed party.
 * @returns The object, or `undefined` when it is left out.
 * @throws {AnswerShapeError} When it is there and not an object.
 */
function readOptionalObject(
  container: AnswerObject,
  key: string,
  field: string,
  allowNull = false,
): AnswerObject | undefined {
  const value = container[key];
  if (value === undefined || (allowNull && value === null)) return undefined;
  return readObject(value, field);
}

/**
 * Reads a string field and holds it to a length.
 *
 * @param container - The object holding the field.
 * @param key - The field's name.
 * @param field - Its dotted path, for the refusal.
 * @param bounds - The longest the string may be, and the shortest, `0` unless said otherwise.
 * @returns The string.
 * @throws {AnswerShapeError} When it is missing, not a string, or outside the bounds.
 */
function readString(
  container: AnswerObject,
  key: string,
  field: string,
  bounds: { max: number; min?: number },
): string {
  const value = container[key];
  if (typeof value !== "string" || value.length > bounds.max || value.length < (bounds.min ?? 0)) {
    throw new AnswerShapeError(field);
  }
  return value;
}

/**
 * Reads a string field that may be left out.
 *
 * @param container - The object holding the field.
 * @param key - The field's name.
 * @param field - Its dotted path, for the refusal.
 * @param bounds - As for {@link readString}.
 * @param allowNull - Whether `null` counts as left out.
 * @returns The string, or `undefined` when it is left out.
 * @throws {AnswerShapeError} When it is there and does not fit.
 */
function readOptionalString(
  container: AnswerObject,
  key: string,
  field: string,
  bounds: { max: number; min?: number },
  allowNull = false,
): string | undefined {
  const value = container[key];
  if (value === undefined || (allowNull && value === null)) return undefined;
  return readString(container, key, field, bounds);
}

/**
 * Reads an array field, which counts as empty where it is left out.
 *
 * @param container - The object holding the field.
 * @param key - The field's name.
 * @param field - Its dotted path, for the refusal.
 * @param maxCount - The most items it may hold, or no limit where left out.
 * @returns The items.
 * @throws {AnswerShapeError} When it is there and not an array, or too long.
 */
function readArray(container: AnswerObject, key: string, field: string, maxCount?: number): unknown[] {
  const value = container[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || (maxCount !== undefined && value.length > maxCount)) throw new AnswerShapeError(field);
  return value;
}

/**
 * Signs one request token for the provider.
 *
 * @returns The compact JWT the `Authorization` header carries.
 * @throws {BankConnectionError} `MC-BANK-0001` when the deployment holds no credential.
 *
 * @remarks
 * The token is the credential, so it appears in no log and in no response. It
 * is built by hand rather than through a library because the contract is four
 * claims and a signature, and the key is an ordinary RSA key that `node:crypto`
 * signs with directly.
 */
function signRequestToken(): string {
  const config = getEnableBankingConfig();
  if (!config) throw new BankConnectionError(BankErrorCode.NotConfigured);
  const issuedAt = Math.floor(Date.now() / MS_PER_SECOND);

  const header = Buffer.from(JSON.stringify({ typ: JWT_TYPE, alg: JWT_ALGORITHM, kid: config.applicationId })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: JWT_ISSUER,
      aud: ENABLE_BANKING_HOST,
      iat: issuedAt,
      exp: issuedAt + JWT_LIFETIME_SECONDS,
    }),
  ).toString("base64url");

  const signer = createSign(SIGNING_ALGORITHM);
  signer.update(`${header}.${payload}`);
  signer.end();

  return `${header}.${payload}.${signer.sign(config.privateKey).toString("base64url")}`;
}

/**
 * Sends one request to the provider and returns its answer as parsed JSON.
 *
 * @param method - The verb the operation uses.
 * @param path - The path against the provider's base address, query included.
 * @param logPath - The same path as a template, which is all the log names.
 * @param body - What to send, as JSON, or nothing where the operation has no body.
 * @returns The answer, still unvalidated.
 * @throws {BankConnectionError} `MC-BANK-0005` when the path would leave the
 *   provider's host, `MC-BANK-0001` when unconfigured, `MC-BANK-0002` when the
 *   provider cannot be reached, redirects or does not answer within
 *   {@link REQUEST_TIMEOUT_MS}, `MC-BANK-0003` when it refuses, and
 *   `MC-BANK-0004` when its answer is not JSON.
 *
 * @remarks
 * The parsed host is checked against the single host this feature may reach,
 * and redirects are refused outright, so the token cannot be carried to a
 * destination that was not the one checked. Nothing but the token travels: no
 * cookie, no client address, no header the caller sent. The body is read inside
 * the same timeout as the request, so a provider that stalls mid-answer is
 * reported as unreachable too.
 */
async function callEnableBanking(
  method: "GET" | "POST" | "DELETE",
  path: string,
  logPath: string,
  body?: unknown,
): Promise<unknown> {
  const url = new URL(path, ENABLE_BANKING_BASE_URL);
  if (url.protocol !== HTTPS_PROTOCOL || url.host !== ENABLE_BANKING_HOST) {
    throw new BankConnectionError(BankErrorCode.BadDestination);
  }

  // Signed before the request rather than inside it, so a missing or unreadable
  // key is reported as what it is instead of as an unreachable provider.
  const token = signRequestToken();

  let status: number;
  let text: string;
  try {
    const response = await fetchWithTimeout(
      url.href,
      {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      REQUEST_TIMEOUT_MS,
    );
    status = response.status;
    text = await response.text();
    if (!response.ok) {
      log.deviation({
        component: LOG_COMPONENT,
        errorCode: BankErrorCode.RequestRefused,
        operation: "enable_banking_request",
        outcome: "refused",
        path: logPath,
        status,
      });
      throw new BankConnectionError(BankErrorCode.RequestRefused);
    }
  } catch (cause) {
    if (cause instanceof BankConnectionError) throw cause;
    log.deviation({
      component: LOG_COMPONENT,
      errorCode: BankErrorCode.Unreachable,
      operation: "enable_banking_request",
      outcome: "unreachable",
      path: logPath,
      cause: cause instanceof Error ? cause.name : "unknown",
    });
    throw new BankConnectionError(BankErrorCode.Unreachable, { cause });
  }

  try {
    return JSON.parse(text);
  } catch {
    log.deviation({
      component: LOG_COMPONENT,
      errorCode: BankErrorCode.BadAnswer,
      operation: "enable_banking_request",
      outcome: "not_json",
      path: logPath,
      status,
    });
    throw new BankConnectionError(BankErrorCode.BadAnswer);
  }
}

/**
 * Reads an answer from the provider, refusing one that does not fit.
 *
 * @param read - Reduces the answer to the fields this site reads, throwing
 *   {@link AnswerShapeError} where it does not fit.
 * @param payload - The answer as it arrived.
 * @param logPath - The path template it answers, for the log.
 * @returns What `read` returned.
 * @throws {BankConnectionError} `MC-BANK-0004` when the answer does not fit.
 */
function parseAnswer<Answer>(read: (payload: unknown) => Answer, payload: unknown, logPath: string): Answer {
  try {
    return read(payload);
  } catch (cause) {
    if (!(cause instanceof AnswerShapeError)) throw cause;
    // The field is a path and never a value, so nothing from the answer itself
    // reaches the log.
    log.deviation({
      component: LOG_COMPONENT,
      errorCode: BankErrorCode.BadAnswer,
      operation: "enable_banking_request",
      outcome: "unexpected_shape",
      path: logPath,
      field: cause.field,
    });
    throw new BankConnectionError(BankErrorCode.BadAnswer);
  }
}

/**
 * Holds an identifier to the path pattern before it becomes part of a URL.
 *
 * @param identifier - A session or account identifier as it was stored.
 * @returns The identifier, unchanged.
 * @throws {BankConnectionError} `MC-BANK-0005` when it is not one this site could have stored.
 */
function requirePathIdentifier(identifier: string): string {
  if (!PATH_IDENTIFIER_PATTERN.test(identifier) || DOT_SEGMENT_PATTERN.test(identifier)) {
    throw new BankConnectionError(BankErrorCode.BadDestination);
  }
  return identifier;
}

/**
 * Reads the answer to a started authorization.
 *
 * The address is checked as an address, because it is a destination that
 * arrives in a third party's answer and the dashboard sends the browser to it.
 * Which host it names is the bank's business and changes with the institution,
 * so what is fixed is the scheme.
 *
 * @param payload - The answer as it arrived.
 * @returns The address and the provider's name for the authorization.
 * @throws {AnswerShapeError} When it does not fit.
 */
function readAuthorizationAnswer(payload: unknown): StartedAuthorization {
  const answer = readObject(payload, "$");
  const url = readString(answer, "url", "url", { max: Number.MAX_SAFE_INTEGER, min: 1 });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AnswerShapeError("url");
  }
  if (parsed.protocol !== HTTPS_PROTOCOL) throw new AnswerShapeError("url");
  const authorizationId =
    readOptionalString(answer, "authorization_id", "authorization_id", { max: IDENTIFIER_MAX_LENGTH }) ?? "";
  return { url, authorizationId };
}

/**
 * Reads the answer to an exchanged code.
 *
 * @param payload - The answer as it arrived.
 * @returns The session reduced to what is stored.
 * @throws {AnswerShapeError} When it does not fit.
 */
function readSessionAnswer(payload: unknown): EnableBankingSession {
  const answer = readObject(payload, "$");
  const sessionId = readString(answer, "session_id", "session_id", { max: IDENTIFIER_MAX_LENGTH, min: 1 });
  const accountUids = readArray(answer, "accounts", "accounts").map((account, index) =>
    readString(readObject(account, `accounts.${index}`), "uid", `accounts.${index}.uid`, {
      max: IDENTIFIER_MAX_LENGTH,
      min: 1,
    }),
  );
  const aspsp = readOptionalObject(answer, "aspsp", "aspsp");
  const access = readOptionalObject(answer, "access", "access");
  const validUntil = access
    ? readOptionalString(access, "valid_until", "access.valid_until", { max: TIMESTAMP_MAX_LENGTH })
    : undefined;
  const consentValidUntil = validUntil ? new Date(validUntil) : null;

  return {
    sessionId,
    accountUids,
    aspspName: (aspsp && readOptionalString(aspsp, "name", "aspsp.name", { max: IDENTIFIER_MAX_LENGTH })) ?? "",
    aspspCountry: (aspsp && readOptionalString(aspsp, "country", "aspsp.country", { max: COUNTRY_MAX_LENGTH })) ?? "",
    consentValidUntil: consentValidUntil && !Number.isNaN(consentValidUntil.getTime()) ? consentValidUntil : null,
  };
}

/** One entry as the readers below reduce it, before the client decides whether it can be used. */
interface ReadEntry {
  entryReference: string | undefined;
  amount: { currency: string; amount: string } | undefined;
  creditDebitIndicator: string | undefined;
  bookingDate: string | undefined;
  valueDate: string | undefined;
  remittanceLines: string[];
  payerName: string | undefined;
}

/**
 * Reads one entry of the account's statement.
 *
 * Every field this site does not read is left out, so nothing it has no use
 * for is even carried past this point. That matters more than usual here: the
 * account is a private one, and an entry that turns out not to concern
 * musiccloud must leave the reading function without a trace. The party who
 * sent the money is read for its name alone; its postal address is never read.
 *
 * @param value - The entry as it arrived.
 * @param field - Its dotted path, for the refusal.
 * @returns The entry's read fields.
 * @throws {AnswerShapeError} When it does not fit.
 */
function readEntry(value: unknown, field: string): ReadEntry {
  const entry = readObject(value, field);
  const amount = readOptionalObject(entry, "transaction_amount", `${field}.transaction_amount`);
  const debtor = readOptionalObject(entry, "debtor", `${field}.debtor`, true);
  return {
    entryReference: readOptionalString(entry, "entry_reference", `${field}.entry_reference`, {
      max: IDENTIFIER_MAX_LENGTH,
      min: 1,
    }),
    amount: amount && {
      currency: readString(amount, "currency", `${field}.transaction_amount.currency`, { max: CURRENCY_MAX_LENGTH }),
      amount: readString(amount, "amount", `${field}.transaction_amount.amount`, { max: AMOUNT_MAX_LENGTH }),
    },
    creditDebitIndicator: readOptionalString(entry, "credit_debit_indicator", `${field}.credit_debit_indicator`, {
      max: INDICATOR_MAX_LENGTH,
    }),
    bookingDate: readOptionalString(entry, "booking_date", `${field}.booking_date`, { max: DAY_MAX_LENGTH }),
    valueDate: readOptionalString(entry, "value_date", `${field}.value_date`, { max: DAY_MAX_LENGTH }),
    remittanceLines: readArray(
      entry,
      "remittance_information",
      `${field}.remittance_information`,
      REMITTANCE_LINES_MAX_COUNT,
    ).map((line, index) => {
      const lineField = `${field}.remittance_information.${index}`;
      if (typeof line !== "string" || line.length > REMITTANCE_LINE_MAX_LENGTH) throw new AnswerShapeError(lineField);
      return line;
    }),
    payerName: debtor && readOptionalString(debtor, "name", `${field}.debtor.name`, { max: IDENTIFIER_MAX_LENGTH }),
  };
}

/**
 * Reads one page of the account's entries.
 *
 * @param payload - The answer as it arrived.
 * @returns The entries' read fields and the next page's key.
 * @throws {AnswerShapeError} When it does not fit.
 */
function readTransactionsAnswer(payload: unknown): { entries: ReadEntry[]; continuationKey: string | null } {
  const answer = readObject(payload, "$");
  return {
    entries: readArray(answer, "transactions", "transactions").map((entry, index) =>
      readEntry(entry, `transactions.${index}`),
    ),
    continuationKey:
      readOptionalString(answer, "continuation_key", "continuation_key", { max: CONTINUATION_KEY_MAX_LENGTH }, true) ??
      null,
  };
}

/**
 * Turns money as the interface states it into cents.
 *
 * @param amount - A decimal as text, such as `12.34`.
 * @returns The amount in cents, always positive, or `null` when it is not a
 *   number. The direction is carried separately, so a sign here would be a
 *   second answer to a question `credit_debit_indicator` already settles.
 */
function toCents(amount: string): number | null {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return Math.abs(Math.round(value * CENTS_PER_UNIT));
}

/**
 * Starts an authorization and returns where to send the person.
 *
 * @param state - The value the return has to carry back, as hex.
 * @param redirectUrl - Where the bank returns the person, from configuration.
 * @param validUntil - How long the consent is asked to last.
 * @returns The address to send the browser to, and the provider's own name for
 *   this authorization.
 * @throws {BankConnectionError} `MC-BANK-0001` when unconfigured, and the
 *   codes of {@link callEnableBanking} and {@link parseAnswer} when the provider fails.
 */
export async function startAuthorization(
  state: string,
  redirectUrl: string,
  validUntil: Date,
): Promise<StartedAuthorization> {
  return parseAnswer(
    readAuthorizationAnswer,
    await callEnableBanking("POST", LOG_PATH.authorization, LOG_PATH.authorization, {
      access: { valid_until: validUntil.toISOString() },
      aspsp: ASPSP,
      state,
      redirect_url: redirectUrl,
      psu_type: PSU_TYPE,
    }),
    LOG_PATH.authorization,
  );
}

/**
 * Exchanges a returning code for a session.
 *
 * @param code - What the bank handed back through the dashboard.
 * @returns The session, the accounts it reaches and when the consent lapses.
 * @throws {BankConnectionError} As {@link startAuthorization}.
 *
 * @remarks
 * The exchange happens here rather than in the dashboard, because the key that
 * signs for it is here and nowhere else.
 */
export async function createSession(code: string): Promise<EnableBankingSession> {
  return parseAnswer(
    readSessionAnswer,
    await callEnableBanking("POST", LOG_PATH.sessions, LOG_PATH.sessions, { code }),
    LOG_PATH.sessions,
  );
}

/**
 * Closes a session at the provider, which ends the consent behind it.
 *
 * @param sessionId - The session as it was stored when it was created.
 * @throws {BankConnectionError} `MC-BANK-0005` when the identifier is not one
 *   this site could have stored, and the codes of {@link callEnableBanking}.
 *
 * @remarks
 * The provider closes the bank's consent with the session where it can, which
 * is what makes this more than forgetting the identifier locally. A session
 * nobody closes stays open until its consent lapses on its own.
 */
export async function closeSession(sessionId: string): Promise<void> {
  const identifier = requirePathIdentifier(sessionId);
  await callEnableBanking("DELETE", `/sessions/${encodeURIComponent(identifier)}`, LOG_PATH.session);
}

/**
 * Reads one page of the account's entries.
 *
 * @param accountUid - The account, as the session named it.
 * @param range - The days to ask for, both ends counting, as `YYYY-MM-DD`.
 * @param continuationKey - What the previous page answered, or nothing for the first page.
 * @returns The entries and the key for the next page, if any.
 * @throws {BankConnectionError} `MC-BANK-0005` when the account identifier is
 *   not one this site could have stored, and the codes of
 *   {@link callEnableBanking} and {@link parseAnswer}.
 *
 * @remarks
 * Only booked entries are asked for. That leaves the pending ones out, and it
 * stops one payment being counted once as pending and once as booked.
 *
 * The remittance text cannot be filtered on here, because the regulated
 * interface behind the provider has no free-text search. The window and the
 * status are therefore made as narrow as they can be, and what still comes back
 * is decided about by the caller and dropped where it does not concern
 * musiccloud. An entry the interface did not date, name or price cannot be
 * reconciled and is left out as though it had not been read.
 */
export async function fetchTransactions(
  accountUid: string,
  range: { from: string; to: string },
  continuationKey?: string,
): Promise<BankTransactionPage> {
  const identifier = requirePathIdentifier(accountUid);
  const query = new URLSearchParams({
    date_from: range.from,
    date_to: range.to,
    transaction_status: BOOKED_STATUS,
    strategy: FETCH_STRATEGY,
  });
  if (continuationKey) query.set("continuation_key", continuationKey);

  const page = parseAnswer(
    readTransactionsAnswer,
    await callEnableBanking(
      "GET",
      `/accounts/${encodeURIComponent(identifier)}/transactions?${query.toString()}`,
      LOG_PATH.transactions,
    ),
    LOG_PATH.transactions,
  );

  const transactions: BankTransaction[] = [];
  for (const entry of page.entries) {
    const bookedOn = entry.bookingDate ?? entry.valueDate;
    const amountCents = entry.amount ? toCents(entry.amount.amount) : null;
    if (!entry.entryReference || !bookedOn || amountCents === null) continue;

    transactions.push({
      entryReference: entry.entryReference,
      amountCents,
      currency: entry.amount?.currency ?? "",
      isCredit: entry.creditDebitIndicator === CREDIT_INDICATOR,
      bookedOn: bookedOn.slice(0, DAY_LENGTH),
      remittanceLines: entry.remittanceLines,
      payerName: entry.payerName?.trim() ?? "",
    });
  }

  return { transactions, continuationKey: page.continuationKey };
}
