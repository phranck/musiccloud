/**
 * @file Serves procedurally generated Creative-Commons genre artworks.
 *
 * The CC browse grid references one of these per tile via `artworkUrl`. The
 * tile is rendered to look identical to the commercial genre tiles — a
 * representative cover with the genre name baked into the upper-left at the
 * same font, size, and margins — by reusing the shared
 * `services/genre-artwork` generator. The only difference from the commercial
 * route is the cover source: the CC path stays 100% Jamendo and pulls the
 * cover from a representative Jamendo album, never Last.fm or Deezer.
 *
 * On a cache hit the JPEG comes straight out of Postgres (keyed `cc:<genreKey>`
 * so CC and commercial artworks never collide on the shared `genre_artworks`
 * table); on a miss the service fetches the Jamendo cover, samples its dominant
 * hue, and synthesises a deterministic atmospheric image.
 *
 * Marked immutable in `Cache-Control`: the same (genre, algorithm) pair always
 * produces the same bytes, so browsers and CDNs can hold the response
 * indefinitely. Bumping the generator algorithm requires a cache purge or a
 * version-segmented URL (see `CC_ARTWORK_VERSION` in `services/cc/cc-genre.ts`).
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getCcGenreCoverUrl, getCcGenres } from "../services/cc/jamendo/client.js";
import { ensureArtwork, getCachedArtwork } from "../services/genre-artwork/index.js";

const GENRE_KEY_PATTERN = /^[a-z0-9][a-z0-9 &'.\-+]{0,63}$/;

/**
 * Canonicalises a raw genre key from the URL: percent-decoded, lowercased,
 * inner whitespace collapsed, trimmed. Matches the commercial route's
 * normalisation so both caches key on the same shape.
 *
 * @param raw - The raw `:genreKey` path segment.
 * @returns The normalised genre key.
 */
function normaliseGenreKey(raw: string): string {
  return decodeURIComponent(raw).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Title-cases a genre key for the baked-in label when the genre is not in
 * Jamendo's curated station list (fallback only — the station `displayName`
 * is preferred when available).
 *
 * @param genreKey - The normalised genre key.
 * @returns The title-cased display name.
 */
function toDisplayName(genreKey: string): string {
  return genreKey.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Registers `GET /api/v1/cc/genre-artwork/:genreKey`.
 *
 * Mirrors `routes/genre-artwork.ts` structurally but is Jamendo-fed. Like the
 * commercial route it does NOT call `apiRateLimiter`, so it is exempt from the
 * 10 requests / 60 seconds per-IP quota — the frontend loads CC tiles in
 * parallel from the browse grid. The global 300 requests/minute ceiling still
 * applies.
 *
 * @param app - The Fastify instance to register the route on.
 */
export default async function ccGenreArtworkRoutes(app: FastifyInstance) {
  app.get<{ Params: { genreKey: string } }>(
    ROUTE_TEMPLATES.v1.ccGenreArtwork,
    {
      schema: {
        tags: ["Services"],
        summary: "Procedurally generated Creative-Commons genre artwork",
        description:
          "Returns a 512×512 JPEG rendered on the fly from a representative Jamendo album cover, with the genre name baked into the upper-left. Deterministic per genre, cached permanently after first generation. 100% Jamendo-sourced — the CC path never touches Last.fm. " +
          "**Exempt from the 10 requests per 60 seconds per-IP quota** that applies to other public endpoints — the frontend loads tiles in parallel from a Browse grid. " +
          "The global 300 requests/minute ceiling still applies.",
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

      const cacheKey = `cc:${genreKey}`;
      const cached = await getCachedArtwork(cacheKey);
      if (cached) {
        return reply
          .code(200)
          .header("Content-Type", "image/jpeg")
          .header("Cache-Control", "public, max-age=31536000, immutable")
          .send(cached.jpeg);
      }

      // Prefer the curated station's cleaned label (e.g. "Drum & Bass") over a
      // title-cased key — `getCcGenres` is memoized, so this never refetches
      // `/radios` per tile.
      const displayName =
        (await getCcGenres()).find((g) => g.name === genreKey)?.displayName ?? toDisplayName(genreKey);
      // No cover? `ensureArtwork` tolerates a null cover and renders a
      // flat-colour tile with the name baked in, so the grid never shows a
      // broken tile (no 404). Only refuse on a genuinely nonsense key (above).
      const coverUrl = await getCcGenreCoverUrl(genreKey);
      const { jpeg } = await ensureArtwork(cacheKey, coverUrl, displayName);
      return reply
        .code(200)
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(jpeg);
    },
  );
}
