/**
 * Normalizes an upstream release date to the public API's `YYYY-MM-DD` contract.
 *
 * Streaming services report dates as bare dates, ISO timestamps, RFC-2822
 * timestamps, or incomplete dates. Preserve an existing ISO date prefix,
 * convert other parseable timestamps to their UTC date, and drop incomplete or
 * invalid values so response serialization cannot fail on `format: date`.
 *
 * This is the one normalizer: track and album writes, the resolve response and
 * the share loaders all call it, so one stored value reads the same everywhere.
 *
 * @param value - The date as a source or a stored row reports it.
 * @returns A real calendar date as `YYYY-MM-DD`, or `null` when the value
 *   names no complete day.
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
  // A year, or a year and month, names no day. `new Date` would supply the
  // first of the month, a day nobody reported.
  if (/^\d{4}(-\d{2})?$/.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * Number of digits in the year that opens a release date.
 *
 * Every form a source reports and {@link parseReleaseYear} accepts starts with
 * the year: `YYYY`, `YYYY-MM`, `YYYY-MM-DD`, the `YYYY-00-00` Discogs uses for
 * an unknown month and day, and an ISO timestamp. The value is `4`, so the
 * years `0000` through `9999` are readable.
 */
const RELEASE_YEAR_LENGTH = 4;

/**
 * Matches the {@link RELEASE_YEAR_LENGTH} leading digits of a trimmed release
 * date. A value that opens with anything else, such as an empty string,
 * `"unknown"` or an RFC-2822 timestamp, does not match.
 */
const LEADING_RELEASE_YEAR_PATTERN = new RegExp(`^\\d{${RELEASE_YEAR_LENGTH}}`);

/**
 * Reads the release year from the start of a date string.
 *
 * This is the one place that knows a release date opens with its year. Album
 * matching compares years with it, the Discogs version picker ranks pressings
 * by it, the album search query and the share page's Open Graph description
 * show it. A value whose year cannot be read is reported as unknown rather than
 * as a number, so a caller that ranks or compares years decides explicitly how
 * an unknown year behaves.
 *
 * @param value - The date as a source or a stored row reports it, for example
 *   `"1959"`, `"1959-03-00"` or `"2009-10-07T23:12:34Z"`. Leading and trailing
 *   whitespace is ignored.
 * @returns The year as a number, or `null` when the value is missing, empty, or
 *   does not open with {@link RELEASE_YEAR_LENGTH} digits.
 */
export function parseReleaseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = LEADING_RELEASE_YEAR_PATTERN.exec(value.trim());
  return match ? Number(match[0]) : null;
}
