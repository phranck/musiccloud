/**
 * @file Tests for the bank import, ported from lmaa.space
 * (`apps/backend/src/__tests__/bank-ingestion.test.ts`) with musiccloud's
 * matching rules: its own `MCSP` references and `musiccloud.io` count, and any
 * lmaa.space marker excludes a transfer. The bank client, the stores, the
 * ledger, the takeover and the consent warnings are mocked.
 */
import { BankErrorCode, buildCreditorReference, DonationProvider, formatCreditorReference } from "@musiccloud/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTransactions: vi.fn(),
  claimBankRead: vi.fn(),
  completeBankRead: vi.fn(),
  failBankRead: vi.fn(),
  getLastBookedThrough: vi.fn(),
  getLiveBankConnection: vi.fn(),
  insertDonation: vi.fn(),
  fillDonationPayerName: vi.fn(),
  takeOverPendingSponsorshipByReference: vi.fn(),
  wasSponsorshipReferenceIssued: vi.fn(),
  announceConsentRefused: vi.fn(),
  announceConsentStage: vi.fn(),
}));

vi.mock("./enable-banking-client.js", () => ({ fetchTransactions: mocks.fetchTransactions }));
vi.mock("./bank-read-store.js", () => ({
  claimBankRead: mocks.claimBankRead,
  completeBankRead: mocks.completeBankRead,
  failBankRead: mocks.failBankRead,
  getLastBookedThrough: mocks.getLastBookedThrough,
}));
vi.mock("./bank-connection-store.js", () => ({ getLiveBankConnection: mocks.getLiveBankConnection }));
vi.mock("./donations.js", () => ({
  insertDonation: mocks.insertDonation,
  fillDonationPayerName: mocks.fillDonationPayerName,
}));
vi.mock("./pending-sponsorships.js", () => ({
  takeOverPendingSponsorshipByReference: mocks.takeOverPendingSponsorshipByReference,
  wasSponsorshipReferenceIssued: mocks.wasSponsorshipReferenceIssued,
}));
vi.mock("./bank-consent.js", () => ({
  announceConsentRefused: mocks.announceConsentRefused,
  announceConsentStage: mocks.announceConsentStage,
}));
vi.mock("../db/pool.js", () => ({ getDatabasePool: () => ({}) }));

import { BankConnectionError } from "./bank-connection-error.js";
import {
  carriesSiteMarker,
  classifyTransaction,
  findCreditorReference,
  namesOtherProject,
  runBankIngestion,
} from "./bank-ingestion.js";
import type { BankTransaction } from "./enable-banking-client.js";

/**
 * A reference of the form musiccloud's sponsor form issues: `MCSP` and twelve
 * drawn characters. Built rather than written out, because the check digits
 * are what these tests turn on.
 */
const ISSUED = buildCreditorReference("MCSP7Q2K9X4M8T3B");

/** A reference lmaa.space issues on its own sponsor form, which pays into the same account. */
const LMAA = buildCreditorReference("SPON2ABCD3EFGH4J");

/** A sound reference some other payee issued, such as a shop refunding an order. */
const MERCHANT = buildCreditorReference("539007547034");

/** A reference that opens with musiccloud's tag but has a body the form never draws. */
const MCSP_WRONG_LENGTH = buildCreditorReference("MCSP7Q2K9X4M8T3");

/** The ledger key every booked entry of these cases gets. */
const EXTERNAL_REF = "sepa:entry-1";

/**
 * What the driver throws when the entry is already in the ledger: the shape
 * `pg` gives a unique violation, naming the index it ran into.
 */
function entryAlreadyStored(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint "uq_donations_external_ref"'), {
    code: "23505",
    constraint: "uq_donations_external_ref",
  });
}

/**
 * One entry of the account, with everything a decision needs.
 *
 * @param overrides - The fields that differ from a plain musiccloud donation.
 */
function transaction(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    entryReference: "entry-1",
    amountCents: 2_500,
    currency: "EUR",
    isCredit: true,
    bookedOn: "2026-09-01",
    remittanceLines: ["Donation: musiccloud.io"],
    payerName: "Anna von Trapp",
    ...overrides,
  };
}

/** A logger that records what each run says. */
const logger = { info: vi.fn() };

describe("finding a creditor reference", () => {
  const own = { kind: "own", reference: ISSUED };

  it("finds musiccloud's reference standing alone on a line", () => {
    expect(findCreditorReference([ISSUED])).toEqual(own);
  });

  it("finds one inside a sentence, on whichever line it landed", () => {
    expect(findCreditorReference(["Transfer", `Purpose ${ISSUED} thanks`])).toEqual(own);
  });

  it("reads one back that arrived in lower case", () => {
    // ISO/IEC 7064 reads the two cases as one number, so a bank that lowercased
    // it still hands back the reference that was issued.
    expect(findCreditorReference([ISSUED.toLowerCase()])).toEqual(own);
  });

  it("finds one printed in groups of four, the way the site shows it", () => {
    expect(findCreditorReference([`Sponsor ${formatCreditorReference(ISSUED)} thanks`])).toEqual(own);
  });

  it("finds one a bank split across two lines", () => {
    const printed = formatCreditorReference(ISSUED);
    expect(findCreditorReference([printed.slice(0, 12), printed.slice(12)])).toEqual(own);
  });

  it("finds one followed by punctuation", () => {
    expect(findCreditorReference([`Ref.:${ISSUED}.`])).toEqual(own);
  });

  it("does not take one that runs on into other characters", () => {
    expect(findCreditorReference([`${ISSUED}X`])?.kind).not.toBe("own");
  });

  it("does not take one glued onto a word in front of it", () => {
    expect(findCreditorReference([`ABC${ISSUED}`])).toBeNull();
  });

  it("refuses one whose check digits do not hold", () => {
    // A single character changed. The check digits are what stop a damaged
    // reference landing on somebody else's request.
    const damaged = `${ISSUED.slice(0, -1)}${ISSUED.endsWith("H") ? "J" : "H"}`;
    expect(findCreditorReference([damaged])).toBeNull();
  });

  it("calls another payee's sound reference foreign", () => {
    expect(findCreditorReference([`Refund ${MERCHANT}`])).toEqual({ kind: "foreign" });
  });

  it("calls an lmaa.space reference foreign, printed either way", () => {
    expect(findCreditorReference([LMAA])).toEqual({ kind: "foreign" });
    expect(findCreditorReference([formatCreditorReference(LMAA)])).toEqual({ kind: "foreign" });
  });

  it("calls a reference with musiccloud's tag but another length foreign", () => {
    expect(findCreditorReference([MCSP_WRONG_LENGTH])).toEqual({ kind: "foreign" });
  });

  it("finds nothing in an ordinary remittance text", () => {
    expect(findCreditorReference(["Rent September", "Salary"])).toBeNull();
  });
});

describe("recognizing lmaa.space on the account", () => {
  it("finds lmaa.space's host", () => {
    expect(namesOtherProject(["Spende lmaa.space"])).toBe(true);
  });

  it("finds it whatever the case and spacing", () => {
    expect(namesOtherProject(["SPENDE:   LMAA.SPACE"])).toBe(true);
  });

  it("finds nothing in a text naming musiccloud alone", () => {
    expect(namesOtherProject(["Donation: musiccloud.io"])).toBe(false);
  });
});

describe("recognizing musiccloud's own marker", () => {
  it("finds it whatever the case", () => {
    expect(carriesSiteMarker(["DONATION: MUSICCLOUD.IO"])).toBe(true);
  });

  it("finds it inside a longer line", () => {
    expect(carriesSiteMarker(["Purpose Donation: musiccloud.io many thanks"])).toBe(true);
  });

  it("finds it after a bank has stretched the spacing", () => {
    expect(carriesSiteMarker(["Donation:    musiccloud.io"])).toBe(true);
  });

  it("does not find it in an unrelated line", () => {
    expect(carriesSiteMarker(["Rent September", "Supermarket"])).toBe(false);
  });
});

describe("deciding what an entry is", () => {
  it("takes a reference over the marker where both are there", () => {
    expect(classifyTransaction(transaction({ remittanceLines: [`${ISSUED} Sponsor: musiccloud.io`] }))).toEqual({
      kind: "sponsorship",
      reference: ISSUED,
    });
  });

  it("takes the marker where there is no reference", () => {
    expect(classifyTransaction(transaction())).toEqual({ kind: "donation" });
  });

  it("takes a reference printed in groups of four", () => {
    expect(classifyTransaction(transaction({ remittanceLines: [formatCreditorReference(ISSUED)] }))).toEqual({
      kind: "sponsorship",
      reference: ISSUED,
    });
  });

  it("ignores an unrelated transfer", () => {
    // A private account carries salary, rent and shopping, and none of it is a donation.
    expect(classifyTransaction(transaction({ remittanceLines: ["Salary"] }))).toEqual({ kind: "ignore" });
  });

  it("ignores another payee's reference, even beside musiccloud's host", () => {
    expect(classifyTransaction(transaction({ remittanceLines: [`${MERCHANT} musiccloud.io`] }))).toEqual({
      kind: "ignore",
    });
  });

  it("ignores an lmaa.space sponsor's reference", () => {
    expect(classifyTransaction(transaction({ remittanceLines: [LMAA] }))).toEqual({ kind: "ignore" });
  });

  it("ignores an lmaa.space reference that also names musiccloud", () => {
    expect(classifyTransaction(transaction({ remittanceLines: [`${LMAA} Donation musiccloud.io`] }))).toEqual({
      kind: "ignore",
    });
  });

  it("ignores a text naming both projects", () => {
    // The money can only be counted once, and where the text does not say whose
    // it is, it belongs to neither ledger until a person decides.
    expect(classifyTransaction(transaction({ remittanceLines: ["lmaa.space / musiccloud.io"] }))).toEqual({
      kind: "ignore",
    });
  });

  it("ignores musiccloud's reference beside lmaa.space's host", () => {
    expect(classifyTransaction(transaction({ remittanceLines: [`${ISSUED} lmaa.space`] }))).toEqual({
      kind: "ignore",
    });
  });

  it("ignores a text naming lmaa.space alone", () => {
    expect(classifyTransaction(transaction({ remittanceLines: ["Spende: lmaa.space"] }))).toEqual({ kind: "ignore" });
  });

  it("refuses to book a payment in another currency", () => {
    // 100 dollars would otherwise be stored as 10000 cents and counted as euros.
    expect(classifyTransaction(transaction({ currency: "USD" }))).toEqual({ kind: "unbookable" });
  });

  it("refuses to book a payment that names no currency", () => {
    expect(classifyTransaction(transaction({ currency: "" }))).toEqual({ kind: "unbookable" });
  });

  it("refuses to book a payment of nothing", () => {
    expect(classifyTransaction(transaction({ amountCents: 0 }))).toEqual({ kind: "unbookable" });
  });

  it("refuses to book a sponsorship whose amount the bank left empty", () => {
    expect(classifyTransaction(transaction({ amountCents: 0, remittanceLines: [ISSUED] }))).toEqual({
      kind: "unbookable",
    });
  });

  it("leaves a foreign-currency entry that is not musiccloud's ignored", () => {
    // Shopping abroad is nothing to do with musiccloud, so it is not even counted.
    expect(classifyTransaction(transaction({ currency: "USD", remittanceLines: ["Amazon"] }))).toEqual({
      kind: "ignore",
    });
  });
});

describe("a read of the account", () => {
  const connection = {
    id: "c1",
    sessionId: "session-1",
    accountUid: "account-1",
    aspspName: "Erste Bank",
    aspspCountry: "AT",
    consentValidUntil: new Date("2027-01-01T00:00:00.000Z"),
    revokedAt: null,
    consentNoticeStage: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Only the clock, so nothing here waits on a timer that never fires. The
    // range a read asks for is counted from today, which these tests pin down.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-04T11:46:00.000Z"));
    mocks.getLiveBankConnection.mockResolvedValue(connection);
    mocks.claimBankRead.mockResolvedValue({ id: "read-1" });
    mocks.getLastBookedThrough.mockResolvedValue("2026-08-30");
    mocks.insertDonation.mockResolvedValue({ id: "d1" });
    mocks.fillDonationPayerName.mockResolvedValue(false);
    mocks.takeOverPendingSponsorshipByReference.mockResolvedValue({ ok: true });
    mocks.wasSponsorshipReferenceIssued.mockResolvedValue(true);
    mocks.announceConsentRefused.mockResolvedValue(undefined);
    mocks.fetchTransactions.mockResolvedValue({ transactions: [], continuationKey: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Has the bank answer one page holding the given entries.
   *
   * @param entries - What the page carries.
   */
  function bankAnswers(...entries: BankTransaction[]) {
    mocks.fetchTransactions.mockResolvedValue({ transactions: entries, continuationKey: null });
  }

  it("does nothing while no connection is in force", async () => {
    mocks.getLiveBankConnection.mockResolvedValue(null);

    expect(await runBankIngestion("background", {}, logger)).toEqual({ ran: false, reason: "not_connected" });
    expect(mocks.fetchTransactions).not.toHaveBeenCalled();
  });

  it("writes nothing once the consent has lapsed, and warns the owner", async () => {
    // A lapsed connection must never read as a period without donations, so it
    // stops rather than recording a day on which it found nothing.
    mocks.getLiveBankConnection.mockResolvedValue({ ...connection, consentValidUntil: new Date("2020-01-01") });

    expect(await runBankIngestion("background", {}, logger)).toEqual({ ran: false, reason: "consent_expired" });
    expect(mocks.announceConsentRefused).toHaveBeenCalledTimes(1);
    expect(mocks.claimBankRead).not.toHaveBeenCalled();
    expect(mocks.fetchTransactions).not.toHaveBeenCalled();
    expect(mocks.completeBankRead).not.toHaveBeenCalled();
  });

  it("still answers that the consent lapsed when the warning cannot go out", async () => {
    mocks.getLiveBankConnection.mockResolvedValue({ ...connection, consentValidUntil: new Date("2020-01-01") });
    mocks.announceConsentRefused.mockRejectedValue(new Error("no template bound"));

    expect(await runBankIngestion("manual", {}, logger)).toEqual({ ran: false, reason: "consent_expired" });
  });

  it("does not ask the bank when the budget for the window is spent", async () => {
    mocks.claimBankRead.mockResolvedValue(null);

    expect(await runBankIngestion("background", {}, logger)).toEqual({ ran: false, reason: "budget_spent" });
    expect(mocks.fetchTransactions).not.toHaveBeenCalled();
  });

  it("draws the background run on four reads a day and the owner on a budget of their own", async () => {
    await runBankIngestion("background", {}, logger);
    await runBankIngestion("manual", {}, logger);

    expect(mocks.claimBankRead).toHaveBeenNthCalledWith(1, "background", 4, 24, expect.any(Date));
    expect(mocks.claimBankRead).toHaveBeenNthCalledWith(2, "manual", 60, 24, expect.any(Date));
  });

  it("reaches five days back from today, whatever it read last", async () => {
    await runBankIngestion("background", {}, logger);

    expect(mocks.fetchTransactions).toHaveBeenCalledWith(
      "account-1",
      { from: "2026-08-30", to: "2026-09-04" },
      undefined,
    );
  });

  it("asks for a range the bank can answer when it already read today", async () => {
    // The bank refuses a range whose start is after its end.
    mocks.getLastBookedThrough.mockResolvedValue("2026-09-04");

    await runBankIngestion("manual", {}, logger);

    expect(mocks.fetchTransactions).toHaveBeenCalledWith(
      "account-1",
      { from: "2026-08-30", to: "2026-09-04" },
      undefined,
    );
  });

  it("reaches ninety days back on the very first read", async () => {
    mocks.getLastBookedThrough.mockResolvedValue(null);

    await runBankIngestion("background", {}, logger);

    expect(mocks.fetchTransactions).toHaveBeenCalledWith(
      "account-1",
      { from: "2026-06-06", to: "2026-09-04" },
      undefined,
    );
  });

  it("records why a read failed instead of letting the failure escape", async () => {
    mocks.fetchTransactions.mockRejectedValue(new BankConnectionError(BankErrorCode.RequestRefused));

    const result = await runBankIngestion("manual", {}, logger);

    expect(result).toEqual({ ran: false, reason: "read_failed", failure: BankErrorCode.RequestRefused });
    expect(mocks.failBankRead).toHaveBeenCalledWith("read-1", BankErrorCode.RequestRefused);
    expect(mocks.completeBankRead).not.toHaveBeenCalled();
  });

  it("names a failure the bank client did not, rather than showing nothing", async () => {
    mocks.fetchTransactions.mockRejectedValue(new Error("something else entirely"));

    const result = await runBankIngestion("manual", {}, logger);

    expect(result).toEqual({ ran: false, reason: "read_failed", failure: BankErrorCode.ReadFailed });
    expect(mocks.failBankRead).toHaveBeenCalledWith("read-1", BankErrorCode.ReadFailed);
  });

  it("books a free donation that names musiccloud.io", async () => {
    bankAnswers(transaction());

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ ran: true, read: 1, imported: 1, skipped: 0 });
    expect(mocks.insertDonation).toHaveBeenCalledWith(
      expect.anything(),
      {
        // The whole name in one field, because the statement gives one string.
        name: "Anna von Trapp",
        published: false,
        amountCents: 2_500,
        receivedOn: "2026-09-01",
        provider: DonationProvider.BankTransfer,
        note: "",
        sponsorId: null,
      },
      EXTERNAL_REF,
    );
  });

  it("books a payment whose statement named nobody without a name", async () => {
    bankAnswers(transaction({ payerName: "" }));

    await runBankIngestion("background", {}, logger);

    expect(mocks.insertDonation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "" }),
      EXTERNAL_REF,
    );
  });

  it("cuts a name at what the ledger's editor accepts back", async () => {
    bankAnswers(transaction({ payerName: "N".repeat(200) }));

    await runBankIngestion("background", {}, logger);

    expect(mocks.insertDonation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "N".repeat(160) }),
      EXTERNAL_REF,
    );
  });

  it("turns a request's reference into its sponsor through the takeover", async () => {
    bankAnswers(transaction({ remittanceLines: [formatCreditorReference(ISSUED)] }));

    const result = await runBankIngestion("background", {}, logger);

    expect(mocks.takeOverPendingSponsorshipByReference).toHaveBeenCalledWith(
      ISSUED,
      { amountCents: 2_500, paidOn: "2026-09-01" },
      EXTERNAL_REF,
    );
    expect(mocks.insertDonation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ imported: 1 });
  });

  it("still books a payment under a reference musiccloud issued whose request is gone", async () => {
    // A request already taken over, or one that expired, looks exactly like
    // this. musiccloud issued the reference, and the money still arrived.
    mocks.takeOverPendingSponsorshipByReference.mockResolvedValue({ ok: false, reason: "not_found" });
    bankAnswers(transaction({ remittanceLines: [ISSUED] }));

    const result = await runBankIngestion("background", {}, logger);

    expect(mocks.wasSponsorshipReferenceIssued).toHaveBeenCalledWith(ISSUED);
    expect(result).toMatchObject({ imported: 1 });
    expect(mocks.insertDonation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ note: `Sponsorship ${formatCreditorReference(ISSUED)}`, sponsorId: null }),
      EXTERNAL_REF,
    );
  });

  it("books nothing under a reference of musiccloud's form it never issued", async () => {
    // A reference anybody can build with the right check digits is not a
    // payment to musiccloud until musiccloud is the one that issued it.
    mocks.takeOverPendingSponsorshipByReference.mockResolvedValue({ ok: false, reason: "not_found" });
    mocks.wasSponsorshipReferenceIssued.mockResolvedValue(false);
    bankAnswers(transaction({ remittanceLines: [`${ISSUED} musiccloud.io`] }));

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ read: 1, imported: 0, filled: 0, skipped: 0 });
    expect(mocks.insertDonation).not.toHaveBeenCalled();
  });

  it("never books an lmaa.space transfer, even one naming musiccloud too", async () => {
    bankAnswers(
      transaction({ remittanceLines: [LMAA, "Spende lmaa.space"] }),
      transaction({ entryReference: "entry-2", remittanceLines: [`${LMAA} musiccloud.io`] }),
      transaction({ entryReference: "entry-3", remittanceLines: [`${ISSUED} lmaa.space`] }),
    );

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ read: 3, imported: 0, skipped: 0 });
    expect(mocks.takeOverPendingSponsorshipByReference).not.toHaveBeenCalled();
    expect(mocks.insertDonation).not.toHaveBeenCalled();
  });

  it("books only euro credits above zero, and counts the rest in the log line alone", async () => {
    bankAnswers(transaction({ currency: "USD" }), transaction({ entryReference: "entry-2", amountCents: 0 }));

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ read: 2, imported: 0, filled: 0, skipped: 0 });
    expect(mocks.insertDonation).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ unbookable: 2 }), "bank account read");
  });

  it("logs counts and the window, and nothing about any entry", async () => {
    bankAnswers(transaction({ remittanceLines: [ISSUED, "musiccloud.io"], payerName: "Anna von Trapp" }));

    await runBankIngestion("background", {}, logger);

    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ from: "2026-08-30", to: "2026-09-04", read: 1, imported: 1 }),
      "bank account read",
    );
    expect(logged).not.toContain("2500");
    expect(logged).not.toContain(ISSUED);
    expect(logged).not.toContain("musiccloud.io");
    expect(logged).not.toContain("Anna");
    expect(logged).not.toContain("account-1");
  });

  it("never takes money leaving the account, however it is marked", async () => {
    bankAnswers(
      transaction({ isCredit: false }),
      transaction({ entryReference: "entry-2", isCredit: false, remittanceLines: [ISSUED] }),
    );

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ read: 2, imported: 0 });
    expect(mocks.insertDonation).not.toHaveBeenCalled();
    expect(mocks.takeOverPendingSponsorshipByReference).not.toHaveBeenCalled();
  });

  it("leaves everything it does not recognize alone", async () => {
    bankAnswers(
      transaction({ remittanceLines: ["Salary August"] }),
      transaction({ entryReference: "entry-2", remittanceLines: ["Rent"] }),
    );

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ read: 2, imported: 0, skipped: 0 });
    expect(mocks.insertDonation).not.toHaveBeenCalled();
  });

  it("recognizes an entry it already booked and never books it twice", async () => {
    mocks.insertDonation.mockRejectedValue(entryAlreadyStored());
    bankAnswers(transaction());

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ imported: 0, filled: 0, skipped: 1 });
  });

  it("recognizes a sponsorship it already booked when the takeover runs into the same entry", async () => {
    mocks.takeOverPendingSponsorshipByReference.mockRejectedValue(entryAlreadyStored());
    bankAnswers(transaction({ remittanceLines: [ISSUED] }));

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ imported: 0, skipped: 1 });
  });

  it("gives a payment it already holds the name it was stored without", async () => {
    mocks.insertDonation.mockRejectedValue(entryAlreadyStored());
    mocks.fillDonationPayerName.mockResolvedValue(true);
    bankAnswers(transaction());

    const result = await runBankIngestion("background", {}, logger);

    expect(mocks.fillDonationPayerName).toHaveBeenCalledWith(EXTERNAL_REF, "Anna von Trapp");
    // Apart from skipped, because a read that repaired rows and one that
    // changed nothing must not report themselves the same way.
    expect(result).toMatchObject({ imported: 0, filled: 1, skipped: 0 });
  });

  it("lets a failure of the ledger that is not a repeat break the read off", async () => {
    mocks.insertDonation.mockRejectedValue(Object.assign(new Error("check violation"), { code: "23514" }));
    bankAnswers(transaction());

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toEqual({ ran: false, reason: "read_failed", failure: BankErrorCode.ReadFailed });
  });

  it("walks the pages the bank offers", async () => {
    mocks.fetchTransactions
      .mockResolvedValueOnce({ transactions: [transaction()], continuationKey: "next" })
      .mockResolvedValueOnce({ transactions: [transaction({ entryReference: "entry-2" })], continuationKey: null });

    const result = await runBankIngestion("background", {}, logger);

    expect(result).toMatchObject({ read: 2, imported: 2 });
    expect(mocks.fetchTransactions).toHaveBeenLastCalledWith("account-1", expect.anything(), "next");
  });

  it("stops after twenty pages, however often the bank offers another", async () => {
    mocks.fetchTransactions.mockResolvedValue({ transactions: [], continuationKey: "again" });

    const result = await runBankIngestion("background", {}, logger);

    expect(mocks.fetchTransactions).toHaveBeenCalledTimes(20);
    expect(result).toMatchObject({ ran: true });
  });

  it("records what it reached", async () => {
    await runBankIngestion("background", {}, logger);

    expect(mocks.completeBankRead).toHaveBeenCalledWith("read-1", {
      bookedThrough: "2026-09-04",
      transactionsRead: 0,
      imported: 0,
      filled: 0,
      skipped: 0,
    });
  });

  it("asks the bank for the day it was given rather than its own window", async () => {
    await runBankIngestion("manual", { from: "2026-06-01" }, logger);

    expect(mocks.fetchTransactions).toHaveBeenCalledWith(
      "account-1",
      { from: "2026-06-01", to: "2026-09-04" },
      undefined,
    );
  });

  it("ignores a day that falls after today, which the bank would refuse", async () => {
    await runBankIngestion("manual", { from: "2027-01-01" }, logger);

    expect(mocks.fetchTransactions).toHaveBeenCalledWith(
      "account-1",
      { from: "2026-08-30", to: "2026-09-04" },
      undefined,
    );
  });
});
