/**
 * Frontend-only URL detection utilities.
 * Subset of the backend url.ts - only what the client needs to route
 * requests to the correct API endpoint and detect paste-to-submit URLs.
 */

const MUSIC_URL_PATTERNS: RegExp[] = [
  /^https?:\/\/(open\.)?spotify\.com\/(track|album|intl-\w+\/track)\//,
  /^https?:\/\/music\.apple\.com\//,
  /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/|music\.youtube\.com\/)/,
  /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[^/]+\/[^/]+/,
  /^https?:\/\/(listen\.)?tidal\.com\/(browse\/)?track\//,
  /^https?:\/\/(www\.)?deezer\.com\/(([a-z]{2})\/)?track\//,
  /^https?:\/\/link\.deezer\.com\/s\//,
];

const ALBUM_URL_PATTERNS: RegExp[] = [
  /^https?:\/\/(open\.)?spotify\.com\/(intl-\w+\/)?album\/[a-zA-Z0-9]+/,
  /^https?:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^?]+$/,
  /^https?:\/\/music\.youtube\.com\/playlist\?list=OLAK5uy_/,
  /^https?:\/\/(listen\.)?tidal\.com\/(browse\/)?album\/\d+/,
  /^https?:\/\/(www\.)?deezer\.com\/(([a-z]{2})\/)?album\/\d+/,
  /^https?:\/\/[a-z0-9-]+\.bandcamp\.com\/album\//,
];

export function isMusicUrl(url: string): boolean {
  return MUSIC_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export function isAlbumUrl(url: string): boolean {
  return ALBUM_URL_PATTERNS.some((pattern) => pattern.test(url));
}
