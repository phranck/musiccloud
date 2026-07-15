/**
 * Normalizes an upstream release date to the public API's `YYYY-MM-DD` contract.
 *
 * Streaming services report dates as bare dates, ISO timestamps, RFC-2822
 * timestamps, or incomplete years. Preserve an existing ISO date prefix,
 * convert other parseable timestamps to their UTC date, and drop incomplete or
 * invalid values so response serialization cannot fail on `format: date`.
 */
export function normalizeReleaseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoPrefix = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoPrefix) {
    const [year, month, day] = isoPrefix[0].split("-").map(Number);
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1] ? isoPrefix[0] : null;
  }
  if (/^\d{4}$/.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
