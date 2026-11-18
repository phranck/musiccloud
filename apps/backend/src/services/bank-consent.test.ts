/**
 * @file Tests for the warnings about a lapsing bank consent, ported from
 * lmaa.space (`apps/backend/src/__tests__/bank-consent.test.ts`). lmaa writes
 * a mail and a push; musiccloud has no push notifications, so the warning is
 * the `bankConsentNotice` email action, mocked here with the owner lookup and
 * the store.
 */
import { BANK_CONNECTION_DASHBOARD_PATH, EmailAction } from "@musiccloud/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  triggerEmailAction: vi.fn(),
  listAdminUsers: vi.fn(),
  getLiveBankConnection: vi.fn(),
  setConsentNoticeStage: vi.fn(),
}));

vi.mock("./email-actions.js", () => ({ triggerEmailAction: mocks.triggerEmailAction }));
vi.mock("../db/index.js", () => ({ getAdminRepository: async () => ({ listAdminUsers: mocks.listAdminUsers }) }));
vi.mock("./bank-connection-store.js", () => ({
  getLiveBankConnection: mocks.getLiveBankConnection,
  setConsentNoticeStage: mocks.setConsentNoticeStage,
}));

import {
  announceConsentRefused,
  announceConsentStage,
  resolveConsentNoticeStage,
  shouldAnnounceStage,
} from "./bank-consent.js";

/** The moment every case measures against. */
const NOW = new Date("2026-09-03T12:00:00.000Z");
/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;
/** The dashboard's origin in these cases. */
const DASHBOARD_URL = "https://dashboard.example";

/**
 * A consent lapsing this many days from {@link NOW}.
 *
 * @param days - Days from now, negative for the past.
 */
function lapsingInDays(days: number): Date {
  return new Date(NOW.getTime() + days * DAY_MS);
}

/** The owner as the admin repository lists them. */
const OWNER = { id: "owner-1", username: "phranck", email: "owner@example.test", role: "owner" };

describe("which rung a lapsing consent has reached", () => {
  it("reaches none while there is plenty of time", () => {
    expect(resolveConsentNoticeStage(lapsingInDays(30), NOW)).toBeNull();
  });

  it("reaches none on the day before the first rung", () => {
    expect(resolveConsentNoticeStage(lapsingInDays(15), NOW)).toBeNull();
  });

  it("reaches the first rung a fortnight out", () => {
    expect(resolveConsentNoticeStage(lapsingInDays(13), NOW)).toBe("soon");
  });

  it("reaches the second rung three days out", () => {
    expect(resolveConsentNoticeStage(lapsingInDays(2), NOW)).toBe("imminent");
  });

  it("reaches the last rung at the very moment it lapses", () => {
    expect(resolveConsentNoticeStage(NOW, NOW)).toBe("lapsed");
  });

  it("reaches none where the bank promised no date", () => {
    // Nothing was promised, which is not the same as something running out.
    expect(resolveConsentNoticeStage(null, NOW)).toBeNull();
  });
});

describe("whether a rung still has to be announced", () => {
  it("announces the first one reached", () => {
    expect(shouldAnnounceStage("soon", null)).toBe(true);
  });

  it("stays quiet about one already said", () => {
    expect(shouldAnnounceStage("soon", "soon")).toBe(false);
  });

  it("announces the next one along", () => {
    expect(shouldAnnounceStage("imminent", "soon")).toBe(true);
  });

  it("never goes back down the staircase", () => {
    // A consent cannot un-lapse, and repeating what was said is the failure
    // this whole arrangement exists to prevent.
    expect(shouldAnnounceStage("soon", "lapsed")).toBe(false);
    expect(shouldAnnounceStage("imminent", "lapsed")).toBe(false);
  });

  it("says nothing where no rung is reached", () => {
    expect(shouldAnnounceStage(null, null)).toBe(false);
    expect(shouldAnnounceStage(null, "soon")).toBe(false);
  });
});

describe("warning the owner", () => {
  const connection = {
    id: "c1",
    consentValidUntil: lapsingInDays(2),
    consentNoticeStage: null as string | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DASHBOARD_URL", DASHBOARD_URL);
    mocks.getLiveBankConnection.mockResolvedValue({ ...connection });
    mocks.listAdminUsers.mockResolvedValue([{ ...OWNER, id: "admin-1", role: "admin" }, OWNER]);
    mocks.triggerEmailAction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes to the owner once, with the rung's words and the page to renew on, and records what it said", async () => {
    await announceConsentStage(NOW);

    expect(mocks.triggerEmailAction).toHaveBeenCalledTimes(1);
    expect(mocks.triggerEmailAction).toHaveBeenCalledWith(EmailAction.BankConsentNotice, {
      to: { email: OWNER.email },
      recipient: { kind: "adminUser", username: OWNER.username, email: OWNER.email, role: OWNER.role },
      context: {
        bankConsentSubject: "The bank connection expires in three days",
        bankConsentMessage: expect.stringContaining("no more incoming payments"),
        bankConnectionUrl: `${DASHBOARD_URL}${BANK_CONNECTION_DASHBOARD_PATH}`,
      },
    });
    expect(mocks.setConsentNoticeStage).toHaveBeenCalledWith("c1", "imminent");
  });

  it("says nothing a second time for the same rung", async () => {
    mocks.getLiveBankConnection.mockResolvedValue({ ...connection, consentNoticeStage: "imminent" });

    await announceConsentStage(NOW);

    expect(mocks.triggerEmailAction).not.toHaveBeenCalled();
    expect(mocks.setConsentNoticeStage).not.toHaveBeenCalled();
  });

  it("records the rung only after it has gone out", async () => {
    // A warning that failed to send is tried again at the next check rather
    // than counted as said.
    mocks.triggerEmailAction.mockRejectedValue(new Error("smtp refused"));

    await expect(announceConsentStage(NOW)).rejects.toThrow("smtp refused");
    expect(mocks.setConsentNoticeStage).not.toHaveBeenCalled();
  });

  it("does not count a warning as said when the owner has no address to write to", async () => {
    mocks.listAdminUsers.mockResolvedValue([{ ...OWNER, email: null }]);

    await expect(announceConsentStage(NOW)).rejects.toThrow(/owner/);
    expect(mocks.triggerEmailAction).not.toHaveBeenCalled();
    expect(mocks.setConsentNoticeStage).not.toHaveBeenCalled();
  });

  it("says nothing at all while no connection is in force", async () => {
    mocks.getLiveBankConnection.mockResolvedValue(null);

    await announceConsentStage(NOW);

    expect(mocks.triggerEmailAction).not.toHaveBeenCalled();
  });

  it("warns on a refused read even where the stored date said there was time", async () => {
    // The date is what the bank promised. It may withdraw earlier, and then a
    // refused read is the only thing that says so.
    mocks.getLiveBankConnection.mockResolvedValue({ ...connection, consentValidUntil: lapsingInDays(60) });

    await announceConsentRefused();

    expect(mocks.triggerEmailAction).toHaveBeenCalledTimes(1);
    expect(mocks.setConsentNoticeStage).toHaveBeenCalledWith("c1", "lapsed");
  });

  it("does not repeat itself when both the date and a refused read notice", async () => {
    mocks.getLiveBankConnection.mockResolvedValue({ ...connection, consentNoticeStage: "lapsed" });

    await announceConsentRefused();
    await announceConsentStage(NOW);

    expect(mocks.triggerEmailAction).not.toHaveBeenCalled();
  });
});
