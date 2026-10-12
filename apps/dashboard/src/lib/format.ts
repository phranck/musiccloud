import type { PartialDate } from "@musiccloud/shared";

const ENGLISH_LOCALE = "en-US";

/**
 * The formatters for a date known to the day or to the month. They read the
 * date in UTC because a partial date names a calendar day, not an instant, and
 * a local time zone west of UTC would move it to the day before.
 */
const PARTIAL_DATE_FORMATTERS = {
  day: new Intl.DateTimeFormat(ENGLISH_LOCALE, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
  month: new Intl.DateTimeFormat(ENGLISH_LOCALE, { year: "numeric", month: "long", timeZone: "UTC" }),
} as const;

/**
 * Writes a date that is known only as precisely as its source stated it, and
 * no more precisely than that.
 *
 * @param date - The date, whose parts beyond its precision are `null`.
 * @returns "October 7, 1968", "October 1968" or "1968", or `null` where not
 *   even the year is known.
 */
export function formatPartialDate(date: PartialDate | null): string | null {
  if (!date || date.year === null) return null;
  if (date.precision === "day" && date.month !== null && date.day !== null) {
    return PARTIAL_DATE_FORMATTERS.day.format(Date.UTC(date.year, date.month - 1, date.day));
  }
  if ((date.precision === "month" || date.precision === "day") && date.month !== null) {
    return PARTIAL_DATE_FORMATTERS.month.format(Date.UTC(date.year, date.month - 1, 1));
  }
  return String(date.year);
}

export function formatEnglishDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(ENGLISH_LOCALE, options).format(date);
}

export function formatEnglishNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(ENGLISH_LOCALE, options).format(value);
}

/** The fields the dashboard names an admin by. */
export interface AdminNameParts {
  username?: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Names an admin the way the dashboard does wherever one appears: the first
 * and last name where either is set, and the username otherwise.
 *
 * @param parts - The admin's username and optional names.
 * @returns The name to show, or `undefined` when none of the three is set.
 */
export function formatAdminName({ username, firstName, lastName }: AdminNameParts): string | undefined {
  return [firstName, lastName].filter(Boolean).join(" ") || username;
}
