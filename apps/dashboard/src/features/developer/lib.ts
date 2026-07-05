import type { DashboardLocale } from "@/i18n/messages";

/**
 * Formats an ISO date string as a short locale-specific date for the
 * developer section tables and detail pages.
 *
 * @param iso - ISO 8601 date string (e.g. from an API response).
 * @param locale - Active dashboard locale; "de" renders DD.MM.YYYY, "en" MM/DD/YYYY.
 * @returns The formatted date without time component.
 */
export function formatDate(iso: string, locale: DashboardLocale): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (locale === "de") return `${dd}.${mm}.${yyyy}`;
  return `${mm}/${dd}/${yyyy}`;
}
