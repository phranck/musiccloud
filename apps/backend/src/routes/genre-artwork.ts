/**
 * @file Serves procedurally generated genre artworks.
 *
 * The browse grid references one of these per tile via `artworkUrl`. On a
 * cache hit the JPEG comes straight out of Postgres; on a miss the service
 * pulls the genre's top Last.fm album cover, samples its dominant hue, and
 * synthesises a deterministic atmospheric image (see
 * `services/genre-artwork/generator.ts`). The handler itself is
 * `routes/_shared/genre-artwork-route.ts`, which the CC route shares.
 *
 * Marked immutable in `Cache-Control`: the same (genre, algorithm) pair
 * always produces the same bytes, so browsers and CDNs can hold onto a
 * response indefinitely. The tile URLs carry `GENRE_ARTWORK_VERSION`, so a
 * generator change bumps that one value and every tile is fetched again.
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { genreDisplayName } from "../services/genre-artwork/index.js";
import { getCachedGenreCoverUrl } from "../services/genre-search/browse-grid.js";
import { getGenreCoverUrl } from "../services/genre-search/lastfm-api.js";
import { type GenreArtworkSource, registerGenreArtworkRoute } from "./_shared/genre-artwork-route.js";

/** The commercial family caches its artworks under the bare genre key. */
const COMMERCIAL_CACHE_KEY_PREFIX = "";

/**
 * Finds the cover and the display name of a commercial genre artwork.
 *
 * Prefers the cover URL captured when the browse grid was built. The grid build
 * already paid for one Last.fm call per genre, and reusing its result avoids a
 * parallel fan-out of duplicate `tag.getTopAlbums` requests once the browser
 * loads all tiles at once. A fresh Last.fm lookup runs only when the browse
 * cache was never filled, such as for a direct URL hit after a cold restart.
 *
 * @param genreKey - The normalized genre key.
 * @returns The cover URL, `null` when Last.fm has none, and the title-cased key as display name.
 */
async function loadCommercialSource(genreKey: string): Promise<GenreArtworkSource> {
  const coverUrl = getCachedGenreCoverUrl(genreKey) ?? (await getGenreCoverUrl(genreKey));
  return { coverUrl, displayName: genreDisplayName(genreKey) };
}

/**
 * Registers `GET /api/v1/genre-artwork/:genreKey`.
 *
 * @param app - The Fastify instance to register the route on.
 */
export default async function genreArtworkRoutes(app: FastifyInstance) {
  registerGenreArtworkRoute(app, {
    path: ROUTE_TEMPLATES.v1.genreArtwork,
    summary: "Procedurally generated genre artwork",
    description:
      "Returns a `512×512` JPEG for a normalized genre. A stable generated image is served with `Cache-Control: public, max-age=31536000, immutable`. If source artwork is temporarily unavailable, the endpoint still returns a fallback JPEG with `Cache-Control: no-store`, allowing a later request to retry generation. This route is subject only to the global limit of `300` requests in a rolling `60`-second window per client IP.",
    genreKeyDescription:
      "Genre name from `GenreBrowseResponse.genres[].name`. URL-encode it when inserting it into the path; the endpoint lowercases and normalizes whitespace before validation.",
    okDescription: "Generated, cached, or transient fallback genre artwork as raw JPEG bytes.",
    cacheKeyPrefix: COMMERCIAL_CACHE_KEY_PREFIX,
    loadSource: loadCommercialSource,
  });
}
