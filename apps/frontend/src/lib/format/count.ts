/**
 * Formats a non-negative integer count into a compact human-readable string,
 * collapsing thousands to `K` and millions to `M` with one decimal place.
 *
 * Shared by the artist profile stats (followers, scrobbles) and the CC track
 * details card (listens, downloads, favorites, …) so both render counts the same
 * way. Values below 1,000 are returned verbatim.
 *
 * @param n - The count to format (expected non-negative).
 * @returns The compact label, e.g. `1.2K`, `3.4M`, or `42`.
 */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
