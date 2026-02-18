export type ServiceId =
  | "spotify"
  | "apple-music"
  | "youtube"
  | "youtube-music"
  | "soundcloud"
  | "tidal"
  | "deezer"
  | "audius"
  | "napster"
  | "pandora"
  | "qobuz"
  | "boomplay"
  | "kkbox"
  | "bandcamp"
  | "audiomack"
  | "netease"
  | "qqmusic"
  | "melon"
  | "bugs"
  | "jiosaavn"
  | "beatport";

export type MatchMethod = "isrc" | "search" | "odesli" | "cache" | "upc" | "isrc-inference";

const VALID_SERVICE_IDS: readonly ServiceId[] = [
  "spotify",
  "apple-music",
  "youtube",
  "youtube-music",
  "soundcloud",
  "tidal",
  "deezer",
  "audius",
  "napster",
  "pandora",
  "qobuz",
  "boomplay",
  "kkbox",
  "bandcamp",
  "audiomack",
  "netease",
  "qqmusic",
  "melon",
  "bugs",
  "jiosaavn",
  "beatport",
];

export { VALID_SERVICE_IDS };

export function isValidServiceId(value: unknown): value is ServiceId {
  return typeof value === "string" && VALID_SERVICE_IDS.includes(value as ServiceId);
}
