const ENGLISH_LOCALE = "en-US";

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
