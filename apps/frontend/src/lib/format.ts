const ENGLISH_LOCALE = "en";

export function formatEnglishDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(ENGLISH_LOCALE, options).format(new Date(value));
}

export function formatEnglishNumber(value: number | bigint, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(ENGLISH_LOCALE, options).format(value);
}
