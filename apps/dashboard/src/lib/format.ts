const ENGLISH_LOCALE = "en-US";

export function formatEnglishDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(ENGLISH_LOCALE, options).format(date);
}

export function formatEnglishNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(ENGLISH_LOCALE, options).format(value);
}
