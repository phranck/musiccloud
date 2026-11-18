/**
 * @file Tests for the bank connection service, ported from lmaa.space
 * (`apps/backend/src/__tests__/bank-connection-service.test.ts`), with the
 * Enable Banking client and the store mocked.
 */
import { BankErrorCode } from "@musiccloud/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  closeSession: vi.fn(),
  createSession: vi.fn(),
  startAuthorization: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({ isEnableBankingConfigured: vi.fn(() => true) }));

const storeMocks = vi.hoisted(() => ({
  getLiveBankConnection: vi.fn(),
  insertAuthorizationState: vi.fn(),
  replaceBankConnection: vi.fn(),
  revokeLiveBankConnection: vi.fn(),
  takeAuthorizationState: vi.fn(),
}));

const readMocks = vi.hoisted(() => ({ getLastBankRead: vi.fn(), nextBackgroundReadAt: vi.fn() }));

vi.mock("./enable-banking-client.js", () => clientMocks);
vi.mock("../lib/enable-banking-config.js", () => configMocks);
vi.mock("./bank-connection-store.js", () => storeMocks);
vi.mock("./bank-read-store.js", () => ({ getLastBankRead: readMocks.getLastBankRead }));
vi.mock("./bank-read-schedule.js", () => ({ nextBackgroundReadAt: readMocks.nextBackgroundReadAt }));

import {
  beginBankAuthorization,
  completeBankAuthorization,
  disconnectBank,
  getBankConnectionStatus,
} from "./bank-connection.js";
import { BankConnectionError } from "./bank-connection-error.js";

/** A value of the shape and length the site issues. */
const ISSUED = "a".repeat(64);

/** Takes the service's information lines and drops them. */
const logger = { info: vi.fn() };

/** A connection as the store hands it back. */
const storedConnection = {
  id: "connection-1",
  sessionId: "session-that-never-leaves-the-backend",
  accountUid: "account-1",
  aspspName: "Erste Bank",
  aspspCountry: "AT",
  consentValidUntil: new Date("2027-03-02T00:00:00.000Z"),
  revokedAt: null,
  consentNoticeStage: null,
  createdAt: new Date("2026-09-03T10:00:00.000Z"),
};

/** A session as the client hands it back, reaching the one account. */
const session = {
  sessionId: storedConnection.sessionId,
  accountUids: ["account-1"],
  aspspName: "Erste Bank",
  aspspCountry: "AT",
  consentValidUntil: storedConnection.consentValidUntil,
};

describe("the bank connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DASHBOARD_URL", "https://dashboard.example");
    configMocks.isEnableBankingConfigured.mockReturnValue(true);
    readMocks.getLastBankRead.mockResolvedValue(null);
    readMocks.nextBackgroundReadAt.mockResolvedValue(null);
    clientMocks.closeSession.mockResolvedValue(undefined);
    storeMocks.insertAuthorizationState.mockImplementation(
      async (state: string, authorizationId: string, expiresAt: Date) => ({
        state,
        authorizationId,
        expiresAt,
        createdAt: new Date(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("what the dashboard is shown", () => {
    it("says so plainly when nothing is connected", async () => {
      storeMocks.getLiveBankConnection.mockResolvedValue(null);

      expect(await getBankConnectionStatus()).toEqual({
        configured: true,
        connected: false,
        institutionName: "",
        institutionCountry: "",
        consentValidUntil: null,
        connectedAt: null,
        lastReadAt: null,
        lastReadSucceeded: null,
        lastReadImported: 0,
        lastReadFilled: 0,
        lastReadFailure: null,
        nextReadAt: null,
      });
    });

    it("names the institution, the consent end and the connection day of the connection in force", async () => {
      storeMocks.getLiveBankConnection.mockResolvedValue(storedConnection);

      expect(await getBankConnectionStatus()).toMatchObject({
        connected: true,
        institutionName: "Erste Bank",
        institutionCountry: "AT",
        consentValidUntil: "2027-03-02T00:00:00.000Z",
        connectedAt: "2026-09-03T10:00:00.000Z",
      });
    });

    it("carries nothing that could reach the account", async () => {
      storeMocks.getLiveBankConnection.mockResolvedValue(storedConnection);

      const status = await getBankConnectionStatus();

      expect(status.connected).toBe(true);
      expect(JSON.stringify(status)).not.toContain(storedConnection.sessionId);
      expect(JSON.stringify(status)).not.toContain(storedConnection.accountUid);
    });

    it("reports the last read with its counts and the next background read", async () => {
      storeMocks.getLiveBankConnection.mockResolvedValue(storedConnection);
      readMocks.getLastBankRead.mockResolvedValue({
        readAt: new Date("2026-09-04T06:00:00.000Z"),
        succeeded: true,
        imported: 2,
        filled: 1,
        failureReason: null,
      });
      readMocks.nextBackgroundReadAt.mockResolvedValue(new Date("2026-09-04T12:00:00.000Z"));

      expect(await getBankConnectionStatus()).toMatchObject({
        lastReadAt: "2026-09-04T06:00:00.000Z",
        lastReadSucceeded: true,
        lastReadImported: 2,
        lastReadFilled: 1,
        lastReadFailure: null,
        nextReadAt: "2026-09-04T12:00:00.000Z",
      });
      expect(readMocks.nextBackgroundReadAt).toHaveBeenCalledWith(storedConnection, expect.any(Date));
    });

    it("names why the last read failed, as its code", async () => {
      storeMocks.getLiveBankConnection.mockResolvedValue(storedConnection);
      readMocks.getLastBankRead.mockResolvedValue({
        readAt: new Date("2026-09-04T06:00:00.000Z"),
        succeeded: false,
        imported: 0,
        filled: 0,
        failureReason: BankErrorCode.RequestRefused,
      });

      expect(await getBankConnectionStatus()).toMatchObject({
        lastReadSucceeded: false,
        lastReadFailure: BankErrorCode.RequestRefused,
      });
    });

    it("says whether the deployment holds a credential at all", async () => {
      configMocks.isEnableBankingConfigured.mockReturnValue(false);
      storeMocks.getLiveBankConnection.mockResolvedValue(null);

      expect((await getBankConnectionStatus()).configured).toBe(false);
    });
  });

  describe("starting an authorization", () => {
    it("writes the value down before handing out the address", async () => {
      clientMocks.startAuthorization.mockResolvedValue({
        url: "https://bank.example/authorize",
        authorizationId: "auth-1",
      });

      const started = await beginBankAuthorization(logger);

      expect(started).toEqual({ url: "https://bank.example/authorize" });
      expect(storeMocks.insertAuthorizationState).toHaveBeenCalledTimes(1);

      // The value that was written down is the one that was sent out.
      const sentState = clientMocks.startAuthorization.mock.calls[0]?.[0];
      const storedState = storeMocks.insertAuthorizationState.mock.calls[0]?.[0];
      expect(storedState).toBe(sentState);
      expect(sentState).toMatch(/^[0-9a-f]{64}$/);
    });

    it("sends the bank back to the dashboard's callback page, whatever the request said", async () => {
      clientMocks.startAuthorization.mockResolvedValue({ url: "https://bank.example", authorizationId: "" });

      await beginBankAuthorization(logger);

      expect(clientMocks.startAuthorization.mock.calls[0]?.[1]).toBe(
        "https://dashboard.example/sponsoring/bank-connection/callback",
      );
    });

    it("asks for a consent of 180 days and keeps the state for 15 minutes", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-03T12:00:00.000Z"));
      clientMocks.startAuthorization.mockResolvedValue({ url: "https://bank.example", authorizationId: "" });

      await beginBankAuthorization(logger);
      vi.useRealTimers();

      expect(clientMocks.startAuthorization.mock.calls[0]?.[2]).toEqual(new Date("2027-03-02T12:00:00.000Z"));
      expect(storeMocks.insertAuthorizationState.mock.calls[0]?.[2]).toEqual(new Date("2026-09-03T12:15:00.000Z"));
    });
  });

  describe("honoring a return", () => {
    it("refuses a value it never issued, without spending anything", async () => {
      storeMocks.takeAuthorizationState.mockResolvedValue(null);

      await expect(completeBankAuthorization("code-1", ISSUED, logger)).rejects.toMatchObject({
        code: BankErrorCode.StateUnknown,
      });
      expect(clientMocks.createSession).not.toHaveBeenCalled();
      expect(storeMocks.replaceBankConnection).not.toHaveBeenCalled();
    });

    it("refuses a value that has already been spent", async () => {
      // Spending the value removes it, so the second return finds nothing. That
      // is the same answer as for a value the site never issued, which is what
      // the store reports back as `null`.
      storeMocks.takeAuthorizationState
        .mockResolvedValueOnce({ state: ISSUED, authorizationId: "auth-1" })
        .mockResolvedValueOnce(null);
      clientMocks.createSession.mockResolvedValue(session);
      storeMocks.replaceBankConnection.mockResolvedValue(storedConnection);

      await completeBankAuthorization("code-1", ISSUED, logger);

      await expect(completeBankAuthorization("code-1", ISSUED, logger)).rejects.toMatchObject({
        code: BankErrorCode.StateUnknown,
      });
      expect(clientMocks.createSession).toHaveBeenCalledTimes(1);
    });

    it("stores nothing when the session reaches more than the one account", async () => {
      storeMocks.takeAuthorizationState.mockResolvedValue({ state: ISSUED, authorizationId: "auth-1" });
      clientMocks.createSession.mockResolvedValue({ ...session, sessionId: "session-2", accountUids: ["a1", "a2"] });

      await expect(completeBankAuthorization("code-1", ISSUED, logger)).rejects.toMatchObject({
        code: BankErrorCode.UnexpectedAccounts,
      });
      expect(storeMocks.replaceBankConnection).not.toHaveBeenCalled();
      // Closed at the provider as well, or the consent behind it stands for
      // months with nobody holding the identifier that could withdraw it.
      expect(clientMocks.closeSession).toHaveBeenCalledWith("session-2");
    });

    it("still refuses when the discarded session cannot be closed either", async () => {
      storeMocks.takeAuthorizationState.mockResolvedValue({ state: ISSUED, authorizationId: "auth-1" });
      clientMocks.createSession.mockResolvedValue({ ...session, sessionId: "session-4", accountUids: ["a1", "a2"] });
      clientMocks.closeSession.mockRejectedValue(new BankConnectionError(BankErrorCode.RequestRefused));

      await expect(completeBankAuthorization("code-1", ISSUED, logger)).rejects.toMatchObject({
        code: BankErrorCode.UnexpectedAccounts,
      });
      expect(storeMocks.replaceBankConnection).not.toHaveBeenCalled();
    });

    it("stores nothing when the session reaches no account at all", async () => {
      storeMocks.takeAuthorizationState.mockResolvedValue({ state: ISSUED, authorizationId: "auth-1" });
      clientMocks.createSession.mockResolvedValue({ ...session, sessionId: "session-3", accountUids: [] });

      await expect(completeBankAuthorization("code-1", ISSUED, logger)).rejects.toBeInstanceOf(BankConnectionError);
      expect(storeMocks.replaceBankConnection).not.toHaveBeenCalled();
    });

    it("puts the connection in force and reports what the dashboard shows", async () => {
      storeMocks.takeAuthorizationState.mockResolvedValue({ state: ISSUED, authorizationId: "auth-1" });
      clientMocks.createSession.mockResolvedValue(session);
      storeMocks.replaceBankConnection.mockResolvedValue(storedConnection);

      const status = await completeBankAuthorization("code-1", ISSUED, logger);

      expect(storeMocks.replaceBankConnection).toHaveBeenCalledWith(
        expect.objectContaining({ accountUid: "account-1", aspspName: "Erste Bank" }),
        expect.any(Date),
      );
      expect(status).toMatchObject({
        connected: true,
        institutionName: "Erste Bank",
        institutionCountry: "AT",
        consentValidUntil: storedConnection.consentValidUntil.toISOString(),
      });
    });

    it("never writes the code, the state or the session into its log", async () => {
      storeMocks.takeAuthorizationState.mockResolvedValue({ state: ISSUED, authorizationId: "auth-1" });
      clientMocks.createSession.mockResolvedValue(session);
      storeMocks.replaceBankConnection.mockResolvedValue(storedConnection);

      await completeBankAuthorization("code-secret", ISSUED, logger);

      const logged = JSON.stringify(logger.info.mock.calls);
      expect(logged).toContain("auth-1");
      for (const secret of ["code-secret", ISSUED, storedConnection.sessionId, storedConnection.accountUid]) {
        expect(logged).not.toContain(secret);
      }
    });
  });

  describe("letting the account go", () => {
    it("refuses when nothing is in force", async () => {
      storeMocks.revokeLiveBankConnection.mockResolvedValue(null);

      await expect(disconnectBank(logger)).rejects.toMatchObject({ code: BankErrorCode.NotConnected });
      expect(clientMocks.closeSession).not.toHaveBeenCalled();
    });

    it("withdraws it and closes the session behind it", async () => {
      storeMocks.revokeLiveBankConnection.mockResolvedValue(storedConnection);

      const status = await disconnectBank(logger);

      expect(clientMocks.closeSession).toHaveBeenCalledWith(storedConnection.sessionId);
      expect(status).toMatchObject({ connected: false, institutionName: "", connectedAt: null });
    });

    it("keeps the withdrawal even when the bank will not close the consent", async () => {
      storeMocks.revokeLiveBankConnection.mockResolvedValue(storedConnection);
      clientMocks.closeSession.mockRejectedValue(new BankConnectionError(BankErrorCode.RequestRefused));

      await expect(disconnectBank(logger)).rejects.toMatchObject({ code: BankErrorCode.CloseFailed });
      // The site stopped reading the account regardless, which is the part it
      // gets to decide on its own.
      expect(storeMocks.revokeLiveBankConnection).toHaveBeenCalledTimes(1);
    });
  });
});
