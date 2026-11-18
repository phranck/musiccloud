/**
 * @file Reads the bank account and books what belongs to musiccloud, ported
 * from lmaa.space (`apps/backend/src/services/bank-ingestion.ts`, including
 * its correction in lmaa.space#521).
 *
 * musiccloud and lmaa.space receive their money on the same account, so the
 * decision about an entry is a positive list mirrored from lmaa's: a reference
 * in musiccloud's own form that musiccloud issued, or `musiccloud.io` in the
 * purpose, and only for a euro credit above zero. Any lmaa.space marker, a
 * reference of another payee or `lmaa.space` in the purpose, excludes the entry
 * even where a musiccloud marker stands beside it. Everything else leaves the
 * read without being stored, counted per kind or logged.
 *
 * Three things differ because musiccloud differs. The marker is the fixed
 * {@link SPONSORING_REMITTANCE_MARKER} rather than the host of the deployment's
 * own address. A failure is recorded as its `MC-BANK-*` code. And the lines a
 * run logs go to the logger the caller hands in, the request logger for Read
 * now and the Fastify logger for the background run.
 */

import {
  BankErrorCode,
  type BankErrorCodeValue,
  type BankReadKind,
  type BankReadRequest,
  type BankReadResult,
  BankReadSkip,
  DAY_MS,
  DONATION_CURRENCY,
  DONATION_LIMITS,
  DonationProvider,
  formatCreditorReference,
  MAX_CREDITOR_REFERENCE_LENGTH,
  normalizeCreditorReference,
  normalizeSponsorshipReference,
  SPONSORING_REMITTANCE_MARKER,
  utcDay,
} from "@musiccloud/shared";
import type { FastifyBaseLogger } from "fastify";
import { getDatabasePool } from "../db/pool.js";
import { log } from "../lib/infra/logger.js";
import { BankConnectionError } from "./bank-connection-error.js";
import { getLiveBankConnection } from "./bank-connection-store.js";
import { announceConsentRefused, announceConsentStage } from "./bank-consent.js";
import {
  BACKGROUND_INTERVAL_MS,
  BACKGROUND_READS_PER_WINDOW,
  MANUAL_READS_PER_WINDOW,
  READ_WINDOW_HOURS,
} from "./bank-read-schedule.js";
import { claimBankRead, completeBankRead, failBankRead, getLastBookedThrough } from "./bank-read-store.js";
import { fillDonationPayerName, insertDonation } from "./donations.js";
import { type BankTransaction, fetchTransactions } from "./enable-banking-client.js";
import { takeOverPendingSponsorshipByReference, wasSponsorshipReferenceIssued } from "./pending-sponsorships.js";

/** The component every log line of this module names. */
const LOG_COMPONENT = "BankIngestion";

/** Where a run's information lines go: the request logger, or the Fastify logger for the background run. */
export type BankIngestionLogger = Pick<FastifyBaseLogger, "info">;

/** How far back the very first read reaches: 90 days. */
const FIRST_RUN_LOOKBACK_DAYS = 90;

/**
 * How far back every read after the first one reaches: 5 days.
 *
 * Counted from today rather than from the last day a read recorded, which is
 * what makes the window both safe and complete. Safe, because a range counted
 * from the last recorded day runs past today as soon as a read has already
 * succeeded today, and the bank refuses a range whose start is after its end.
 * Complete, because a day is not finished when a read has looked at it once: a
 * payment booked in the afternoon, or one the bank posts a few days late, falls
 * inside this window rather than between two reads. Reading the same days again
 * costs nothing, because the ledger keys on the entry and counts a repeat as
 * skipped.
 */
const RECENT_LOOKBACK_DAYS = 5;

/**
 * How many pages one read walks before it stops: 20.
 *
 * A continuation key that never comes back empty would otherwise make the read
 * endless. Twenty pages is far past a few days of a private account.
 */
const MAX_PAGES = 20;

/**
 * What a booked entry's ledger key opens with: `sepa`, followed by a colon and
 * the bank's own entry reference. The ledger's unique index on the key is what
 * keeps the same entry from being booked twice.
 */
const EXTERNAL_REF_PREFIX = "sepa";

/** The unique index on the ledger's `external_ref`, which a second booking of one entry runs into. */
const EXTERNAL_REF_UNIQUE_INDEX = "uq_donations_external_ref";

/** PostgreSQL's SQLSTATE for a unique violation. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * The code a run is logged under when its warning about a lapsed consent could
 * not go out: the generic server fault, because the cause is a missing owner
 * address, an unbound template or the mail provider, none of which is the bank's.
 */
const UNSENT_WARNING_ERROR_CODE = "MC-SYS-0001";

/**
 * The hosts of the other projects paid into the same account: `lmaa.space`.
 *
 * A transfer naming one of them is that project's to book, even where its text
 * also names musiccloud, because money that lands in two ledgers is counted
 * twice. Lower case and without `www.`, as {@link SPONSORING_REMITTANCE_MARKER}.
 */
const OTHER_PROJECT_HOSTS: readonly string[] = ["lmaa.space"];

/** The opening of a creditor reference: `RF` and its two check digits. */
const REFERENCE_START = /^RF[0-9]{2}/;

/** What separates one word of a remittance text from the next. */
const WORD_SEPARATOR = /[^A-Z0-9]+/;

/** A run of whitespace, which a bank stretches or wraps as it likes. */
const WHITESPACE_RUN = /\s+/g;

/**
 * What the creditor reference on a payment says about whose it is.
 *
 * `own` carries the reference as it is stored, in the form musiccloud issues.
 * `foreign` is a sound reference some other payee issued, such as lmaa.space's
 * `SPON` references or a shop refunding an order.
 */
export type FoundReference = { kind: "own"; reference: string } | { kind: "foreign" };

/**
 * What one entry was decided to be.
 *
 * - `sponsorship`: it carries a reference in musiccloud's form, which the import
 *   still checks musiccloud issued before booking anything.
 * - `donation`: it names {@link SPONSORING_REMITTANCE_MARKER} and carries no reference.
 * - `unbookable`: it is musiccloud's by its text, but its amount is not a
 *   positive sum in euros. It is skipped and counted in the run's log line.
 * - `ignore`: it is not musiccloud's, and is neither stored nor counted.
 */
export type TransactionClass =
  | { kind: "sponsorship"; reference: string }
  | { kind: "donation" }
  | { kind: "unbookable" }
  | { kind: "ignore" };

/**
 * What became of one recognized payment.
 *
 * - `imported`: it was not in the ledger and now is.
 * - `filled`: it stood there without a name, and now carries one.
 * - `skipped`: it stood there and the entry had nothing to add.
 * - `ignored`: its reference has musiccloud's form, but musiccloud never issued it.
 */
type ImportOutcome = "imported" | "filled" | "skipped" | "ignored";

/**
 * One line of remittance text with its spacing and case taken out.
 *
 * @param line - The line as the statement carries it.
 * @returns The line in lower case, its whitespace runs reduced to one space.
 */
function flatten(line: string): string {
  return line.replace(WHITESPACE_RUN, " ").trim().toLowerCase();
}

/**
 * Says whether any line of a remittance text contains a host.
 *
 * @param lines - The remittance text, line by line.
 * @param host - The host, lower case.
 * @returns `true` when a line contains it, whatever its case and spacing.
 *
 * @remarks
 * Contained rather than equal. Exact comparison would lose every payment whose
 * text a bank shortened or a person typed differently, and a stranger's
 * remittance line does not carry this host by accident.
 */
function containsHost(lines: string[], host: string): boolean {
  return lines.some((line) => flatten(line).includes(host));
}

/**
 * Says whether a payment names musiccloud in its remittance text.
 *
 * @param lines - The remittance text, line by line.
 * @returns `true` when any line contains {@link SPONSORING_REMITTANCE_MARKER}.
 */
export function carriesSiteMarker(lines: string[]): boolean {
  return containsHost(lines, SPONSORING_REMITTANCE_MARKER);
}

/**
 * Says whether a payment names another project paid into the same account.
 *
 * @param lines - The remittance text, line by line.
 * @returns `true` when any line contains one of {@link OTHER_PROJECT_HOSTS},
 *   matched as {@link carriesSiteMarker} matches musiccloud's, so a text naming
 *   both is recognized as naming the other one.
 */
export function namesOtherProject(lines: string[]): boolean {
  return OTHER_PROJECT_HOSTS.some((host) => containsHost(lines, host));
}

/**
 * Finds the creditor reference a payment carries, and says whether it is
 * musiccloud's.
 *
 * @param lines - The remittance text, line by line.
 * @returns `own` with the stored reference when the text carries one in
 *   musiccloud's form, `foreign` when it carries only references of other
 *   payees, and `null` when it carries none whose check digits hold.
 *
 * @remarks
 * The lines are read as one text, because a bank splits a remittance text
 * wherever it likes, even inside a reference. The text is cut into words at
 * anything that is not a letter or a digit, and a reference starts at a word
 * opening with `RF` and two digits. Whole words make the boundary: a reference
 * glued onto the word in front of it or the characters after it is not the one
 * that was printed, and is not taken.
 *
 * A reference printed in groups of four arrives as several words, so each
 * starting word is joined with the ones after it, up to the longest reference
 * ISO 11649 allows, and every join is checked. The check digits decide: a
 * reference that arrived damaged fails them, so a near miss never lands on
 * somebody else's request. A reference in musiccloud's form wins over any other
 * the text carries.
 */
export function findCreditorReference(lines: string[]): FoundReference | null {
  const words = lines.join(" ").toUpperCase().split(WORD_SEPARATOR).filter(Boolean);
  let foreign = false;

  for (let start = 0; start < words.length; start++) {
    if (!REFERENCE_START.test(words[start] ?? "")) continue;

    let candidate = "";
    for (let end = start; end < words.length; end++) {
      candidate += words[end];
      if (candidate.length > MAX_CREDITOR_REFERENCE_LENGTH) break;

      const reference = normalizeCreditorReference(candidate);
      if (!reference) continue;
      const own = normalizeSponsorshipReference(reference);
      if (own) return { kind: "own", reference: own };
      foreign = true;
    }
  }

  return foreign ? { kind: "foreign" } : null;
}

/**
 * Says whether a payment can stand in the ledger as it arrived.
 *
 * @param transaction - The entry as it came back.
 * @returns `true` for a whole, positive number of cents in {@link DONATION_CURRENCY}.
 *   The ledger carries no other currency, so a payment in another one would be
 *   counted as though it were euros.
 */
function isBookable(transaction: BankTransaction): boolean {
  return (
    transaction.currency === DONATION_CURRENCY &&
    Number.isInteger(transaction.amountCents) &&
    transaction.amountCents > 0
  );
}

/**
 * Decides what one entry is, without looking anything up.
 *
 * @param transaction - The entry as it came back.
 * @returns What to do with it.
 *
 * @remarks
 * The account is a private one, carrying salary, rent and shopping, and
 * lmaa.space is paid into it as well. Anything this does not recognize as
 * musiccloud's is nothing to do with it, and it leaves here unstored,
 * uncounted and unlogged. That is the whole reason the decision is a positive
 * list rather than a filter with an exception.
 *
 * Whose a payment is comes first. A text naming lmaa.space, or a reference some
 * other payee issued, is not musiccloud's even where it also names musiccloud,
 * because a payment can only be counted in one ledger. Only a payment that is
 * musiccloud's is then measured for whether it can be booked.
 */
export function classifyTransaction(transaction: BankTransaction): TransactionClass {
  const lines = transaction.remittanceLines;
  if (namesOtherProject(lines)) return { kind: "ignore" };

  const found = findCreditorReference(lines);
  if (found?.kind === "foreign") return { kind: "ignore" };

  const claimed: TransactionClass | null = found
    ? { kind: "sponsorship", reference: found.reference }
    : carriesSiteMarker(lines)
      ? { kind: "donation" }
      : null;
  if (!claimed) return { kind: "ignore" };

  return isBookable(transaction) ? claimed : { kind: "unbookable" };
}

/**
 * Says whether an error is the ledger refusing an entry it already holds.
 *
 * @param error - What the driver threw.
 * @returns `true` only for a unique violation of {@link EXTERNAL_REF_UNIQUE_INDEX}.
 */
function isEntryAlreadyBooked(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === PG_UNIQUE_VIOLATION &&
    "constraint" in error &&
    error.constraint === EXTERNAL_REF_UNIQUE_INDEX
  );
}

/**
 * The name a payment is booked under: the statement's, whole, cut at what the
 * ledger's editor accepts back, {@link DONATION_LIMITS} `nameMaxLength`.
 *
 * @param transaction - The entry as it came back.
 * @returns The name, empty where the statement named nobody.
 */
function payerNameOf(transaction: BankTransaction): string {
  return transaction.payerName.slice(0, DONATION_LIMITS.nameMaxLength);
}

/**
 * Takes one recognized payment into the ledger, or completes what stands there.
 *
 * @param transaction - The entry as it came back.
 * @param classified - What the entry was decided to be.
 * @returns What became of it.
 *
 * @remarks
 * A reference in musiccloud's form is booked only where musiccloud issued it.
 * Where its request still stands, the existing takeover turns it into a sponsor
 * and a donation linked to them. Where the request is gone but the reference
 * was issued, as with one already taken over or expired, the payment still goes
 * into the ledger, without a sponsor beside it and with the reference in its
 * note, as the takeover writes it.
 *
 * The second read over a day is the ordinary case rather than the exception:
 * the window reaches back further than the interval, and the owner may ask for
 * days read months ago. Such a read therefore completes what stands in the
 * ledger rather than stopping at the unique index, and only a name the stored
 * row lacks is written.
 */
async function importTransaction(
  transaction: BankTransaction,
  classified: Extract<TransactionClass, { kind: "sponsorship" | "donation" }>,
): Promise<ImportOutcome> {
  const externalRef = `${EXTERNAL_REF_PREFIX}:${transaction.entryReference}`;

  try {
    if (classified.kind === "sponsorship") {
      const taken = await takeOverPendingSponsorshipByReference(
        classified.reference,
        { amountCents: transaction.amountCents, paidOn: transaction.bookedOn },
        externalRef,
      );
      if (taken.ok) return "imported";
      if (!(await wasSponsorshipReferenceIssued(classified.reference))) return "ignored";
    }

    await insertDonation(
      getDatabasePool(),
      {
        // The name as the statement writes it. Only reached where no request
        // matched; where one did, the name comes from the form its owner
        // filled in, which is the better of the two.
        name: payerNameOf(transaction),
        published: false,
        amountCents: transaction.amountCents,
        receivedOn: transaction.bookedOn,
        provider: DonationProvider.BankTransfer,
        note: classified.kind === "sponsorship" ? `Sponsorship ${formatCreditorReference(classified.reference)}` : "",
        sponsorId: null,
      },
      externalRef,
    );
    return "imported";
  } catch (error) {
    // The same entry read a second time. This is the ordinary case rather than
    // a fault, so what the entry can still add is added and the rest is left.
    if (!isEntryAlreadyBooked(error)) throw error;
    return (await fillDonationPayerName(externalRef, payerNameOf(transaction))) ? "filled" : "skipped";
  }
}

/**
 * Where a read starts when nobody asked for a day.
 *
 * @param now - The moment the read counts back from.
 * @param lookbackDays - How far back to reach.
 * @returns The first day of the window, `YYYY-MM-DD`.
 */
function defaultFrom(now: Date, lookbackDays: number): string {
  return utcDay(new Date(now.getTime() - lookbackDays * DAY_MS));
}

/**
 * Warns the owner that the consent has lapsed, without letting a failed mail
 * decide what the read answers.
 *
 * @remarks
 * A warning that could not go out is not recorded as said, so the next check
 * tries again; the read still answers that the consent has lapsed.
 */
async function warnConsentLapsed(): Promise<void> {
  try {
    await announceConsentRefused();
  } catch (error) {
    log.deviation(
      {
        component: LOG_COMPONENT,
        errorCode: UNSENT_WARNING_ERROR_CODE,
        operation: "bank_read",
        outcome: "lapsed_warning_not_sent",
      },
      error,
    );
  }
}

/**
 * Reads the account and books what belongs to musiccloud.
 *
 * @param kind - Whether the background run or the owner asked.
 * @param options - The day to start at, which only the owner's Read now passes.
 * @param logger - Where the run's line goes once it finished.
 * @returns What the read did, or why it did nothing.
 *
 * @remarks
 * Nothing is asked and nothing is written where the consent has lapsed. A
 * lapsed connection must never read as a period without donations, so the run
 * stops, warns the owner, and says so rather than recording a day on which it
 * found nothing.
 *
 * What goes to the log is how many entries were read, imported, filled,
 * skipped and refused as unbookable, and the window. No amount, no reference,
 * no remittance text, no payer name and no account number, because the account
 * is private and most of what passes through it is somebody's ordinary life.
 */
export async function runBankIngestion(
  kind: BankReadKind,
  options: BankReadRequest,
  logger: BankIngestionLogger,
): Promise<BankReadResult> {
  const connection = await getLiveBankConnection();
  if (!connection) return { ran: false, reason: BankReadSkip.NotConnected };

  const now = new Date();
  if (connection.consentValidUntil && connection.consentValidUntil.getTime() <= now.getTime()) {
    log.warn(LOG_COMPONENT, "the bank consent has lapsed, so the account is not read");
    // What actually happened rather than what the date predicted, so the owner
    // is told even where the bank withdrew earlier than it promised.
    await warnConsentLapsed();
    return { ran: false, reason: BankReadSkip.ConsentExpired };
  }

  const claimed = await claimBankRead(
    kind,
    kind === "background" ? BACKGROUND_READS_PER_WINDOW : MANUAL_READS_PER_WINDOW,
    READ_WINDOW_HOURS,
    now,
  );
  if (!claimed) return { ran: false, reason: BankReadSkip.BudgetSpent };

  // Both ends counted from today, so the start can never overshoot the end.
  // The first read reaches further back, because nothing is recorded yet and
  // the account may already carry months of payments.
  const lookbackDays = (await getLastBookedThrough()) ? RECENT_LOOKBACK_DAYS : FIRST_RUN_LOOKBACK_DAYS;
  const to = utcDay(now);
  // A day that was asked for wins over the default in both directions: asking
  // for more is how history gets read again, and asking for less is a smaller
  // question the owner is entitled to. It is held at today, because a start
  // after the end is the range the bank refuses outright.
  const from = options.from && options.from <= to ? options.from : defaultFrom(now, lookbackDays);

  let read = 0;
  let imported = 0;
  let filled = 0;
  let skipped = 0;
  // Payments that are musiccloud's by their text but cannot be booked as they
  // arrived. The log line counts them so the case is known; nothing else about
  // them is kept.
  let unbookable = 0;
  let continuationKey: string | undefined;

  // The failure is caught rather than left to escape, so the claimed read
  // carries its reason and the card can name it.
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const answer = await fetchTransactions(connection.accountUid, { from, to }, continuationKey);
      read += answer.transactions.length;

      for (const transaction of answer.transactions) {
        const classified = classifyTransaction(transaction);

        // Money leaving is never a donation. One that carries a marker is a
        // returned payment, which this run does not net off; it says so
        // instead, so the case is known if it ever happens.
        if (!transaction.isCredit) {
          if (classified.kind !== "ignore") {
            log.warn(LOG_COMPONENT, "a payment leaving the account carried musiccloud's marker", {
              bookedOn: transaction.bookedOn,
            });
          }
          continue;
        }

        if (classified.kind === "ignore") continue;
        if (classified.kind === "unbookable") {
          unbookable += 1;
          continue;
        }

        const outcome = await importTransaction(transaction, classified);
        if (outcome === "imported") imported += 1;
        else if (outcome === "filled") filled += 1;
        else if (outcome === "skipped") skipped += 1;
      }

      if (!answer.continuationKey) break;
      continuationKey = answer.continuationKey;
    }
  } catch (error) {
    const failure: BankErrorCodeValue = error instanceof BankConnectionError ? error.code : BankErrorCode.ReadFailed;
    await failBankRead(claimed.id, failure);
    // The client already logged a failure of its own with the path and the
    // status, so only a failure it did not name carries its cause here.
    log.deviation(
      { component: LOG_COMPONENT, errorCode: failure, operation: "bank_read", outcome: "read_failed", kind, from, to },
      error instanceof BankConnectionError ? undefined : error,
    );
    return { ran: false, reason: BankReadSkip.ReadFailed, failure };
  }

  await completeBankRead(claimed.id, { bookedThrough: to, transactionsRead: read, imported, filled, skipped });

  logger.info(
    { component: LOG_COMPONENT, operation: "bank_read", kind, from, to, read, imported, filled, skipped, unbookable },
    "bank account read",
  );

  return { ran: true, from, to, read, imported, filled, skipped };
}

/**
 * Starts everything the bank connection does on its own, and does one round
 * at once.
 *
 * @param logger - Where the start and every finished read say so, such as the Fastify logger.
 * @returns The timer, unreferenced so it never keeps the process alive, for shutdown to clear.
 *
 * @remarks
 * Two jobs on one timer, because both are about the same connection and both
 * want the same rhythm. The warning about a lapsing consent goes first and runs
 * whatever the read then does, since a consent that has run out is exactly when
 * the read will not happen.
 *
 * The interval is not what keeps the read inside its cap. A deployment restarts
 * it, and two containers briefly hold one each, so the cap comes from the
 * stored reads that `claimBankRead` counts. The interval only decides how
 * often the question is asked.
 */
export function startBankWorker(logger: BankIngestionLogger): NodeJS.Timeout {
  const tick = () => {
    void announceConsentStage().catch((error) =>
      log.deviation(
        {
          component: LOG_COMPONENT,
          errorCode: UNSENT_WARNING_ERROR_CODE,
          operation: "bank_consent_notice",
          outcome: "warning_not_sent",
        },
        error,
      ),
    );
    void runBankIngestion("background", {}, logger).catch((error) =>
      log.deviation(
        {
          component: LOG_COMPONENT,
          errorCode: BankErrorCode.ReadFailed,
          operation: "bank_read",
          outcome: "background_read_not_started",
        },
        error,
      ),
    );
  };

  tick();
  const timer = setInterval(tick, BACKGROUND_INTERVAL_MS);
  timer.unref();
  logger.info({ component: LOG_COMPONENT, intervalMs: BACKGROUND_INTERVAL_MS }, "bank worker started");
  return timer;
}
