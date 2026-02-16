import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// All supported music platforms
export type Platform = "spotify" | "apple-music" | "youtube" | "youtube-music" | "soundcloud" | "tidal" | "deezer" | "audius" | "napster";

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
};
