/**
 * @file Fan-out with a response deadline.
 *
 * A resolve asks about eighteen services at once. The ones most people use
 * answer within a second, while a few far-away or scraped ones take three or
 * more, and the site's loading state should not last as long as the slowest of
 * them. The resolvers therefore answer with what arrived by the deadline and
 * hand the rest to background work that stores it once it arrives.
 */

/**
 * How long a resolve waits for the services it asked before it answers.
 *
 * Measured on 2026-10-07, Spotify, Apple Music, Deezer, Tidal and YouTube all
 * answered within 1.1 s, while Bugs! and Melon took 3.1 to 3.6 s for every
 * resolve. Two seconds keeps the common services in the response with room for
 * a slow handshake, and keeps the long tail out of the user's wait.
 */
export const RESOLVE_RESPONSE_DEADLINE_MS = 2_000;

/**
 * A fan-out split at its deadline.
 *
 * @property early - One entry per task, in task order: its settled result when
 *   it settled before the deadline, otherwise `undefined`.
 * @property all - Settles with every task's result once the last task has
 *   settled. It never rejects, so background work can chain on it directly.
 */
export interface DeadlineFanOut<T> {
  early: ReadonlyArray<PromiseSettledResult<T> | undefined>;
  all: Promise<PromiseSettledResult<T>[]>;
}

/**
 * Waits until every task has settled or the deadline has passed, whichever is
 * first, and reports which tasks made it.
 *
 * The tasks keep running after the deadline; nothing is cancelled. Callers
 * that need the late results chain on `all`.
 *
 * @param tasks - The fan-out, one promise per service.
 * @param deadlineMs - Longest time to wait, in milliseconds.
 * @returns The results that settled in time and a promise of all of them.
 */
export async function settleWithinDeadline<T>(
  tasks: readonly Promise<T>[],
  deadlineMs: number,
): Promise<DeadlineFanOut<T>> {
  const settled: Array<PromiseSettledResult<T> | undefined> = tasks.map(() => undefined);
  const all = Promise.allSettled(
    tasks.map((task, index) =>
      task.then(
        (value) => {
          settled[index] = { status: "fulfilled", value };
          return value;
        },
        (reason: unknown) => {
          settled[index] = { status: "rejected", reason };
          throw reason;
        },
      ),
    ),
  );

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    deadlineTimer = setTimeout(resolve, deadlineMs);
  });
  await Promise.race([all, deadline]);
  clearTimeout(deadlineTimer);

  return { early: [...settled], all };
}
