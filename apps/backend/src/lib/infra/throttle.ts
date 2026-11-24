/**
 * @file Waiting and request spacing for clients of upstream services.
 *
 * Several upstream APIs refuse a burst of requests and ask for a minimum gap
 * between them instead. Each client that has such a limit holds one throttle,
 * and every request it sends waits for the throttle first. The throttle
 * serializes its callers, so concurrent requests start one interval apart
 * rather than all at once.
 */

/**
 * Waits for a number of milliseconds.
 *
 * @param ms - How long to wait. Zero or a negative value resolves without
 *   setting a timer.
 * @returns A promise that resolves once the time has passed.
 */
export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Spaces the starts of requests to one upstream service.
 *
 * @property acquire - Waits until the next request may start and records that
 *   start. Callers are served in the order they call it.
 * @property reset - Forgets every earlier start, so the next caller starts at
 *   once. Meant for tests that need a throttle without history.
 */
export interface MinIntervalThrottle {
  acquire(): Promise<void>;
  reset(): void;
}

/**
 * The start time a throttle without history compares against. It lies before
 * every clock reading, so the first caller never waits, whatever the interval.
 */
const NO_EARLIER_START_AT = Number.NEGATIVE_INFINITY;

/**
 * Creates a throttle that keeps at least `intervalMs` between the starts of two
 * requests.
 *
 * Callers queue in the order they call `acquire`. Each one, on its turn, waits
 * for whatever remains of the interval since the previous start and then
 * records the current time as its own start. The gap is therefore measured
 * between actual starts, so a late timer never lets two requests start closer
 * together than the interval.
 *
 * @param intervalMs - The minimum gap between starts in milliseconds, or a
 *   function that returns it. A function is read on every turn, so a client can
 *   follow a setting that changes at runtime. Zero spaces nothing.
 * @returns The throttle. Each call to this factory has its own queue and history.
 */
export function createMinIntervalThrottle(intervalMs: number | (() => number)): MinIntervalThrottle {
  const resolveIntervalMs = typeof intervalMs === "function" ? intervalMs : () => intervalMs;
  let lastStartAt = NO_EARLIER_START_AT;
  let queue: Promise<void> = Promise.resolve();

  return {
    acquire(): Promise<void> {
      const turn = queue.then(async () => {
        await sleep(lastStartAt + resolveIntervalMs() - Date.now());
        lastStartAt = Date.now();
      });
      // A turn whose interval function throws rejects its own caller only, so
      // the callers behind it still get their turns.
      queue = turn.catch(() => undefined);
      return turn;
    },
    reset(): void {
      lastStartAt = NO_EARLIER_START_AT;
      queue = Promise.resolve();
    },
  };
}
