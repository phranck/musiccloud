import { fetchGenreArtwork } from "@/api/client";
import { createGenreArtworkProxy } from "@/lib/media/genre-artwork-proxy";

/** Rendered per request, because every tile key is a different artwork. */
export const prerender = false;

/**
 * Astro proxy for backend `/api/v1/genre-artwork/:genreKey`. Streams the JPEG
 * through with the backend's immutable `Cache-Control`, so browsers and any
 * edge caches hold on to it. See `createGenreArtworkProxy` for how the tile
 * address is read.
 */
export const GET = createGenreArtworkProxy(fetchGenreArtwork);
