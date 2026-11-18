/**
 * @file Tests for when the bank account is read next, ported from lmaa.space
 * (`apps/backend/src/__tests__/bank-read-schedule.test.ts`), with the stored
 * reads mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const readMocks = vi.hoisted(() => ({ getReadTimesInWindow: vi.fn() }));

vi.mock("./bank-read-store.js", () => readMocks);

import type { BankConnectionRecord } from "./bank-connection-store.js";
import {
  BACKGROUND_INTERVAL_MS,
  nextBackgroundReadAt,
  READ_WINDOW_HOURS,
  READ_WINDOW_MS,
} from "./bank-read-schedule.js";

/** The moment every case asks at. */
const NOW = new Date("2026-09-12T12:00:00.000Z");

/** Milliseconds in an hour. */
const HOUR_MS = 60 * 60 * 1000;

/**
 * A connection in force, which each case then bends.
 *
 * @param overrides - The fields that differ.
 */
function connection(overrides: Partial<BankConnectionRecord> = {}): BankConnectionRecord {
  return {
    id: "connection-1",
    sessionId: "session-that-never-leaves-the-backend",
    accountUid: "account-1",
    aspspName: "Erste Bank",
    aspspCountry: "AT",
    consentValidUntil: new Date("2027-03-02T00:00:00.000Z"),
    consentNoticeStage: null,
    revokedAt: null,
    createdAt: new Date("2026-09-03T10:00:00.000Z"),
    ...overrides,
  };
}

/**
 * Reads at the given ages in hours, newest first, as the store hands them back.
 *
 * @param ages - How many hours before {@link NOW} each read happened.
 */
function readsAgedHours(...ages: number[]): Date[] {
  return ages.map((age) => new Date(NOW.getTime() - age * HOUR_MS));
}

describe("when the account is read next", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readMocks.getReadTimesInWindow.mockResolvedValue([]);
  });

  it("names no time while nothing is connected", async () => {
    expect(await nextBackgroundReadAt(null, NOW)).toBeNull();
    expect(readMocks.getReadTimesInWindow).not.toHaveBeenCalled();
  });

  it("names no time once the consent has lapsed", async () => {
    expect(
      await nextBackgroundReadAt(connection({ consentValidUntil: new Date(NOW.getTime() - HOUR_MS) }), NOW),
    ).toBeNull();
  });

  it("names no time at the very moment the consent lapses", async () => {
    // The read itself stops on the same boundary, so the card must not promise
    // a read that will be refused.
    expect(await nextBackgroundReadAt(connection({ consentValidUntil: NOW }), NOW)).toBeNull();
  });

  it("counts a connection without an end date as one that keeps reading", async () => {
    expect(await nextBackgroundReadAt(connection({ consentValidUntil: null }), NOW)).toEqual(NOW);
  });

  it("is due now while the window holds nothing", async () => {
    expect(await nextBackgroundReadAt(connection(), NOW)).toEqual(NOW);
  });

  it("waits out the interval after the last read", async () => {
    readMocks.getReadTimesInWindow.mockResolvedValue(readsAgedHours(2));

    expect(await nextBackgroundReadAt(connection(), NOW)).toEqual(
      new Date(NOW.getTime() - 2 * HOUR_MS + BACKGROUND_INTERVAL_MS),
    );
  });

  it("is due now once the interval has passed and the window has room", async () => {
    readMocks.getReadTimesInWindow.mockResolvedValue(readsAgedHours(7));

    expect(await nextBackgroundReadAt(connection(), NOW)).toEqual(NOW);
  });

  it("waits for the oldest read to leave a full window", async () => {
    // Four reads close together, which a run of deployments produces: the
    // interval would let one through in five hours, and the budget will not
    // until the oldest of them is twenty-four hours old.
    readMocks.getReadTimesInWindow.mockResolvedValue(readsAgedHours(1, 2, 3, 4));

    expect(await nextBackgroundReadAt(connection(), NOW)).toEqual(
      new Date(NOW.getTime() - 4 * HOUR_MS + READ_WINDOW_MS),
    );
  });

  it("still waits out the interval where the full window would allow one sooner", async () => {
    readMocks.getReadTimesInWindow.mockResolvedValue(readsAgedHours(1, 7, 13, 23));

    expect(await nextBackgroundReadAt(connection(), NOW)).toEqual(
      new Date(NOW.getTime() - HOUR_MS + BACKGROUND_INTERVAL_MS),
    );
  });

  it("asks for the background reads over the window the cap is measured on", async () => {
    await nextBackgroundReadAt(connection(), NOW);

    expect(readMocks.getReadTimesInWindow).toHaveBeenCalledWith("background", READ_WINDOW_HOURS, NOW);
  });

  it.each([
    ["an empty window", readsAgedHours()],
    ["one old read", readsAgedHours(23)],
    ["a full window", readsAgedHours(1, 2, 3, 4)],
    ["a spread window", readsAgedHours(1, 7, 13, 19)],
  ])("never names a time that has already passed, with %s", async (_case, reads) => {
    readMocks.getReadTimesInWindow.mockResolvedValue(reads);

    const next = await nextBackgroundReadAt(connection(), NOW);

    expect(next?.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
  });
});
