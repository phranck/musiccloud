/**
 * @file Reads a Last.fm API answer, telling "no such artist" apart from a failure.
 *
 * Last.fm answers HTTP 200 with `{"error": 6}` when the artist does not exist,
 * and an error status or another error number when the request was refused,
 * such as `10` for a bad key or `29` for the rate limit.
 */

import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";

/** The error number Last.fm answers with when the artist or track does not exist. */
const LASTFM_NOT_FOUND_ERROR = 6;

interface LastFmErrorBody {
  error?: number;
  message?: string;
}

/**
 * Parses a Last.fm answer.
 *
 * @param response - The answer to an API request.
 * @param operation - The API method, for the error message.
 * @returns The parsed body, or `null` when Last.fm does not know the artist.
 * @throws {UpstreamUnavailableError} for an error status, an error number
 *   other than "not found", or a body that is not JSON.
 */
export async function readLastFmJson<Body>(response: Response, operation: string): Promise<Body | null> {
  if (!response.ok) {
    throw new UpstreamUnavailableError("lastfm", `${operation} answered HTTP ${response.status}`);
  }

  let body: Body & LastFmErrorBody;
  try {
    body = (await response.json()) as Body & LastFmErrorBody;
  } catch (error) {
    throw new UpstreamUnavailableError("lastfm", `${operation} answered with a body that is not JSON`, error);
  }

  if (body.error !== undefined) {
    if (body.error === LASTFM_NOT_FOUND_ERROR) return null;
    throw new UpstreamUnavailableError(
      "lastfm",
      `${operation} answered error ${body.error}: ${body.message ?? "no message"}`,
    );
  }
  return body;
}
