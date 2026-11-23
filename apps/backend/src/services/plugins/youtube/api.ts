import { Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { serviceConfigurationMissingError } from "../../../lib/resolve/service-errors";

/** The root every YouTube Data API v3 endpoint path is appended to. */
const API_BASE = "https://www.googleapis.com/youtube/v3";

/** How long one Data API request may take, in milliseconds, before `fetchWithTimeout` aborts it. */
const YOUTUBE_REQUEST_TIMEOUT_MS = 5000;

/** The environment variable that holds the YouTube Data API key. Without it every request fails with `MC-CFG-6001`. */
const YOUTUBE_API_KEY_VARIABLE = "YOUTUBE_API_KEY";

/**
 * Sends one authenticated YouTube Data API request without exposing its key to callers.
 *
 * @param endpoint - The path below `API_BASE`, with or without a query string.
 * @returns The raw response, which the caller checks for `ok`.
 * @throws A configuration `ResolveError` (`MC-CFG-6001`) when `YOUTUBE_API_KEY` is not set.
 */
export async function youtubeFetch(endpoint: string): Promise<Response> {
  const apiKey = process.env[YOUTUBE_API_KEY_VARIABLE];
  if (!apiKey) {
    throw serviceConfigurationMissingError(Service.YouTube, YOUTUBE_API_KEY_VARIABLE);
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  return fetchWithTimeout(`${API_BASE}${endpoint}${separator}key=${apiKey}`, {}, YOUTUBE_REQUEST_TIMEOUT_MS);
}
