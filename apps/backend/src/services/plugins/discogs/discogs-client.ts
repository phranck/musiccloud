/**
 * @file Discogs HTTP client.
 *
 * Thin wrapper around the Discogs REST API v2 that handles authentication,
 * request serialisation (rate guard), and raw-to-typed mapping. Pure I/O
 * layer -- no business logic, no caching, no retry.
 *
 * Configuration:
 * - `DISCOGS_TOKEN` -- Discogs personal access token. When absent, any
 *   search function that requires auth returns early with a "no result"
 *   value without making a network call.
 * - `DISCOGS_MIN_REQUEST_INTERVAL_MS` -- minimum gap (in ms) between
 *   consecutive outgoing requests. Defaults to 1100 to respect the Discogs
 *   guideline of ≤60 requests/minute. Set to `"0"` in test environments to
 *   skip all delays.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import type { DiscogsMasterVersion, DiscogsRelease, DiscogsTrack } from "./discogs-parse.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISCOGS_BASE_URL = "https://api.discogs.com";
const USER_AGENT = "musiccloud/1.0 +https://musiccloud.io";
const DEFAULT_MIN_INTERVAL_MS = 1100;

// ---------------------------------------------------------------------------
// Rate guard -- minimal in-process serialiser
// ---------------------------------------------------------------------------

/** Timestamp (ms) of the last outgoing Discogs request in this process. */
let lastRequestAt = 0;

/** Serial queue that reserves one Discogs request slot at a time. */
let rateGuardQueue: Promise<void> = Promise.resolve();

/**
 * Resolves the effective minimum inter-request interval in milliseconds.
 *
 * Reads `DISCOGS_MIN_REQUEST_INTERVAL_MS` from the environment. A missing or
 * non-numeric value (e.g. `"fast"`, empty string) falls back to
 * `DEFAULT_MIN_INTERVAL_MS`. The NaN guard is critical: without it a
 * non-numeric env value would produce `NaN`, and every `NaN < elapsed`
 * comparison in `rateGuard` is `false`, silently disabling the throttle.
 *
 * @returns The interval in milliseconds; never `NaN`.
 */
function resolveMinInterval(): number {
  const raw = process.env.DISCOGS_MIN_REQUEST_INTERVAL_MS;
  if (raw === undefined) {
    return DEFAULT_MIN_INTERVAL_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_MIN_INTERVAL_MS;
}

/**
 * Enforces the minimum inter-request interval configured via
 * `DISCOGS_MIN_REQUEST_INTERVAL_MS`. Awaits a short delay when the previous
 * request was issued too recently.
 *
 * @returns A promise that resolves once the guard interval has elapsed.
 */
function rateGuard(): Promise<void> {
  const guarded = rateGuardQueue.then(async () => {
    const minInterval = resolveMinInterval();
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < minInterval) {
      await new Promise<void>((resolve) => setTimeout(resolve, minInterval - elapsed));
    }
    lastRequestAt = Date.now();
  });
  rateGuardQueue = guarded.catch(() => undefined);
  return guarded;
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

/**
 * Builds the headers for every Discogs API call.
 *
 * Sends `User-Agent` unconditionally (required by Discogs ToS) and
 * `Authorization` when a token is configured.
 *
 * @returns A plain object of HTTP header name-value pairs.
 */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  const token = process.env.DISCOGS_TOKEN;
  if (token) {
    headers.Authorization = `Discogs token=${token}`;
  }
  return headers;
}

/**
 * Issues an authenticated GET request to the Discogs API and returns the
 * parsed JSON body.
 *
 * @param path - URL path starting with `/`, e.g. `/database/search?...`.
 * @returns The JSON-parsed response body.
 * @throws When the HTTP response status is not OK (e.g. 429, 5xx) or when
 *   `fetchWithTimeout` itself rejects (network error, timeout).
 */
async function discogsGet<T>(path: string): Promise<T> {
  await rateGuard();
  const url = `${DISCOGS_BASE_URL}${path}`;
  const response = await fetchWithTimeout(url, { headers: buildHeaders() });
  if (!response.ok) {
    throw new Error(`Discogs API error: ${response.status} ${url}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a non-empty `DISCOGS_TOKEN` is present in the
 * environment, indicating that the Discogs client is ready to make
 * authenticated requests.
 *
 * @returns `true` iff the token is configured.
 */
export function isDiscogsConfigured(): boolean {
  return typeof process.env.DISCOGS_TOKEN === "string" && process.env.DISCOGS_TOKEN.length > 0;
}

/**
 * Searches the Discogs database for a master release matching the given
 * artist and title, restricted to the Vinyl format.
 *
 * Hits `GET /database/search?type=master&format=Vinyl&artist=…&release_title=…`.
 *
 * When `DISCOGS_TOKEN` is not configured the function returns `null`
 * immediately **without** making any HTTP call. This keeps the token-absent
 * path clean and avoids unauthenticated search quotas.
 *
 * @param query - Search terms.
 * @param query.artist - Artist name (will be URL-encoded).
 * @param query.title - Release title (will be URL-encoded).
 * @returns The Discogs master ID of the first search result, or `null` when
 *   no results are found or the client is not configured.
 * @throws When the HTTP response is not OK or a network error occurs.
 */
export async function searchVinylMaster(query: { artist: string; title: string }): Promise<number | null> {
  if (!isDiscogsConfigured()) {
    return null;
  }

  const path =
    `/database/search?type=master&format=Vinyl` +
    `&artist=${encodeURIComponent(query.artist)}` +
    `&release_title=${encodeURIComponent(query.title)}`;

  const data = await discogsGet<{ results: Array<{ id: number }> }>(path);

  if (!data.results || data.results.length === 0) {
    return null;
  }

  return data.results[0].id;
}

/**
 * Fetches all Vinyl pressings for a given Discogs master release.
 *
 * Hits `GET /masters/{masterId}/versions?format=Vinyl` and maps the raw
 * `versions[]` array into `DiscogsMasterVersion[]`.
 *
 * @param masterId - Discogs master release ID.
 * @returns An array of `DiscogsMasterVersion` objects. Returns `[]` when the
 *   master has no Vinyl versions.
 * @throws When the HTTP response is not OK or a network error occurs.
 */
export async function getMasterVinylVersions(masterId: number): Promise<DiscogsMasterVersion[]> {
  interface VersionsPage {
    pagination?: { page: number; pages: number };
    versions: Array<{
      id: number;
      released: string;
      format: string;
      country?: string;
    }>;
  }

  const versions: VersionsPage["versions"] = [];
  let page = 1;
  let pages = 1;
  do {
    const data = await discogsGet<VersionsPage>(`/masters/${masterId}/versions?format=Vinyl&per_page=100&page=${page}`);
    versions.push(...(data.versions ?? []));
    pages = data.pagination?.pages ?? page;
    page += 1;
  } while (page <= pages);

  return versions.map(
    (v): DiscogsMasterVersion => ({
      id: v.id,
      released: v.released,
      format: v.format,
      country: v.country,
    }),
  );
}

/**
 * Fetches a single Discogs release and maps it to a `DiscogsRelease`.
 *
 * Hits `GET /releases/{releaseId}`. The full tracklist is preserved in the
 * returned object, including heading and index entries -- the caller
 * (`normalizeReleaseToLayout`) is responsible for filtering those out.
 *
 * @param releaseId - Discogs release ID.
 * @returns The mapped `DiscogsRelease` containing the release `id` and
 *   complete `tracklist`.
 * @throws When the HTTP response is not OK or a network error occurs.
 */
export async function getRelease(releaseId: number): Promise<DiscogsRelease> {
  const data = await discogsGet<{
    id: number;
    tracklist: Array<{
      position: string;
      type_: string;
      title: string;
      duration: string;
    }>;
  }>(`/releases/${releaseId}`);

  const tracklist: DiscogsTrack[] = data.tracklist.map((t) => ({
    position: t.position,
    type_: t.type_,
    title: t.title,
    duration: t.duration,
  }));

  return { id: data.id, tracklist };
}
