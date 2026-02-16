/**
 * Simple dev-only logger. All output is suppressed in production builds.
 * Uses import.meta.env.DEV (Vite/Astro build-time constant).
 */

const isDev = import.meta.env.DEV;

export const log = {
  debug(tag: string, ...args: unknown[]): void {
    if (isDev) console.log(`[${tag}]`, ...args);
  },
  error(tag: string, ...args: unknown[]): void {
    console.error(`[${tag}]`, ...args);
  },
};
