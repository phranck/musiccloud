/**
 * @file Minimum protocol checks before provider replies can become negative catalog evidence.
 *
 * These checks validate collection/document envelopes, not recording identity or
 * every item field. Adapters retain provider-specific valid-empty conventions;
 * normalized metadata and recording acceptance have their own owning boundaries.
 * No upstream body or signed media URL is included in a failure message.
 */
import type { ServiceId } from "@musiccloud/shared";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";

/**
 * Restricts numeric provider-code diagnostics without trusting response text or objects.
 * @param value - Unvalidated code field from a provider envelope or module.
 * @returns A finite numeric code or the fixed unrecognized marker, never provider text.
 */
export function safeNumericProviderCode(value: unknown): number | "unrecognized" {
  return typeof value === "number" && Number.isFinite(value) ? value : "unrecognized";
}

/**
 * Requires a documented collection rather than interpreting a missing field as zero results.
 * @param value - Collection read from the provider-specific envelope; an empty array is valid.
 * @param service - Provider responsible for this reply.
 * @param operation - Fixed operation description without response content or credentials.
 * @returns The original array, preserving its item type and order.
 * @throws {UpstreamUnavailableError} When the collection is absent or has the wrong type.
 */
export function requireProviderCollection<T>(
  value: T[] | null | undefined,
  service: ServiceId,
  operation: string,
): T[] {
  if (!Array.isArray(value)) {
    throw new UpstreamUnavailableError(service, `${operation} answered without its expected collection`);
  }
  return value;
}

/**
 * Requires an object envelope where a provider may legitimately omit empty result categories.
 * @param value - Provider-specific result object, including a valid empty object.
 * @param service - Provider responsible for this reply.
 * @param operation - Fixed description of the request being decoded.
 * @returns The original object without filling absent fields or manufacturing results.
 * @throws {UpstreamUnavailableError} When the object is missing, null, an array, or a primitive.
 */
export function requireProviderObject<T extends object>(
  value: T | null | undefined,
  service: ServiceId,
  operation: string,
): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UpstreamUnavailableError(service, `${operation} answered without its expected result object`);
  }
  return value;
}

/**
 * Reads an HTML endpoint without treating JSON, blank text or a restricted redirect as a catalog miss.
 *
 * This is a document-format check. Search selectors and explicit empty-result
 * semantics remain the adapter's responsibility, as do recording-page metadata.
 *
 * @param response - Successful provider response, whose status the caller has already checked.
 * @param service - Provider responsible for this reply.
 * @param operation - Fixed description, never the unrestricted provider body.
 * @returns HTML document or fragment for the adapter's existing parser.
 * @throws {UpstreamUnavailableError} For a non-HTML body or an explicit restricted-page redirect.
 */
export async function readProviderHtml(response: Response, service: ServiceId, operation: string): Promise<string> {
  const html = await response.text();
  const restricted = response.url && /\/restricted(?:\/|$)/i.test(new URL(response.url).pathname);
  if (
    restricted ||
    response.headers.get("content-type")?.includes("json") ||
    !/^\s*</.test(html) ||
    !/<[a-z][^>]*>/i.test(html)
  ) {
    throw new UpstreamUnavailableError(service, `${operation} answered without an HTML document`);
  }
  return html;
}
