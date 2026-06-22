import { type ArtistInfoResponse, ENDPOINTS } from "@musiccloud/shared";

/**
 * Identifying context passed alongside an artist name when fetching artist
 * info. Narrows the lookup to a specific resolved entity so the backend can
 * disambiguate same-named artists.
 *
 * @property shortId - The share page's short id, when the artist column is
 *   rendered inside a known share page.
 * @property artistEntityId - The resolved artist entity id, when known from a
 *   prior resolve.
 */
export interface ArtistInfoContext {
  shortId?: string;
  artistEntityId?: string;
}

/**
 * Fetches the commercial artist-info payload for a given artist.
 *
 * Assembles the query string for `ENDPOINTS.frontend.artistInfo` (name plus the
 * optional `region`, `shortId`, and `artistEntityId` narrowing params), issues
 * the GET request, and casts the JSON body to {@link ArtistInfoResponse}.
 * Throws `HTTP <status>` on a non-OK response; an aborted request rejects with
 * the underlying `AbortError`. The caller owns the {@link AbortSignal} (and thus
 * the request timeout).
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
  const params = new URLSearchParams({ name: artistName });
  if (userRegion) params.set("region", userRegion);
  if (context.shortId) params.set("shortId", context.shortId);
  if (context.artistEntityId) params.set("artistEntityId", context.artistEntityId);
  const res = await fetch(`${ENDPOINTS.frontend.artistInfo}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ArtistInfoResponse;
}

/**
 * Classifies an error thrown by {@link fetchArtistInfo} into a short status code
 * for the VFD status line.
 *
 * @param err - The thrown error (or any value).
 * @returns `"TIMEOUT"` for an aborted request, the `HTTP <status>` message for
 *   a non-OK response, and `"ERR"` for anything else.
 */
export function artistFetchErrorCode(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return "TIMEOUT";
  if (err instanceof Error && /^HTTP \d+/.test(err.message)) return err.message;
  return "ERR";
}
