import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { ResolveError } from "../../../lib/resolve/errors";

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** Sends one authenticated YouTube Data API request without exposing its key to callers. */
export async function youtubeFetch(endpoint: string): Promise<Response> {
  const apiKey = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new ResolveError("MC-CFG-6001", "YOUTUBE_API_KEY must be set");
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  return fetchWithTimeout(`${API_BASE}${endpoint}${separator}key=${apiKey}`, {}, 5000);
}
