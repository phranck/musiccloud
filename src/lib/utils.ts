import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// SoundCloud kept in type for backend compatibility (Phase 2)
export type Platform = "spotify" | "apple-music" | "youtube" | "soundcloud";

/** MVP platforms for URL detection (SoundCloud deferred to Phase 2) */
type MvpPlatform = Exclude<Platform, "soundcloud">;

const MUSIC_URL_PATTERNS: Record<MvpPlatform, RegExp> = {
  spotify: /^https?:\/\/(open\.)?spotify\.com\/(track|album|intl-\w+\/track)\//,
  "apple-music": /^https?:\/\/music\.apple\.com\//,
  youtube:
    /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/|music\.youtube\.com\/)/,
};

export function isMusicUrl(url: string): boolean {
  return Object.values(MUSIC_URL_PATTERNS).some((pattern) => pattern.test(url));
}

export function detectPlatform(url: string): MvpPlatform | null {
  for (const [platform, pattern] of Object.entries(MUSIC_URL_PATTERNS)) {
    if (pattern.test(url)) {
      return platform as MvpPlatform;
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
  soundcloud: { label: "SoundCloud", color: "#FF5500" },
};
