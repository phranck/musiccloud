/**
 * @file Date formatting shared by the dashboard panels and SSR pages.
 * The portal is EN-only (MC-066), so the locale is fixed.
 */

/**
 * Formats an ISO-8601 timestamp as a short, human-readable date
 * (e.g. "Jul 4, 2026") for list rows and metadata lines.
 *
 * @param iso - An ISO-8601 timestamp string.
 * @returns The formatted date.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
