import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// All supported music platforms
export type Platform = "spotify" | "apple-music" | "youtube" | "youtube-music" | "soundcloud" | "tidal" | "deezer" | "audius" | "napster" | "pandora" | "qobuz" | "boomplay" | "kkbox" | "bandcamp" | "audiomack" | "netease" | "qqmusic" | "melon" | "bugs" | "jiosaavn" | "beatport";

/** Platforms with URL detection support (YouTube Music is derived from YouTube) */
type DetectablePlatform = Exclude<Platform, "youtube-music">;

const MUSIC_URL_PATTERNS: Record<DetectablePlatform, RegExp> = {
  spotify: /^https?:\/\/(open\.)?spotify\.com\/(track|album|intl-\w+\/track)\//,
  "apple-music": /^https?:\/\/music\.apple\.com\//,
  youtube:
    /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/|music\.youtube\.com\/)/,
  soundcloud: /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[^/]+\/[^/]+/,
  tidal: /^https?:\/\/(listen\.)?tidal\.com\/(browse\/)?track\//,
  deezer: /^https?:\/\/(www\.)?deezer\.com\/(([a-z]{2})\/)?track\//,
  audius: /^https?:\/\/audius\.co\/[^/]+\/[^/]+/,
  napster: /^https?:\/\/(www\.|app\.)?napster\.com\/.+/,
  pandora: /^https?:\/\/(?:www\.)?pandora\.com\/artist\/[^/]+\/[^/]+\/[^/]+\/TR[a-zA-Z0-9]+/,
  qobuz: /^https?:\/\/(?:open|play)\.qobuz\.com\/track\//,
  boomplay: /^https?:\/\/(?:www\.)?boomplay\.com\/songs\/\d+/,
  kkbox: /^https?:\/\/(?:www\.)?kkbox\.com\/[a-z]{2}\/[a-z]{2}\/song\//,
  bandcamp: /^https?:\/\/[a-z0-9-]+\.bandcamp\.com\/track\//,
  audiomack: /^https?:\/\/(?:www\.)?audiomack\.com\/[^/]+\/song\//,
  netease: /^https?:\/\/music\.163\.com\/(?:#\/)?song\?id=\d+/,
  qqmusic: /^https?:\/\/y\.qq\.com\/n\/ryqq\/songDetail\//,
  melon: /^https?:\/\/(?:www\.)?melon\.com\/song\/detail\.htm\?songId=\d+/,
  bugs: /^https?:\/\/music\.bugs\.co\.kr\/track\/\d+/,
  jiosaavn: /^https?:\/\/(?:www\.)?jiosaavn\.com\/song\//,
  beatport: /^https?:\/\/(?:www\.)?beatport\.com\/track\//,
};

export function isMusicUrl(url: string): boolean {
  return Object.values(MUSIC_URL_PATTERNS).some((pattern) => pattern.test(url));
}

export function detectPlatform(url: string): DetectablePlatform | null {
  for (const [platform, pattern] of Object.entries(MUSIC_URL_PATTERNS)) {
    if (pattern.test(url)) {
      return platform as DetectablePlatform;
    }
  }
  return null;
}

export const PLATFORM_CONFIG: Record<
  Platform,
  { label: string; color: string }
> = {
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

/** Format milliseconds as "m:ss" */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Extract 4-digit year from a date string, or null if invalid */
export function formatYear(dateStr: string): string | null {
  const year = dateStr.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}
