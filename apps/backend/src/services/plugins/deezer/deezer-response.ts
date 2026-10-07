/**
 * @file Reads a Deezer API answer, telling "no such thing" apart from a failure.
 *
 * Deezer answers HTTP 200 with an `error` body for both: code `800`
 * (`DataException: no data`) when the requested object does not exist, and
 * other codes when the request was refused, such as `4` for the quota.
 */

import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";

/** The error code Deezer answers with when the requested object does not exist. */
const DEEZER_NO_DATA_CODE = 800;

interface DeezerErrorBody {
  error?: { type?: string; message?: string; code?: number };
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
