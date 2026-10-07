/**
 * @file Bounded and shared concurrency for work against upstream services.
 *
 * Upstream APIs throttle or fail a burst of parallel requests, and a failed
 * request usually costs a visible result (a dropped genre tile, a missing
 * artist image). Running every request at once is fastest only until the
 * upstream pushes back, so fan-outs go through a cap instead. Identical work
 * asked for twice at once runs once, through a single-flight gate.
 */

/** Runs a task once a slot is free, so at most a fixed number run at a time. */
export type ConcurrencyLimiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Creates a limiter shared by every caller that holds it. Tasks beyond the cap
 * wait in arrival order. A task that throws frees its slot like one that
 * resolves.
 *
 * @param maxConcurrent - How many tasks may run at once; at least 1.
 * @returns A function that runs a task inside the limit and settles with the task.
 */
export function createConcurrencyLimiter(maxConcurrent: number): ConcurrencyLimiter {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new RangeError(`maxConcurrent must be a positive integer, got ${maxConcurrent}`);
  }
  let active = 0;
  const waiting: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };

  const release = (): void => {
    const next = waiting.shift();
    // A freed slot goes straight to the next waiter, so `active` stays the same.
    if (next) next();
    else active--;
  };

  return async (task) => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * Maps every item through `mapper` with at most `maxConcurrent` calls in
 * flight, and returns the results in the order of `items`.
 *
 * @param items - The inputs.
 * @param maxConcurrent - How many `mapper` calls may run at once; at least 1.
 * @param mapper - Called once per item with the item and its index.
 * @returns The mapped values, index for index. Rejects with the first error
 *   thrown, like `Promise.all`; calls already started still run to the end.
 */
export function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  maxConcurrent: number,
  mapper: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const limit = createConcurrencyLimiter(maxConcurrent);
  return Promise.all(items.map((item, index) => limit(() => mapper(item, index))));
}

/** Runs a task for a key unless one for that key is still running, in which case it returns that one. */
export type SingleFlight<Key, Value> = (key: Key, task: () => Promise<Value>) => Promise<Value>;

/**
 * Creates a single-flight gate: concurrent callers asking for the same key
 * share one running task instead of each starting their own. The key is
 * forgotten once its task settles, so a later caller starts afresh, and a
 * rejection reaches every caller that shared the task.
 *
 * @returns The gate. Each call to this factory has its own set of keys.
 */
export function createSingleFlight<Key, Value>(): SingleFlight<Key, Value> {
  const running = new Map<Key, Promise<Value>>();
  return (key, task) => {
    const existing = running.get(key);
    if (existing) return existing;

    const promise = task();
    running.set(key, promise);
    const forget = (): void => {
      if (running.get(key) === promise) running.delete(key);
    };
    promise.then(forget, forget);
    return promise;
  };
}
