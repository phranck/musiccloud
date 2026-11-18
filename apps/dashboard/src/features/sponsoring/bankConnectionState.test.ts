/**
 * @file Tests for the state the bank connection is shown in, ported from
 * lmaa.space (`apps/dashboard/src/features/system/bank-connection/bank-connection-state.test.ts`).
 */
import { BANK_CONSENT_NOTICE_DAYS, type BankConnectionStatus } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import { BankConnectionState, resolveBankConnectionState } from "./bankConnectionState";

/** The moment every case measures against. */
const NOW = new Date("2026-09-03T12:00:00.000Z");
/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;
/** Milliseconds in an hour. */
const HOUR_MS = 60 * 60 * 1000;
/** How long the bank's consent usually lasts, which the live connection of these cases has left. */
const CONSENT_DAYS = 180;
/** The day the warning window opens, read from the shared contract the backend's notices use too. */
const WARNING_DAYS = BANK_CONSENT_NOTICE_DAYS.soon;

/**
 * A status with a live connection, which each case then bends.
 *
 * @param overrides - The fields that differ.
 */
function status(overrides: Partial<BankConnectionStatus> = {}): BankConnectionStatus {
  return {
    configured: true,
    connected: true,
    institutionName: "Erste Bank",
    institutionCountry: "AT",
    consentValidUntil: new Date(NOW.getTime() + CONSENT_DAYS * DAY_MS).toISOString(),
    connectedAt: NOW.toISOString(),
    lastReadAt: null,
    lastReadSucceeded: null,
    lastReadImported: 0,
    lastReadFilled: 0,
    lastReadFailure: null,
    nextReadAt: null,
    ...overrides,
  };
}

/**
 * A consent lapsing this many days from {@link NOW}.
 *
 * @param days - Days from now, negative for the past.
 */
function lapsingInDays(days: number): string {
  return new Date(NOW.getTime() + days * DAY_MS).toISOString();
}

describe("the state of the bank connection", () => {
  it("is unconfigured when the site holds no credential", () => {
    expect(resolveBankConnectionState(status({ configured: false }), NOW)).toBe(BankConnectionState.Unconfigured);
  });

  it("says unconfigured even where a connection is somehow still recorded", () => {
    // The credential going away does not delete what was connected with it, and
    // the missing credential is the more useful thing to say.
    expect(resolveBankConnectionState(status({ configured: false, connected: true }), NOW)).toBe(
      BankConnectionState.Unconfigured,
    );
  });

  it("is disconnected when nothing is in force", () => {
    expect(
      resolveBankConnectionState(status({ connected: false, consentValidUntil: null, connectedAt: null }), NOW),
    ).toBe(BankConnectionState.Disconnected);
  });

  it("is connected while the consent is far off", () => {
    expect(resolveBankConnectionState(status(), NOW)).toBe(BankConnectionState.Connected);
  });

  it("is connected on the day before the warning window opens", () => {
    expect(resolveBankConnectionState(status({ consentValidUntil: lapsingInDays(WARNING_DAYS + 1) }), NOW)).toBe(
      BankConnectionState.Connected,
    );
  });

  it("is expiring once the consent is inside the warning window", () => {
    expect(resolveBankConnectionState(status({ consentValidUntil: lapsingInDays(WARNING_DAYS - 1) }), NOW)).toBe(
      BankConnectionState.Expiring,
    );
  });

  it("is expiring an hour before the consent lapses", () => {
    expect(
      resolveBankConnectionState(status({ consentValidUntil: new Date(NOW.getTime() + HOUR_MS).toISOString() }), NOW),
    ).toBe(BankConnectionState.Expiring);
  });

  it("is expired at the very moment the consent lapses", () => {
    expect(resolveBankConnectionState(status({ consentValidUntil: NOW.toISOString() }), NOW)).toBe(
      BankConnectionState.Expired,
    );
  });

  it("is expired once the consent lies behind", () => {
    expect(resolveBankConnectionState(status({ consentValidUntil: lapsingInDays(-1) }), NOW)).toBe(
      BankConnectionState.Expired,
    );
  });

  it("counts a connection without an end date as connected", () => {
    // The date is what the bank promised. Its absence says nothing was promised
    // rather than that something ran out.
    expect(resolveBankConnectionState(status({ consentValidUntil: null }), NOW)).toBe(BankConnectionState.Connected);
  });

  it("counts a connection with an unreadable end date as connected", () => {
    expect(resolveBankConnectionState(status({ consentValidUntil: "whenever" }), NOW)).toBe(
      BankConnectionState.Connected,
    );
  });
});
