/**
 * @file The Astro proxy both genre tile families share for their artwork.
 *
 * The commercial and the Creative Commons tiles differ only in the backend
 * route they forward to, so one handler serves both and each page passes in
 * its backend call.
 */
import { decodeFormPathSegment, visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";

/**
 * Fetches one genre artwork from the backend.
 *
 * @param genreKey - The plain genre key, such as `drum & bass`.
 * @param clientIp - The visitor's address, forwarded to the backend.
 * @returns The backend's raw response.
 */
export type GenreArtworkFetcher = (genreKey: string, clientIp?: string) => Promise<Response>;

/** The status code of a tile address whose key is empty or not a valid encoding. */
const BAD_REQUEST = 400;

/** The status code of an artwork streamed through. */
const OK = 200;

/** The status code when the backend cannot be reached. */
const SERVICE_UNAVAILABLE = 503;

/** The `Content-Type` sent when the backend answers without one. */
const DEFAULT_CONTENT_TYPE = "image/jpeg";

/**
 * The `Cache-Control` sent when the backend answers without one: the stable
 * artwork's policy, which the backend sends for every non-fallback tile.
 */
const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

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
 * Answers 400 for an empty segment or one with a broken escape such as
 * `100%`, the backend's status for any other refusal, 503 when the backend
 * cannot be reached, and otherwise streams the JPEG through with the
 * backend's `Content-Type` and `Cache-Control`.
 *
 * @param fetchArtwork - The backend call of the tile family.
 * @returns The handler the page exports as `GET`.
 */
export function createGenreArtworkProxy(fetchArtwork: GenreArtworkFetcher): APIRoute {
  return async ({ request, params, clientAddress }) => {
    const genreKey = decodeFormPathSegment(params.genreKey ?? "");
    if (!genreKey) return new Response(null, { status: BAD_REQUEST });

    try {
      const response = await fetchArtwork(genreKey, visitorAddress({ request, clientAddress }));
      if (!response.ok) return new Response(null, { status: response.status });
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: OK,
        headers: {
          "Content-Type": response.headers.get("Content-Type") ?? DEFAULT_CONTENT_TYPE,
          "Cache-Control": response.headers.get("Cache-Control") ?? DEFAULT_CACHE_CONTROL,
        },
      });
    } catch {
      return new Response(null, { status: SERVICE_UNAVAILABLE });
    }
  };
}
