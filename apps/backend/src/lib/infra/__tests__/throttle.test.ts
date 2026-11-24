import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMinIntervalThrottle, sleep } from "../throttle.js";

/** The gap between starts in these cases. */
const INTERVAL_MS = 1000;
/** A clock reading the cases start from, later than one interval after zero. */
const START_AT = 50_000;

/**
 * Starts `count` acquisitions at once and records when each one is granted.
 *
 * @param acquire - The throttle's `acquire`.
 * @param count - How many callers queue at once.
 * @returns The clock readings at which the callers got their turns, filled in
 *   as the turns are granted, and a promise for all turns.
 */
function queueCallers(acquire: () => Promise<void>, count: number) {
  const grantedAt: number[] = [];
  const turns = Array.from({ length: count }, () => acquire().then(() => grantedAt.push(Date.now())));
  return { grantedAt, all: Promise.all(turns) };
}

describe("sleep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves once the time has passed", async () => {
    let done = false;
    const waiting = sleep(INTERVAL_MS).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toBe(true);
  });

  it("sets no timer for zero or a negative duration", async () => {
    await sleep(0);
    await sleep(-INTERVAL_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("createMinIntervalThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START_AT);
  });
  afterEach(() => vi.useRealTimers());

  it("lets the first caller start at once", async () => {
    const throttle = createMinIntervalThrottle(INTERVAL_MS);

    await throttle.acquire();

    expect(Date.now()).toBe(START_AT);
  });

  it("lets the first caller start at once even when the clock reads less than one interval", async () => {
    vi.setSystemTime(0);
    const throttle = createMinIntervalThrottle(INTERVAL_MS);

    await throttle.acquire();

    expect(Date.now()).toBe(0);
  });

  it("starts concurrent callers one interval apart, in calling order", async () => {
    const throttle = createMinIntervalThrottle(INTERVAL_MS);
    const { grantedAt, all } = queueCallers(() => throttle.acquire(), 3);

    await vi.advanceTimersByTimeAsync(0);
    expect(grantedAt).toEqual([START_AT]);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(grantedAt).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1 + INTERVAL_MS);
    await all;

    expect(grantedAt).toEqual([START_AT, START_AT + INTERVAL_MS, START_AT + 2 * INTERVAL_MS]);
  });

  it("waits only for what remains of the interval since the last start", async () => {
    const throttle = createMinIntervalThrottle(INTERVAL_MS);
    await throttle.acquire();
    const elapsedMs = INTERVAL_MS / 4;
    vi.setSystemTime(START_AT + elapsedMs);

    const { grantedAt, all } = queueCallers(() => throttle.acquire(), 1);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS - elapsedMs);
    await all;

    expect(grantedAt).toEqual([START_AT + INTERVAL_MS]);
  });

  it("does not wait once the interval has passed since the last start", async () => {
    const throttle = createMinIntervalThrottle(INTERVAL_MS);
    await throttle.acquire();
    vi.setSystemTime(START_AT + INTERVAL_MS);

    await throttle.acquire();

    expect(Date.now()).toBe(START_AT + INTERVAL_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads an interval function on every turn", async () => {
    let intervalMs = INTERVAL_MS;
    const throttle = createMinIntervalThrottle(() => intervalMs);
    await throttle.acquire();
    intervalMs = INTERVAL_MS * 2;

    const { grantedAt, all } = queueCallers(() => throttle.acquire(), 1);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(grantedAt).toEqual([]);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await all;

    expect(grantedAt).toEqual([START_AT + 2 * INTERVAL_MS]);
  });

  it("spaces nothing with an interval of zero", async () => {
    const throttle = createMinIntervalThrottle(0);
    const { grantedAt, all } = queueCallers(() => throttle.acquire(), 3);

    await all;

    expect(grantedAt).toEqual([START_AT, START_AT, START_AT]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps serving later callers when an interval function throws", async () => {
    const intervalFn = vi
      .fn<() => number>()
      .mockImplementationOnce(() => {
        throw new Error("unreadable interval");
      })
      .mockReturnValue(INTERVAL_MS);
    const throttle = createMinIntervalThrottle(intervalFn);

    await expect(throttle.acquire()).rejects.toThrow("unreadable interval");
    await throttle.acquire();

    expect(Date.now()).toBe(START_AT);
  });

  it("forgets the last start on reset", async () => {
    const throttle = createMinIntervalThrottle(INTERVAL_MS);
    await throttle.acquire();

    throttle.reset();
    await throttle.acquire();

    expect(Date.now()).toBe(START_AT);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the history of each throttle apart", async () => {
    const first = createMinIntervalThrottle(INTERVAL_MS);
    const second = createMinIntervalThrottle(INTERVAL_MS);
    await first.acquire();

    await second.acquire();

    expect(Date.now()).toBe(START_AT);
  });
});
