import { formatDuration, formatYear } from "./utils.js";

/** All supported music platforms */
export type Platform =
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

export interface PlatformConfig {
  label: string;
  color: string;
}

export const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
  spotify: { label: "Spotify", color: "#1DB954" },
  "apple-music": { label: "Apple Music", color: "#FC3C44" },
  youtube: { label: "YouTube", color: "#FF0000" },
  "youtube-music": { label: "YouTube Music", color: "#FF0000" },
  soundcloud: { label: "SoundCloud", color: "#FF5500" },
  tidal: { label: "Tidal", color: "#00FFFF" },
  deezer: { label: "Deezer", color: "#A238FF" },
  audius: { label: "Audius", color: "#7E1BCC" },
  napster: { label: "Napster", color: "#00A8E1" },
  pandora: { label: "Pandora", color: "#3668FF" },
  qobuz: { label: "Qobuz", color: "#0969D6" },
  boomplay: { label: "Boomplay", color: "#00D1FF" },
  kkbox: { label: "KKBOX", color: "#09CEF6" },
  bandcamp: { label: "Bandcamp", color: "#1DA0C3" },
  audiomack: { label: "Audiomack", color: "#FFA500" },
  netease: { label: "NetEase Cloud Music", color: "#C20C0C" },
  qqmusic: { label: "QQ Music", color: "#31C27C" },
  melon: { label: "Melon", color: "#00CD3C" },
  bugs: { label: "Bugs!", color: "#FF3D00" },
  jiosaavn: { label: "JioSaavn", color: "#2BC5B4" },
  beatport: { label: "Beatport", color: "#94D500" },
};

/** Runtime validation for Platform values from external/DB data */
export function isValidPlatform(value: unknown): value is Platform {
  return typeof value === "string" && value in PLATFORM_CONFIG;
}

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

/** Typed platform link for API responses and UI rendering */
export interface PlatformLink {
  service: string;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: string;
  color: string;
}

/** Build the metadata line (duration, ISRC, year) joined by middle dot. */
export function buildMetaLine(opts: {
  durationMs?: number | null;
  isrc?: string | null;
  releaseDate?: string | null;
}): string {
  const items = [
    opts.durationMs ? formatDuration(opts.durationMs) : null,
    opts.isrc ?? null,
    opts.releaseDate ? formatYear(opts.releaseDate) : null,
  ].filter(Boolean);
  return items.join(" \u00B7 ");
}
