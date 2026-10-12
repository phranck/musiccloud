/**
 * @file Everything about a genre tile's artwork address and answer that the
 * commercial and the Creative Commons tiles share.
 *
 * Both tile families are drawn by one generator, so one cache-bust version,
 * one key rule, one display name and one cache header serve both. These parts
 * are pure and live apart from the generator, so the browse code and its tests
 * can use them without loading image rendering.
 */

import { ENDPOINTS } from "@musiccloud/shared";

/**
 * Cache-bust version of every genre tile URL, commercial and CC alike.
 *
 * The artwork routes send the JPEG as immutable, so a browser fetches a tile
 * again only when its URL changes. Bump this whenever the generator, its font,
 * its layout or its colour rules change, and every tile of both families
 * refetches.
 */
export const GENRE_ARTWORK_VERSION = 7;

/** The genre keys an artwork route accepts after {@link normalizeGenreKey}. */
export const GENRE_KEY_PATTERN = /^[a-z0-9][a-z0-9 &'.\-+]{0,63}$/;

/** The cache header of a stable artwork, which is the same bytes for the same key and version. */
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Whether an artwork route accepts a genre key.
 *
 * @param key - A normalized genre key.
 * @returns `true` when the key matches {@link GENRE_KEY_PATTERN}.
 */
export function isValidGenreKey(key: string): boolean {
  return GENRE_KEY_PATTERN.test(key);
}

/**
 * Turns the `:genreKey` path segment into the key artworks are stored under:
 * percent-decoded, lowercased, inner whitespace collapsed and trimmed.
 *
 * @param raw - The raw path segment.
 * @returns The normalized key.
 */
export function normalizeGenreKey(raw: string): string {
  return decodeURIComponent(raw).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The name a genre tile shows, both as its label and as the text baked into
 * its artwork, so the two cannot disagree.
 *
 * @param key - A normalized genre key.
 * @returns The key with every word capitalized.
 */
export function genreDisplayName(key: string): string {
  return key.replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * The `Cache-Control` value an artwork is sent with.
 *
 * A fallback, drawn because the cover could not be fetched, must not be
 * cached immutably or it freezes in the browser, so it is `no-store` and the
 * next view retries the cover.
 *
 * @param isFallback - Whether the artwork is a transient fallback.
 * @returns The header value.
 */
export function genreArtworkCacheControl(isFallback: boolean): string {
  return isFallback ? "no-store" : IMMUTABLE_CACHE_CONTROL;
}

/**
 * The `artworkUrl` of a commercial genre tile: the frontend proxy path with
 * the cache-bust version.
 *
 * @param genreKey - A normalized genre key.
 * @returns The relative URL the browser loads.
 */
export function genreArtworkTileUrl(genreKey: string): string {
  return `${ENDPOINTS.frontend.genreArtwork(genreKey)}?v=${GENRE_ARTWORK_VERSION}`;
}

/**
 * The `artworkUrl` of a Creative Commons genre tile.
 *
 * @param genreKey - A normalized genre key.
 * @returns The relative URL the browser loads.
 */
export function ccGenreArtworkTileUrl(genreKey: string): string {
  return `${ENDPOINTS.frontend.ccGenreArtwork(genreKey)}?v=${GENRE_ARTWORK_VERSION}`;
}
