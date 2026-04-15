/**
 * Cross-app display helpers.
 *
 * Lives in `@musiccloud/shared` (not in any one app) because backend SSR,
 * Astro pages, and React islands all render durations and years from the
 * same upstream data and must format them identically. Divergent formatters
 * produced inconsistent output across embed vs landing vs share pages in
 * earlier iterations.
 */

/** Format milliseconds as "m:ss" (not "mm:ss": leading-zero minutes read as stopwatch, not song length). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Extract 4-digit year from a date string, or null if invalid */
export function formatYear(dateStr: string): string | null {
  const year = dateStr.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}
