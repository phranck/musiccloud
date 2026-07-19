import { formatEnglishDate } from "@/lib/format";

/**
 * Formats an ISO date string as a short English date for the
 * developer section tables and detail pages.
 *
 * @param iso - ISO 8601 date string (e.g. from an API response).
 * @returns The formatted date without time component.
 */
export function formatDate(iso: string): string {
  return formatEnglishDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
}
