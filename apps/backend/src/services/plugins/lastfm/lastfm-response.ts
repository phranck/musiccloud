/**
 * @file The Last.fm entry point for code outside `plugins/lastfm/`.
 *
 * The image cache, genre search and the tag crawler import the client from
 * `client.ts` and the genre tag filter from `genre-tags.ts` through this file.
 * Code inside `plugins/lastfm/` imports those modules directly.
 */

export { type LastFmImage, lastFmApiKey, lastFmGet, pickLastFmImage } from "./client.js";
export { isGenreTag } from "./genre-tags.js";
