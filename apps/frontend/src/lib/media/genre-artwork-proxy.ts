/**
 * @file The Astro proxy both genre tile families share for their artwork.
 *
 * The commercial and the Creative Commons tiles differ only in the backend
 * route they forward to, so one handler serves both and each page passes in
 * its backend call.
 */
import { decodeFormPathSegment, visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { backendUnavailableResponse, badRequestResponse, relayErrorResponse, relayHeaders } from "@/api/proxy-response";

/**
 * Fetches one genre artwork from the backend.
 *
 * @param genreKey - The plain genre key, such as `drum & bass`.
 * @param clientIp - The visitor's address, forwarded to the backend.
 * @returns The backend's raw response, or the error envelope of the backend
 *   client when no answer arrived.
 */
export type GenreArtworkFetcher = (genreKey: string, clientIp?: string) => Promise<Response>;

/** The status code of an artwork streamed through. */
const OK = 200;

/** The `Content-Type` sent when the backend answers without one. */
const DEFAULT_CONTENT_TYPE = "image/jpeg";

/**
 * The `Cache-Control` sent when the backend answers without one: the stable
 * artwork's policy, which the backend sends for every non-fallback tile.
 */
const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The backend headers a streamed artwork passes on, each replacing its default above. */
const FORWARDED_HEADERS = ["Content-Type", "Cache-Control"] as const;

/**
 * Builds the `GET` handler of a genre artwork proxy page.
 *
 * The page's `genreKey` parameter is the tile address's last segment as Astro
 * hands it on, written by `encodeFormPathSegment`: a space as `+`, a literal
 * plus sign as `%2B`. The handler reads it back into the plain key with
 * `decodeFormPathSegment` and passes that key on, so the backend receives it
 * percent-encoded once, like any public caller's. A segment written by an
 * older tile address, such as `hip hop` or `r%26b`, reads back the same way.
 *
 * Answers 400 with `MC-REQ-0001` for an empty segment or one with a broken
 * escape such as `100%`. Any other refusal passes on the backend's status and
 * error body, which is the backend client's envelope when the backend could
 * not be reached. An artwork whose body breaks off is answered 503 with
 * `MC-SYS-0002`, and otherwise the JPEG streams through with the backend's
 * `Content-Type` and `Cache-Control`.
 *
 * @param fetchArtwork - The backend call of the tile family.
 * @param operation - The page's name in the log line of a body that breaks
 *   off, such as `genre_artwork_proxy`, so the two families stay apart there.
 * @returns The handler the page exports as `GET`.
 */
export function createGenreArtworkProxy(fetchArtwork: GenreArtworkFetcher, operation: string): APIRoute {
  return async ({ request, params, clientAddress }) => {
    const genreKey = decodeFormPathSegment(params.genreKey ?? "");
    if (!genreKey) return badRequestResponse();

    try {
      const response = await fetchArtwork(genreKey, visitorAddress({ request, clientAddress }));
      if (!response.ok) return relayErrorResponse(response);
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: OK,
        headers: relayHeaders(response, FORWARDED_HEADERS, {
          "Content-Type": DEFAULT_CONTENT_TYPE,
          "Cache-Control": DEFAULT_CACHE_CONTROL,
        }),
      });
    } catch (error) {
      return backendUnavailableResponse(error, operation);
    }
  };
}
