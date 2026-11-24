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
 * hue, and synthesises the composite. The handler itself is
 * `routes/_shared/genre-artwork-route.ts`, which the commercial route shares.
 *
 * Marked immutable in `Cache-Control`: the same (genre, algorithm) pair always
 * produces the same bytes, so browsers and CDNs can hold the response
 * indefinitely. The tile URLs carry `GENRE_ARTWORK_VERSION` from
 * `services/genre-artwork/genre-key.ts`, the one version both tile families
 * share, so a generator change bumps it once.
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getCcGenreCoverUrl, getCcGenres } from "../services/cc/jamendo/client.js";
import { genreDisplayName } from "../services/genre-artwork/index.js";
import { type GenreArtworkSource, registerGenreArtworkRoute } from "./_shared/genre-artwork-route.js";

/** The CC family caches its artworks under `cc:<genreKey>`, apart from the commercial ones. */
const CC_CACHE_KEY_PREFIX = "cc:";

/**
 * Finds the cover and the display name of a CC genre artwork, from Jamendo only.
 *
 * Prefers the curated station's cleaned label (e.g. "Drum & Bass") over a
 * title-cased key. `getCcGenres` returns the static table in
 * `services/cc/jamendo/genres.ts`, so the name costs no Jamendo request. The
 * cover comes from a representative Jamendo album.
 *
 * @param genreKey - The normalized genre key, without the `cc:` prefix.
 * @returns The Jamendo cover URL, `null` when Jamendo has none, and the display name.
 */
async function loadCcSource(genreKey: string): Promise<GenreArtworkSource> {
  const displayName =
    (await getCcGenres()).find((genre) => genre.name === genreKey)?.displayName ?? genreDisplayName(genreKey);
  const coverUrl = await getCcGenreCoverUrl(genreKey);
  return { coverUrl, displayName };
}

/**
 * Registers `GET /api/v1/cc/genre-artwork/:genreKey`.
 *
 * Shares its handler with `routes/genre-artwork.ts` and is Jamendo-fed: what
 * differs is the `cc:` cache prefix, the cover source, and the display name,
 * which prefers the curated station's label.
 *
 * @param app - The Fastify instance to register the route on.
 */
export default async function ccGenreArtworkRoutes(app: FastifyInstance) {
  registerGenreArtworkRoute(app, {
    path: ROUTE_TEMPLATES.v1.ccGenreArtwork,
    summary: "Procedurally generated Creative-Commons genre artwork",
    description:
      "Returns a `512×512` JPEG derived only from Creative Commons source artwork. A stable generated image is served with `Cache-Control: public, max-age=31536000, immutable`. If source artwork is temporarily unavailable, the endpoint still returns a fallback JPEG with `Cache-Control: no-store`, allowing a later request to retry generation. This route is subject only to the global limit of `300` requests in a rolling `60`-second window per client IP.",
    genreKeyDescription:
      "Genre name from `CcGenreBrowseResponse.genres[].name`. URL-encode it when inserting it into the path; the endpoint lowercases and normalizes whitespace before validation.",
    okDescription: "Generated, cached, or transient fallback Creative Commons genre artwork as raw JPEG bytes.",
    cacheKeyPrefix: CC_CACHE_KEY_PREFIX,
    loadSource: loadCcSource,
  });
}
