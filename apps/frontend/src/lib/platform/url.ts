/**
 * Frontend-only URL detection utilities.
 * Used for paste-to-submit URL detection and service identification.
 * Content type detection (track/album/artist) is handled by the backend.
 */

const MUSIC_URL_PATTERNS: RegExp[] = [
  /^https?:\/\/(open\.)?spotify\.com\/(track|album|artist|intl-\w+\/(track|album|artist))\//,
  /^https?:\/\/music\.apple\.com\//,
  /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts|@|channel\/)|youtu\.be\/|music\.youtube\.com\/)/,
  /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[^/]+\/[^/]+/,
  /^https?:\/\/on\.soundcloud\.com\/[A-Za-z0-9]+/,
  /^https?:\/\/(listen\.)?tidal\.com\/(browse\/)?(track|album|artist)\//,
  /^https?:\/\/(www\.)?deezer\.com\/(([a-z]{2})\/)?(track|album|artist)\//,
  /^https?:\/\/link\.deezer\.com\/s\//,
  /^https?:\/\/(?:open|play)\.qobuz\.com\/(track|album)\/[a-zA-Z0-9]+/,
  /^https?:\/\/[a-z0-9-]+\.bandcamp\.com\/(album|track)\//,
];

export function isMusicUrl(url: string): boolean {
  return MUSIC_URL_PATTERNS.some((pattern) => pattern.test(url));
}

const SERVICE_HOST_MAP: [RegExp, string][] = [
  [/spotify\.com/, "spotify"],
  [/music\.apple\.com/, "apple-music"],
  [/music\.youtube\.com/, "youtube-music"],
  [/youtu(\.be|be\.com)/, "youtube"],
  [/soundcloud\.com/, "soundcloud"],
  [/tidal\.com/, "tidal"],
  [/deezer\.com/, "deezer"],
  [/qobuz\.com/, "qobuz"],
  [/bandcamp\.com/, "bandcamp"],
];

export function detectServiceFromUrl(url: string): string {
  for (const [pattern, service] of SERVICE_HOST_MAP) {
    if (pattern.test(url)) return service;
  }
  return "unknown";
}
