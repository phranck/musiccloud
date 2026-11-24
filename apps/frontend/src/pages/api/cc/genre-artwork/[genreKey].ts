import { fetchCcGenreArtwork } from "@/api/client";
import { createGenreArtworkProxy } from "@/lib/media/genre-artwork-proxy";

/** Rendered per request, because every tile key is a different artwork. */
export const prerender = false;

/**
 * Astro proxy for backend `/api/v1/cc/genre-artwork/:genreKey`, the
 * Jamendo-sourced Creative Commons tile cover. Behaves exactly like the
 * commercial `pages/api/genre-artwork/[genreKey].ts`, through the same
 * `createGenreArtworkProxy`.
 */
export const GET = createGenreArtworkProxy(fetchCcGenreArtwork);
