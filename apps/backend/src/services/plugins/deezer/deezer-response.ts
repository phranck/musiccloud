/**
 * @file The Deezer API client: where a request goes, and how an answer is read
 * so that "no such thing" is told apart from a failure.
 *
 * Every Deezer caller in the backend asks through {@link deezerFetch} or
 * {@link deezerGet}: the adapter, its helper modules, Deezer genre search, the
 * genre map and the chart crawler. Deezer answers HTTP 200 with an `error`
 * body for both outcomes: code `800` (`DataException: no data`) when the
 * requested object does not exist, and other codes when the request was
 * refused, such as `4` for the quota.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";

/** The public, keyless Deezer API every path is appended to. */
const DEEZER_API_BASE = "https://api.deezer.com";

/** How long one Deezer request may take before it counts as failed. */
const DEEZER_TIMEOUT_MS = 5000;

/** The error code Deezer answers with when the requested object does not exist. */
const DEEZER_NO_DATA_CODE = 800;

interface DeezerErrorBody {
  error?: { type?: string; message?: string; code?: number };
}

/**
 * Sends one request to the Deezer API.
 *
 * Use this where the caller maps the HTTP status itself, as the adapter's
 * lookups do for their not-found errors. Everything else reads the answer
 * through {@link deezerGet}.
 *
 * @param path - The path and query below the API root, starting with `/`.
 * @returns The raw answer.
 */
export function deezerFetch(path: string): Promise<Response> {
  return fetchWithTimeout(`${DEEZER_API_BASE}${path}`, {}, DEEZER_TIMEOUT_MS);
}

/**
 * Parses a Deezer answer.
 *
 * @param response - The answer to an API request.
 * @param operation - What was asked, for the error message.
 * @returns The parsed body, or `null` when Deezer has no such object.
 * @throws {UpstreamUnavailableError} for an error status, an error body other
 *   than "no data", or a body that is not JSON.
 */
export async function readDeezerJson<Body>(response: Response, operation: string): Promise<Body | null> {
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new UpstreamUnavailableError("deezer", `${operation} answered HTTP ${response.status}`);
  }

  let body: Body & DeezerErrorBody;
  try {
    body = (await response.json()) as Body & DeezerErrorBody;
  } catch (error) {
    throw new UpstreamUnavailableError("deezer", `${operation} answered with a body that is not JSON`, error);
  }

  if (body.error) {
    if (body.error.code === DEEZER_NO_DATA_CODE) return null;
    throw new UpstreamUnavailableError(
      "deezer",
      `${operation} answered error ${body.error.code ?? "?"}: ${body.error.message ?? "no message"}`,
    );
  }
  return body;
}

/**
 * Asks the Deezer API for one path and reads the answer.
 *
 * @param path - The path and query below the API root, starting with `/`.
 * @param operation - What was asked, for the error message.
 * @returns The parsed body, or `null` when Deezer has no such object.
 * @throws {UpstreamUnavailableError} when Deezer refused or did not answer properly.
 */
export async function deezerGet<Body>(path: string, operation: string): Promise<Body | null> {
  return readDeezerJson<Body>(await deezerFetch(path), operation);
}
