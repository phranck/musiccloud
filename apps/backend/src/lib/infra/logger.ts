/**
 * Dev/prod-aware logger with production redaction.
 *
 * Two project rules drive the asymmetric behaviour:
 *
 * 1. "No stack traces in production logs": `error.stack` can echo file paths,
 *    env-derived strings, and third-party internals. In Zerops log drains
 *    those travel to a shared aggregator and become searchable forever.
 * 2. "Never log credentials or secrets": OAuth refresh failures, Spotify 401
 *    bodies, and similar upstream errors routinely include bearer tokens or
 *    client IDs embedded in Error objects. Passing an `Error` through
 *    `console.error` in prod would serialise those fields wholesale.
 *
 * Dev path keeps full objects so stack traces survive `pnpm dev`. Prod path
 * maps any `Error` to its `.message` only (the one string an adapter author
 * controls) and drops debug output entirely.
 *
 * `isDev` is read once at module load because `NODE_ENV` is frozen for the
 * process lifetime; re-reading it on every call would just waste cycles.
 */

const isDev = process.env.NODE_ENV !== "production";

export const log = {
  debug(tag: string, ...args: unknown[]): void {
    if (isDev) console.log(`[${tag}]`, ...args);
  },
  error(tag: string, ...args: unknown[]): void {
    if (isDev) {
      console.error(`[${tag}]`, ...args);
    } else {
      // Prod: strip Error objects down to their message string. Stack traces
      // and any fields an SDK attached to the error instance are dropped.
      const safeArgs = args.map((a) => (a instanceof Error ? a.message : a));
      console.error(`[${tag}]`, ...safeArgs);
    }
  },
};
