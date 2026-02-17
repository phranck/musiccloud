/** Cache time-to-live for resolved tracks (48 hours). Used by both resolver and DB cleanup. */
export const CACHE_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * User-facing display order for platforms.
 * Major services first, niche/regional services later.
 */
export const SERVICE_DISPLAY_ORDER: readonly string[] = [
  "spotify",
  "apple-music",
  "youtube",
  "youtube-music",
  "deezer",
  "tidal",
  "soundcloud",
  "pandora",
  "qobuz",
  "napster",
  "audius",
  "kkbox",
  "bandcamp",
  "beatport",
  "audiomack",
  "boomplay",
  "netease",
  "qqmusic",
  "melon",
  "bugs",
  "jiosaavn",
];

/** Compare function to sort platforms by display order. */
export function compareByDisplayOrder(a: string, b: string): number {
  const ai = SERVICE_DISPLAY_ORDER.indexOf(a);
  const bi = SERVICE_DISPLAY_ORDER.indexOf(b);
  // Unknown platforms go to the end
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}
