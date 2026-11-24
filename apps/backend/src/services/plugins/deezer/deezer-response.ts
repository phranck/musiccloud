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

import { Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";
import { readProviderJson } from "../_shared/provider-response.js";

/** The public, keyless Deezer API every path is appended to. */
const DEEZER_API_BASE = "https://api.deezer.com";

/** How long one Deezer request may take before it counts as failed. */
const DEEZER_TIMEOUT_MS = 5000;

/** The error code Deezer answers with when the requested object does not exist. */
const DEEZER_NO_DATA_CODE = 800;

/**
 * One recording as Deezer's API describes it, in a lookup, a track search or an
 * artist's top tracks. Every Deezer module reads its recordings through this type.
 *
 * @property id - Deezer's recording id.
 * @property title - The recording title.
 * @property artist - The main artist credit.
 * @property album - The release the recording appears on, with its covers from
 *   the largest, `cover_xl` at roughly 1000x1000, through `cover_big` at roughly
 *   500x500, to `cover_medium`. A lookup can omit it.
 * @property duration - The length in seconds.
 * @property isrc - The recording's ISRC.
 * @property explicit_lyrics - Whether Deezer marks the lyrics explicit.
 * @property preview - The URL of a preview clip.
 * @property link - The recording's page on deezer.com.
 * @property contributors - Every credited artist, sent with an artist's top tracks.
 */
export interface DeezerTrack {
  id: number;
  title: string;
  artist: { name: string };
  album?: {
    title?: string;
    cover_xl?: string;
    cover_big?: string;
    cover_medium?: string;
    release_date?: string;
  };
  duration: number;
  isrc?: string;
  explicit_lyrics?: boolean;
  preview?: string;
  link?: string;
  contributors?: { name: string }[];
}

/**
 * A {@link DeezerTrack} from a list Deezer returns, a track search or an artist's
 * top tracks, which always names its album and its page on deezer.com.
 */
export type DeezerListedTrack = DeezerTrack & Required<Pick<DeezerTrack, "album" | "link">>;

/**
 * The API path of one Deezer artist, below which its top tracks are listed too.
 *
 * @param artistId - The Deezer artist id, as a number or as received in a URL.
 * @returns `/artist/{id}` with the id URL-encoded.
 */
export function deezerArtistPath(artistId: number | string): string {
  return `/artist/${encodeURIComponent(String(artistId))}`;
}

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

  const body = await readProviderJson<Body & DeezerErrorBody>(response, Service.Deezer, operation);
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
