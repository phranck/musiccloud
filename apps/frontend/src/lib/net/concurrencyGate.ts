/**
 * A FIFO concurrency gate: at most `maxConcurrent` holders may run at once;
 * everything beyond that waits in a first-in-first-out queue until a slot frees.
 *
 * Used to throttle batched network work — e.g. genre-artwork tiles, where a fast
 * scroll would otherwise fire a request for every tile at once and overwhelm the
 * cold-cache generation pipeline on the backend. Each waiter still gets its turn;
 * never more than `maxConcurrent` run in parallel.
 */
export interface ConcurrencyGate {
  /**
   * Acquires a slot. Resolves immediately when one is free, otherwise resolves
   * later (in arrival order) once a held slot is released. Every successful
   * `acquire` MUST be paired with exactly one {@link ConcurrencyGate.release}.
   */
  acquire(): Promise<void>;
  /**
   * Releases a held slot and hands it to the next waiter in the queue, if any.
   */
  release(): void;
}

/**
 * Creates a {@link ConcurrencyGate} bounded at `maxConcurrent` simultaneous
 * holders. The returned gate owns its own counter and wait queue, so distinct
 * gates throttle independently.
 *
 * @param maxConcurrent - The maximum number of concurrently held slots.
 * @returns A gate with `acquire` / `release`.
 */
export function createConcurrencyGate(maxConcurrent: number): ConcurrencyGate {
  let activeSlots = 0;
  const waitQueue: Array<() => void> = [];

  return {
    acquire() {
      return new Promise<void>((resolve) => {
        if (activeSlots < maxConcurrent) {
          activeSlots++;
          resolve();
          return;
        }
        waitQueue.push(() => {
          activeSlots++;
          resolve();
        });
      });
    },
    release() {
      activeSlots--;
      const next = waitQueue.shift();
      if (next) next();
    },
  };
}
