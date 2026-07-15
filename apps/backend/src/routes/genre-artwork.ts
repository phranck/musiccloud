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
 * response indefinitely. Bumping the SVG algorithm will require a cache
 * purge or a version-segmented URL.
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { publicErrorResponse } from "../docs/public-response-schema.js";
import { ensureArtwork, getCachedArtwork } from "../services/genre-artwork/index.js";
import { getCachedGenreCoverUrl, getGenreCoverUrl } from "../services/genre-search/lastfm.js";

const GENRE_KEY_PATTERN = /^[a-z0-9][a-z0-9 &'.\-+]{0,63}$/;

function normaliseGenreKey(raw: string): string {
  return decodeURIComponent(raw).toLowerCase().replace(/\s+/g, " ").trim();
}

function toDisplayName(genreKey: string): string {
  return genreKey.replace(/\b\w/g, (c) => c.toUpperCase());
}

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
      const genreKey = normaliseGenreKey(request.params.genreKey);
      if (!GENRE_KEY_PATTERN.test(genreKey)) {
        return reply.code(400).send({ error: "INVALID_GENRE_KEY", message: "Genre key contains invalid characters." });
      }

      const cached = await getCachedArtwork(genreKey);
      if (cached) {
        return reply
          .code(200)
          .header("Content-Type", "image/jpeg")
          .header("Cache-Control", "public, max-age=31536000, immutable")
          .send(cached.jpeg);
      }

      // Prefer the cover URL that was already captured when the browse
      // grid was built — the grid build already paid for one Last.fm call
      // per genre, and reusing its result avoids a parallel fan-out of
      // duplicate `tag.getTopAlbums` requests once the browser starts
      // loading all tiles at once. Only fall back to a fresh Last.fm
      // lookup when the browse cache was never populated (e.g. direct
      // URL hits after a cold restart).
      const coverUrl = getCachedGenreCoverUrl(genreKey) ?? (await getGenreCoverUrl(genreKey));
      // No cover? We still generate an artwork using the fallback color
      // so the grid never shows a broken tile. Only refuse if the key is
      // genuinely nonsense (handled above).
      const { jpeg, isFallback } = await ensureArtwork(genreKey, coverUrl, toDisplayName(genreKey));
      return (
        reply
          .code(200)
          .header("Content-Type", "image/jpeg")
          // A transient fallback (cover fetch failed) must NOT be cached
          // immutably or it freezes in the browser; serve it `no-store` so the
          // next view re-requests and retries the cover.
          .header("Cache-Control", isFallback ? "no-store" : "public, max-age=31536000, immutable")
          .send(jpeg)
      );
    },
  );
}
