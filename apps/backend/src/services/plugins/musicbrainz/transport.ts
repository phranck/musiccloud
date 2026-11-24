/**
 * @file The HTTP transport every MusicBrainz request in the backend goes through.
 *
 * Auth: none (keyless WS/2 API).
 *
 * Rate limit: 1 req/s for unauthenticated callers, enforced via
 * `acquireMusicBrainzSlot()` in `./rate-limit.ts`. Exceeding it produces 503
 * with `Retry-After`. The gate is mandatory, so no request bypasses it.
 *
 * User-Agent: required by MusicBrainz. Built from the `MUSICBRAINZ_CONTACT`
 * env var, defaulting to a project-level contact when unset.
 *
 * The adapter and the artist identity enrichment both import from here, so
 * they share one request gate and one contact `User-Agent`.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { sleep } from "../../../lib/infra/throttle";
import { acquireMusicBrainzSlot } from "./rate-limit.js";

/** The base URL of the MusicBrainz WS/2 web service. */
const API_BASE = "https://musicbrainz.org/ws/2";
/** How long one MusicBrainz request may take, its answer included. */
const TIMEOUT_MS = 10_000;
/** How many times a 503 answer is retried before it is returned to the caller. */
const MAX_503_RETRIES = 1;
/** The wait before retrying a 503 that names no usable `Retry-After`. */
const DEFAULT_503_RETRY_AFTER_MS = 1100;
/** The longest wait before retrying a 503, whatever `Retry-After` asks for. */
const MAX_503_RETRY_AFTER_MS = 5000;
/** The contact MusicBrainz sees in the `User-Agent` when `MUSICBRAINZ_CONTACT` is unset. */
const DEFAULT_CONTACT = "musiccloud@layered.work";
/** Milliseconds in one second, for a `Retry-After` given in seconds. */
const MS_PER_SECOND = 1000;

/**
 * Builds the `User-Agent` MusicBrainz requires, naming the application and a
 * contact address.
 *
 * @returns `musiccloud/1.0 ( <contact> )`, with the contact read from
 *   `MUSICBRAINZ_CONTACT` on every call and `DEFAULT_CONTACT` when it is unset.
 */
function userAgent(): string {
  const contact = process.env.MUSICBRAINZ_CONTACT ?? DEFAULT_CONTACT;
  return `musiccloud/1.0 ( ${contact} )`;
}

/**
 * Reads how long to wait before retrying a 503 from its `Retry-After` header.
 *
 * @param value - The header as received: a number of seconds, an HTTP date, or
 *   `null` when the header is absent.
 * @returns The wait in milliseconds, capped at `MAX_503_RETRY_AFTER_MS`. A date
 *   in the past gives `0`. An absent or unreadable header gives
 *   `DEFAULT_503_RETRY_AFTER_MS`.
 */
function parseRetryAfterMs(value: string | null): number {
  if (!value) return DEFAULT_503_RETRY_AFTER_MS;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * MS_PER_SECOND, MAX_503_RETRY_AFTER_MS);
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), MAX_503_RETRY_AFTER_MS);
  }

  return DEFAULT_503_RETRY_AFTER_MS;
}

/**
 * Requests a MusicBrainz web service path through the shared request gate,
 * with the contact `User-Agent` MusicBrainz requires, retrying one 503 after
 * the delay MusicBrainz asks for. Every MusicBrainz call in the backend goes
 * through here, so the gate holds across the adapter and the identity
 * enrichment alike.
 *
 * @param endpoint - The path below `/ws/2`, with its query string.
 * @returns The response as received, whatever its status.
 */
export async function mbFetch(endpoint: string): Promise<Response> {
  const url = `${API_BASE}${endpoint}`;

  for (let attempt = 0; ; attempt += 1) {
    await acquireMusicBrainzSlot();
    const response = await fetchWithTimeout(
      url,
      { headers: { "User-Agent": userAgent(), Accept: "application/json" } },
      TIMEOUT_MS,
    );

    if (response.status !== 503 || attempt >= MAX_503_RETRIES) {
      return response;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
    log.debug("MusicBrainz", "503 response, retrying:", endpoint, retryAfterMs);
    await sleep(retryAfterMs);
  }
}

/**
 * Reads a MusicBrainz response body as JSON.
 *
 * @param response - A successful response.
 * @param context - What was requested, for the debug log.
 * @returns The parsed body, or `null` when it is not valid JSON.
 */
export async function parseMusicBrainzJson<T>(response: Response, context: string): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    log.debug("MusicBrainz", "Malformed JSON response:", context, error instanceof Error ? error.message : error);
    return null;
  }
}
