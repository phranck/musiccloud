/**
 * @file The one implementation behind both genre artwork routes.
 *
 * `routes/genre-artwork.ts` (commercial, Last.fm-fed) and
 * `routes/cc-genre-artwork.ts` (Creative Commons, Jamendo-fed) differ only in
 * their path, their documentation texts, the prefix of their artwork cache key,
 * and where the cover and the display name come from. Everything else, the
 * schema head, the key guard, the cached reply and the generated reply, lives
 * here once.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { publicErrorResponse } from "../../docs/public-response-schema.js";
import {
  ensureArtwork,
  genreArtworkCacheControl,
  getCachedArtwork,
  isValidGenreKey,
  normalizeGenreKey,
} from "../../services/genre-artwork/index.js";

/** The status code of every artwork reply, cached or generated. */
const OK_STATUS = 200;

/** The status code of a refused genre key. */
const BAD_REQUEST_STATUS = 400;

/** The `Content-Type` every artwork reply is sent with. */
const JPEG_CONTENT_TYPE = "image/jpeg";

/** The error code a refused genre key is sent with, before the public error handler maps it. */
const INVALID_GENRE_KEY_ERROR = "INVALID_GENRE_KEY";

/** The message a refused genre key is sent with. */
const INVALID_GENRE_KEY_MESSAGE = "Genre key contains invalid characters.";

/** What a route needs to generate an artwork that is not cached yet. */
export interface GenreArtworkSource {
  /** The cover the artwork samples its color from, or `null` when the genre has none, which draws a flat fallback-color tile. */
  coverUrl: string | null;
  /** The genre name baked into the artwork. */
  displayName: string;
}

/** The parts in which the two genre artwork routes differ. */
export interface GenreArtworkRouteOptions {
  /** The Fastify route template, such as `ROUTE_TEMPLATES.v1.genreArtwork`. */
  path: string;
  /** The OpenAPI summary of the route. */
  summary: string;
  /** The OpenAPI description of the route. */
  description: string;
  /** The OpenAPI description of the `genreKey` path parameter. */
  genreKeyDescription: string;
  /** The OpenAPI description of the `200` response. */
  okDescription: string;
  /**
   * Prepended to the normalized genre key to form the key the artwork is cached
   * and generated under in the shared `genre_artworks` table. The empty string
   * for the commercial family and `cc:` for the Creative Commons family, so the
   * two never collide.
   */
  cacheKeyPrefix: string;
  /**
   * Finds the cover and the display name for a normalized genre key on a cache
   * miss. Runs only after the key passed validation and the cache had no entry.
   *
   * @param genreKey - The normalized genre key, without the cache key prefix.
   * @returns The cover URL and the display name to generate the artwork from.
   */
  loadSource(genreKey: string): Promise<GenreArtworkSource>;
}

/**
 * Sends artwork bytes as a JPEG with the `Cache-Control` value their fallback
 * flag decides.
 *
 * @param reply - The Fastify reply to send on.
 * @param jpeg - The artwork bytes.
 * @param isFallback - Whether the artwork is a transient fallback, sent as `no-store` instead of immutable.
 * @returns The sent reply.
 */
function sendArtwork(reply: FastifyReply, jpeg: Buffer, isFallback: boolean): FastifyReply {
  return reply
    .code(OK_STATUS)
    .header("Content-Type", JPEG_CONTENT_TYPE)
    .header("Cache-Control", genreArtworkCacheControl(isFallback))
    .send(jpeg);
}

/**
 * Registers one genre artwork route: `GET <path>` with a `genreKey` parameter.
 *
 * The handler normalizes the key and refuses one with invalid characters with
 * `400`. A cached artwork under `<cacheKeyPrefix><genreKey>` is sent as an
 * immutable JPEG. Otherwise `loadSource` supplies the cover and the display
 * name, `ensureArtwork` generates and stores the artwork under the same cache
 * key, and the result is sent immutable, or `no-store` when it is a transient
 * fallback. A missing cover never fails the request, so the grid never shows a
 * broken tile.
 *
 * The route does not call `apiRateLimiter`, because the browse grid loads its
 * tiles in parallel. Only the global per-IP limit applies.
 *
 * @param app - The Fastify instance to register the route on.
 * @param options - The path, documentation texts, cache key prefix and source loader of the route.
 */
export function registerGenreArtworkRoute(app: FastifyInstance, options: GenreArtworkRouteOptions): void {
  app.get<{ Params: { genreKey: string } }>(
    options.path,
    {
      schema: {
        tags: ["Artwork"],
        summary: options.summary,
        description: options.description,
        params: {
          type: "object",
          required: ["genreKey"],
          properties: {
            genreKey: {
              type: "string",
              description: options.genreKeyDescription,
            },
          },
        },
        response: {
          [OK_STATUS]: {
            description: options.okDescription,
            headers: {
              "Cache-Control": {
                type: "string",
                description:
                  "`public, max-age=31536000, immutable` for a stable image, or `no-store` for a transient fallback.",
              },
            },
            content: { [JPEG_CONTENT_TYPE]: { schema: { type: "string", format: "binary" } } },
          },
          [BAD_REQUEST_STATUS]: publicErrorResponse("The normalized genre key contains invalid characters."),
        },
      },
    },
    async (request, reply) => {
      const genreKey = normalizeGenreKey(request.params.genreKey);
      if (!isValidGenreKey(genreKey)) {
        return reply
          .code(BAD_REQUEST_STATUS)
          .send({ error: INVALID_GENRE_KEY_ERROR, message: INVALID_GENRE_KEY_MESSAGE });
      }

      const cacheKey = `${options.cacheKeyPrefix}${genreKey}`;
      const cached = await getCachedArtwork(cacheKey);
      if (cached) {
        return sendArtwork(reply, cached.jpeg, false);
      }

      const { coverUrl, displayName } = await options.loadSource(genreKey);
      const { jpeg, isFallback } = await ensureArtwork(cacheKey, coverUrl, displayName);
      return sendArtwork(reply, jpeg, isFallback);
    },
  );
}
