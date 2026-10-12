import { isRequestLimit } from "@musiccloud/shared";
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

/**
 * Parses a project's override field into what the route accepts.
 *
 * An empty field means "take the plan's number", which the route expresses as
 * `null`. Anything that is not a request limit the backend stores is refused
 * here rather than sent, so the screen can say so before the route does.
 *
 * @param raw - The field's current text.
 * @returns The value to send, or `undefined` when the text is not usable.
 */
export function parseLimitOverride(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return isRequestLimit(parsed) ? parsed : undefined;
}

/**
 * Whether a project carries an administrative limit of its own rather than
 * only its plan's.
 *
 * @param requestsPerMinute - The project's per-minute override, or `null`.
 * @param requestsPerDay - The project's per-day override, or `null`.
 * @returns `true` when either override is set.
 */
export function hasLimitOverride(requestsPerMinute: number | null, requestsPerDay: number | null): boolean {
  return requestsPerMinute !== null || requestsPerDay !== null;
}
