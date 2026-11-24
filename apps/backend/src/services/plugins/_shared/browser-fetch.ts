/**
 * @file Browser-like requests to provider pages and endpoints.
 *
 * Scraping adapters present themselves as a desktop browser, because many
 * services serve a stripped page or a bot check to anything else. Every such
 * request goes through {@link fetchProviderPage}, which sends
 * {@link SCRAPER_USER_AGENT} and the `Accept` and `Accept-Language` values the
 * adapter names, through `fetchWithTimeout`.
 */
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { SCRAPER_USER_AGENT } from "./user-agent.js";

/** The `Accept` value a browser sends for a page. */
export const PAGE_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/** The `Accept` value of a request for a JSON answer. */
export const JSON_ACCEPT = "application/json";

/** The `Accept-Language` value that asks for English. */
export const ENGLISH_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

/** The `Accept-Language` value that asks for English first and Korean after it. */
export const ENGLISH_KOREAN_ACCEPT_LANGUAGE = "en-US,en;q=0.9,ko;q=0.8";

/** How long a provider request may take when the adapter names no timeout, 8 s. */
export const PROVIDER_REQUEST_TIMEOUT_MS = 8000;

/** What {@link fetchProviderPage} sends besides the user agent. */
export interface ProviderPageOptions {
  /** How long the request may take, in milliseconds. Defaults to {@link PROVIDER_REQUEST_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** The `Accept` header, such as {@link PAGE_ACCEPT} or {@link JSON_ACCEPT}. Not sent when absent, the default. */
  accept?: string;
  /**
   * The `Accept-Language` header, such as {@link ENGLISH_ACCEPT_LANGUAGE}.
   * Not sent when absent, the default.
   */
  acceptLanguage?: string;
  /** Further headers the adapter always sends, such as a `Referer`. They override the headers above. Defaults to none. */
  headers?: Record<string, string>;
  /**
   * The request's method, body and per-request headers. Its headers override
   * every header above. Defaults to a plain GET.
   */
  init?: RequestInit;
}

/**
 * Requests a provider URL the way a desktop browser would.
 *
 * @param url - The address to request.
 * @param options - The timeout, headers and request the defaults of
 *   {@link ProviderPageOptions} fill in.
 * @returns The provider's answer. An error status is returned, not thrown.
 * @throws Whatever `fetchWithTimeout` throws, such as on a timeout, a network
 *   error or a private address.
 */
export function fetchProviderPage(url: string, options: ProviderPageOptions = {}): Promise<Response> {
  const { timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS, accept, acceptLanguage, headers, init } = options;
  return fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
        ...(accept === undefined ? {} : { Accept: accept }),
        ...(acceptLanguage === undefined ? {} : { "Accept-Language": acceptLanguage }),
        ...headers,
        ...init?.headers,
      },
    },
    timeoutMs,
  );
}

/**
 * Appends one query parameter to a URL or an endpoint path.
 *
 * The value goes in as given, without encoding, and the rest of the URL is left
 * byte for byte as it was. `URL` and `searchParams` would re-encode the
 * existing query, such as `%20` as `+`.
 *
 * @param url - A URL or a path, with or without a query string.
 * @param name - The parameter's name.
 * @param value - The parameter's value, already safe for a query string.
 * @returns The URL with `name=value` after `&` when it has a query, after `?` otherwise.
 */
export function withQueryParam(url: string, name: string, value: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${name}=${value}`;
}
