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
import { ensureArtwork, getCachedArtwork } from "../services/genre-artwork/index.js";
import { getGenreCoverUrl } from "../services/genre-search/lastfm.js";

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
        tags: ["Services"],
        summary: "Procedurally generated genre artwork",
        description:
          "Returns a 512×512 JPEG rendered on the fly from the genre's top Last.fm album cover color. Deterministic per genre, cached permanently after first generation.",
        params: {
          type: "object",
          required: ["genreKey"],
          properties: {
            genreKey: { type: "string", description: "Normalised genre name (lowercase)." },
          },
        },
        response: {
          404: { $ref: "ErrorResponse#" },
          400: { $ref: "ErrorResponse#" },
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

      const coverUrl = await getGenreCoverUrl(genreKey);
      // No cover? We still generate an artwork using the fallback color
      // so the grid never shows a broken tile. Only refuse if the key is
      // genuinely nonsense (handled above).
      const { jpeg } = await ensureArtwork(genreKey, coverUrl, toDisplayName(genreKey));
      return reply
        .code(200)
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(jpeg);
    },
  );
}
