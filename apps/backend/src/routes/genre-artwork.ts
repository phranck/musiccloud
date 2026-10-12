/**
 * @file Serves procedurally generated genre artworks.
 *
 * The browse grid references one of these per tile via `artworkUrl`. On a
 * cache hit the JPEG comes straight out of Postgres; on a miss the service
 * pulls the genre's top Last.fm album cover, samples its dominant hue, and
 * synthesises a deterministic atmospheric image (see
 * `services/genre-artwork/generator.ts`).
 *
 * Marked immutable in `Cache-Control`: the same (genre, algorithm) pair
 * always produces the same bytes, so browsers and CDNs can hold onto a
 * response indefinitely. The tile URLs carry `GENRE_ARTWORK_VERSION`, so a
 * generator change bumps that one value and every tile is fetched again.
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { publicErrorResponse } from "../docs/public-response-schema.js";
import {
  ensureArtwork,
  genreArtworkCacheControl,
  genreDisplayName,
  getCachedArtwork,
  isValidGenreKey,
  normalizeGenreKey,
} from "../services/genre-artwork/index.js";
import { getCachedGenreCoverUrl, getGenreCoverUrl } from "../services/genre-search/lastfm.js";

export default async function genreArtworkRoutes(app: FastifyInstance) {
  app.get<{ Params: { genreKey: string } }>(
    ROUTE_TEMPLATES.v1.genreArtwork,
    {
      schema: {
        tags: ["Artwork"],
        summary: "Procedurally generated genre artwork",
        description:
          "Returns a `512×512` JPEG for a normalized genre. A stable generated image is served with `Cache-Control: public, max-age=31536000, immutable`. If source artwork is temporarily unavailable, the endpoint still returns a fallback JPEG with `Cache-Control: no-store`, allowing a later request to retry generation. This route is subject only to the global limit of `300` requests in a rolling `60`-second window per client IP.",
        params: {
          type: "object",
          required: ["genreKey"],
          properties: {
            genreKey: {
              type: "string",
              description:
                "Genre name from `GenreBrowseResponse.genres[].name`. URL-encode it when inserting it into the path; the endpoint lowercases and normalizes whitespace before validation.",
            },
          },
        },
        response: {
          200: {
            description: "Generated, cached, or transient fallback genre artwork as raw JPEG bytes.",
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

      const cached = await getCachedArtwork(genreKey);
      if (cached) {
        return reply
          .code(200)
          .header("Content-Type", "image/jpeg")
          .header("Cache-Control", genreArtworkCacheControl(false))
          .send(cached.jpeg);
      }

      // Prefer the cover URL captured when the browse grid was built. The
      // grid build already paid for one Last.fm call per genre, and reusing
      // its result avoids a parallel fan-out of duplicate `tag.getTopAlbums`
      // requests once the browser loads all tiles at once. A fresh Last.fm
      // lookup runs only when the browse cache was never filled, such as for
      // a direct URL hit after a cold restart.
      const coverUrl = getCachedGenreCoverUrl(genreKey) ?? (await getGenreCoverUrl(genreKey));
      // Without a cover the artwork is drawn in the fallback color, so the
      // grid never shows a broken tile. Only a nonsense key is refused, above.
      const { jpeg, isFallback } = await ensureArtwork(genreKey, coverUrl, genreDisplayName(genreKey));
      return reply
        .code(200)
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", genreArtworkCacheControl(isFallback))
        .send(jpeg);
    },
  );
}
