import { type ArtistInfoResponse, ENDPOINTS } from "@musiccloud/shared";

/**
 * Identifying context passed alongside an artist name when fetching artist
 * info. `artistEntityId` selects the exact normalized backend identity;
 * `shortId` remains a compatibility narrowing context when no entity id is
 * available.
 *
 * @property shortId - The share page's short id, when the artist column is
 *   rendered inside a known share page.
 * @property artistEntityId - Exact normalized artist identity forwarded to the
 *   artist-info endpoint. It takes precedence over `shortId` server-side.
 */
export interface ArtistInfoContext {
  shortId?: string;
  artistEntityId?: string;
}

/** Canonical backend failure preserved by the Artist Info browser client. */
export class ArtistInfoApiError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly errorId: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ArtistInfoApiError";
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isTransientStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

async function artistInfoApiError(response: Response): Promise<ArtistInfoApiError> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const error = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
  const errorId = typeof payload?.errorId === "string" ? payload.errorId : undefined;
  const message = typeof payload?.message === "string" ? payload.message : `HTTP ${response.status}`;
  return new ArtistInfoApiError(response.status, error, errorId, message);
}

/**
 * Fetches the commercial artist-info payload for a given artist.
 *
 * Assembles the query string for `ENDPOINTS.frontend.artistInfo` (an artist
 * name or exact entity id plus optional `region` and `shortId` context), issues
 * the GET request, and casts the JSON body to {@link ArtistInfoResponse}.
 * Retries exactly once for a transport failure or a 502, 503, or 504 before
 * consuming its body. Other responses retain their canonical backend fields in
 * {@link ArtistInfoApiError}; aborts and JSON decoding failures are not retried.
 * The caller owns the {@link AbortSignal} (and thus the request timeout).
 *
 * @param artistName - The artist name to look up.
 * @param userRegion - ISO region used to localize results; omitted from the
 *   query when empty.
 * @param context - Optional narrowing context ({@link ArtistInfoContext}).
 * @param signal - Abort signal the caller uses to cancel / time out the fetch.
 * @returns The parsed artist-info response.
 */
export async function fetchArtistInfo(
  artistName: string,
  userRegion: string,
  context: ArtistInfoContext,
  signal: AbortSignal,
): Promise<ArtistInfoResponse> {
  const params = new URLSearchParams();
  if (artistName) params.set("name", artistName);
  if (userRegion) params.set("region", userRegion);
  if (context.shortId) params.set("shortId", context.shortId);
  if (context.artistEntityId) params.set("artistEntityId", context.artistEntityId);
  const url = `${ENDPOINTS.frontend.artistInfo}?${params.toString()}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (error) {
      if (attempt === 0 && !isAbortError(error)) continue;
      throw error;
    }

    if (response.ok) return (await response.json()) as ArtistInfoResponse;
    if (attempt === 0 && isTransientStatus(response.status)) continue;
    throw await artistInfoApiError(response);
  }

  throw new Error("Artist Info request exhausted unexpectedly.");
}

/**
 * Fetches the CC artist-column payload for a Jamendo artist. Same shape and error
 * semantics as {@link fetchArtistInfo}, but hits `/api/cc/artist-info` (Jamendo
 * top + similar tracks + profile). The CC share page / live result load this
 * async after the core card renders; the caller owns the {@link AbortSignal}.
 *
 * @param jamendoArtistId - The Jamendo artist id whose column to fetch.
 * @param artistName - The artist name (column header context).
 * @param signal - Abort signal for cancellation / timeout.
 * @returns The parsed artist-info response.
 */
export async function fetchCcArtistInfo(
  jamendoArtistId: string,
  artistName: string,
  signal: AbortSignal,
): Promise<ArtistInfoResponse> {
  const params = new URLSearchParams({ jamendoArtistId, artistName });
  const res = await fetch(`${ENDPOINTS.frontend.ccArtistInfo}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ArtistInfoResponse;
}

/**
 * Classifies an error thrown by {@link fetchArtistInfo} into a short status code
 * for the VFD status line.
 *
 * @param err - The thrown error (or any value).
 * @returns A canonical backend code when available, `"TIMEOUT"` for an aborted
 *   request, an `HTTP <status>` fallback, or `"ERR"` for anything else.
 */
export function artistFetchErrorCode(err: unknown): string {
  if (err instanceof ArtistInfoApiError) return err.error;
  if (err instanceof Error && err.name === "AbortError") return "TIMEOUT";
  if (err instanceof Error && /^HTTP \d+/.test(err.message)) return err.message;
  return "ERR";
}
