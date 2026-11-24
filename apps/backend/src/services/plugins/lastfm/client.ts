/**
 * @file The Last.fm API client: where a request goes, how its answer is read,
 * and which picture of an answer's image list is shown.
 *
 * Every Last.fm caller in the backend asks through {@link lastFmGet}: the
 * artist wrappers beside this file, genre search, the tag crawler and the
 * track artwork lookup of the image cache. Last.fm answers HTTP 200 with
 * `{"error": 6}` when the artist, track or tag does not exist, and with another
 * error number when the request was refused, such as `10` for a bad key or
 * `29` for the rate limit. Reading that body in one place is what keeps a
 * refusal from being taken for an empty answer.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";

/** The endpoint every Last.fm method is called on. */
const LASTFM_API_BASE = "https://ws.audioscrobbler.com/2.0";

/** How long one Last.fm request may take before it counts as failed. */
const LASTFM_TIMEOUT_MS = 5000;

/** The error number Last.fm answers with when the artist, track or tag does not exist. */
const LASTFM_NOT_FOUND_ERROR = 6;

/** A plus sign as `URLSearchParams` encodes it inside a parameter value. */
const ENCODED_PLUS = "%2B";

/**
 * A plus sign encoded twice. Last.fm decodes a parameter value once more after
 * the standard decoding and reads a plain `+` as a space, so `%2B` alone turns
 * `Florence + The Machine` into `Florence   The Machine`, a different Last.fm
 * entry. `%252B` arrives as `+`. A space stays `+` in the query, which both
 * decodings read as a space.
 */
const DOUBLE_ENCODED_PLUS = "%252B";

/** Part of the address of the grey star Last.fm returns where it has no picture. */
const LASTFM_PLACEHOLDER_IMAGE_HASH = "2a96cbd8b46e442fc41c2b86b821562f";

/**
 * The error fields Last.fm puts into a 200 answer that refuses the request.
 *
 * @property error - The Last.fm error number, absent in a normal answer.
 * @property message - Last.fm's description of the error, when it sends one.
 */
interface LastFmErrorBody {
  error?: number;
  message?: string;
}

/** One entry of the `image` list Last.fm attaches to an artist, album or track. */
export interface LastFmImage {
  "#text": string;
  size: string;
}

/**
 * The configured Last.fm API key.
 *
 * @returns The key, or `null` when `LASTFM_API_KEY` is not set.
 */
export function lastFmApiKey(): string | null {
  return process.env.LASTFM_API_KEY || null;
}

/**
 * Parses a Last.fm answer.
 *
 * @param response - The answer to an API request.
 * @param method - The API method, for the error message.
 * @returns The parsed body, or `null` when Last.fm does not know what was asked for.
 * @throws {UpstreamUnavailableError} for an error status, an error number
 *   other than "not found", or a body that is not JSON.
 */
async function readLastFmJson<Body>(response: Response, method: string): Promise<Body | null> {
  if (!response.ok) {
    throw new UpstreamUnavailableError("lastfm", `${method} answered HTTP ${response.status}`);
  }

  let body: Body & LastFmErrorBody;
  try {
    body = (await response.json()) as Body & LastFmErrorBody;
  } catch (error) {
    throw new UpstreamUnavailableError("lastfm", `${method} answered with a body that is not JSON`, error);
  }

  if (body.error !== undefined) {
    if (body.error === LASTFM_NOT_FOUND_ERROR) return null;
    throw new UpstreamUnavailableError(
      "lastfm",
      `${method} answered error ${body.error}: ${body.message ?? "no message"}`,
    );
  }
  return body;
}

/**
 * Calls one Last.fm API method and reads its answer.
 *
 * Callers that answer "nothing" without a key check {@link lastFmApiKey}
 * first. A caller that reaches this without one has a configuration fault.
 *
 * @param method - The API method, such as `artist.getInfo`.
 * @param params - The method's own parameters, unencoded. The key and the
 *   format are added here, and a `+` in a value is sent as {@link DOUBLE_ENCODED_PLUS}.
 * @returns The parsed body, or `null` when Last.fm does not know what was asked for.
 * @throws {Error} when no API key is configured.
 * @throws {UpstreamUnavailableError} when Last.fm refused or did not answer properly.
 */
export async function lastFmGet<Body>(method: string, params: Record<string, string>): Promise<Body | null> {
  const apiKey = lastFmApiKey();
  if (!apiKey) throw new Error("LASTFM_API_KEY not configured");
  const query = new URLSearchParams({ method, api_key: apiKey, format: "json", ...params })
    .toString()
    .replaceAll(ENCODED_PLUS, DOUBLE_ENCODED_PLUS);
  const response = await fetchWithTimeout(`${LASTFM_API_BASE}/?${query}`, {}, LASTFM_TIMEOUT_MS);
  return readLastFmJson<Body>(response, method);
}

/**
 * Picks the picture to show from a Last.fm image list.
 *
 * @param images - The list as Last.fm returns it, smallest first.
 * @returns The extra-large picture or else the largest one, or `null` when the
 *   list is empty or holds only Last.fm's placeholder.
 */
export function pickLastFmImage(images: readonly LastFmImage[] | undefined): string | null {
  if (!images || images.length === 0) return null;
  const extraLarge = images.find((image) => image.size === "extralarge");
  const url = extraLarge?.["#text"] || images[images.length - 1]?.["#text"];
  if (!url || url.includes(LASTFM_PLACEHOLDER_IMAGE_HASH)) return null;
  return url;
}
