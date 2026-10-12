/**
 * @file Serves procedurally generated Creative-Commons genre artworks.
 *
 * The CC browse grid references one of these per tile via `artworkUrl`. The
 * tile uses the shared Spotify-style composite, which is a flat fill in the
 * cover's average colour, the genre name baked upper-left, and a rotated cover
 * thumbnail tucked into the lower-right, identical to the commercial tiles. The
 * CC path stays 100% Jamendo: the cover comes from a representative Jamendo
 * album, never Last.fm or Deezer.
 *
 * On a cache hit the JPEG comes straight out of Postgres (keyed `cc:<genreKey>`
 * so CC and commercial artworks never collide on the shared `genre_artworks`
 * table); on a miss the service fetches the Jamendo cover, samples its dominant
 * hue, and synthesises the composite.
 *
 * Marked immutable in `Cache-Control`: the same (genre, algorithm) pair always
 * produces the same bytes, so browsers and CDNs can hold the response
 * indefinitely. The tile URLs carry `GENRE_ARTWORK_VERSION` from
 * `services/genre-artwork/genre-key.ts`, the one version both tile families
 * share, so a generator change bumps it once.
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { publicErrorResponse } from "../docs/public-response-schema.js";
import { getCcGenreCoverUrl, getCcGenres } from "../services/cc/jamendo/client.js";
import {
  ensureArtwork,
  genreArtworkCacheControl,
  genreDisplayName,
  getCachedArtwork,
  isValidGenreKey,
  normalizeGenreKey,
} from "../services/genre-artwork/index.js";

/**
 * Registers `GET /api/v1/cc/genre-artwork/:genreKey`.
 *
 * Mirrors `routes/genre-artwork.ts` but is Jamendo-fed: what differs is the
 * `cc:` cache prefix, the cover source, and the display name, which prefers
 * the curated station's label. Like the commercial route it does NOT call
 * `apiRateLimiter`, so it is exempt from the 10 requests / 60 seconds per-IP
 * quota, because the frontend loads CC tiles in parallel from the browse grid.
 * The global 300 requests/minute ceiling still applies.
 *
 * @param app - The Fastify instance to register the route on.
 */
export default async function ccGenreArtworkRoutes(app: FastifyInstance) {
  app.get<{ Params: { genreKey: string } }>(
    ROUTE_TEMPLATES.v1.ccGenreArtwork,
    {
      schema: {
        tags: ["Artwork"],
        summary: "Procedurally generated Creative-Commons genre artwork",
        description:
          "Returns a `512×512` JPEG derived only from Creative Commons source artwork. A stable generated image is served with `Cache-Control: public, max-age=31536000, immutable`. If source artwork is temporarily unavailable, the endpoint still returns a fallback JPEG with `Cache-Control: no-store`, allowing a later request to retry generation. This route is subject only to the global limit of `300` requests in a rolling `60`-second window per client IP.",
        params: {
          type: "object",
          required: ["genreKey"],
          properties: {
            genreKey: {
              type: "string",
              description:
                "Genre name from `CcGenreBrowseResponse.genres[].name`. URL-encode it when inserting it into the path; the endpoint lowercases and normalizes whitespace before validation.",
            },
          },
        },
        response: {
          200: {
            description: "Generated, cached, or transient fallback Creative Commons genre artwork as raw JPEG bytes.",
            headers: {
              "Cache-Control": {
                type: "string",
                description:
                  "`public, max-age=31536000, immutable` for a stable image, or `no-store` for a transient fallback.",
              },
            },
            content: { "image/jpeg": { schema: { type: "string", format: "binary" } } },
          },
          400: publicErrorResponse("The normalized genre key contains invalid characters."),
        },
      },
    },
    async (request, reply) => {
      const genreKey = normalizeGenreKey(request.params.genreKey);
      if (!isValidGenreKey(genreKey)) {
        return reply.code(400).send({ error: "INVALID_GENRE_KEY", message: "Genre key contains invalid characters." });
      }

      const cacheKey = `cc:${genreKey}`;
      const cached = await getCachedArtwork(cacheKey);
      if (cached) {
        return reply
          .code(200)
          .header("Content-Type", "image/jpeg")
          .header("Cache-Control", genreArtworkCacheControl(false))
          .send(cached.jpeg);
      }

      // Prefer the curated station's cleaned label (e.g. "Drum & Bass") over a
      // title-cased key. `getCcGenres` is memoized, so this never refetches
      // `/radios` per tile.
      const displayName =
        (await getCcGenres()).find((g) => g.name === genreKey)?.displayName ?? genreDisplayName(genreKey);
      // `ensureArtwork` tolerates a missing cover and renders a flat-colour
      // tile with the name baked in, so the grid never shows a broken tile.
      // Only a nonsense key is refused, above.
      const coverUrl = await getCcGenreCoverUrl(genreKey);
      const { jpeg, isFallback } = await ensureArtwork(cacheKey, coverUrl, displayName);
      return reply
        .code(200)
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", genreArtworkCacheControl(isFallback))
        .send(jpeg);
    },
  );
}
