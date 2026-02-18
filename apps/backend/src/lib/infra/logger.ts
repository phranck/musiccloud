/**
 * Simple dev-only logger. All output is suppressed in production builds.
 * Uses process.env.NODE_ENV !== "production" (Vite/Astro build-time constant).
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
      // In production: only log string messages, never full error objects or stack traces
      const safeArgs = args.map((a) => (a instanceof Error ? a.message : a));
      console.error(`[${tag}]`, ...safeArgs);
    }
  },
};
