import type { ErrorCode } from "./errors.js";

export type UrlValidationResult =
  | { valid: true }
  | { valid: false; code: ErrorCode; message: string };

const ALLOWED_HOSTS = [
  // Spotify
  "open.spotify.com",
  "play.spotify.com",
  // Apple Music
  "music.apple.com",
  // YouTube / YouTube Music
  "youtube.com",
  "www.youtube.com",
  "music.youtube.com",
  "youtu.be",
  // SoundCloud
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
  // Tidal
  "tidal.com",
  "listen.tidal.com",
  // Deezer
  "deezer.com",
  "www.deezer.com",
  // Audius
  "audius.co",
  // Napster
  "napster.com",
  "play.napster.com",
  "web.napster.com",
  "app.napster.com",
  "www.napster.com",
  // Pandora
  "pandora.com",
  "www.pandora.com",
];

// Patterns for unsupported content types (specific error messages)
const PODCAST_REGEX =
  /spotify\.com\/(?:intl-\w+\/)?(?:episode|show)\//;
const PLAYLIST_REGEX =
  /(?:spotify\.com\/(?:intl-\w+\/)?playlist\/|music\.apple\.com\/[a-z]{2}\/playlist\/|youtube\.com\/playlist\?)/;
const ALBUM_ONLY_REGEX =
  /(?:spotify\.com\/(?:intl-\w+\/)?album\/[a-zA-Z0-9]+$|music\.apple\.com\/[a-z]{2}\/album\/[^?]+$)/;

export function validateMusicUrl(input: string): UrlValidationResult {
  // Check if it looks like a URL at all
  let url: URL;
  try {
    // Prepend https:// if no protocol
    const withProtocol = input.match(/^https?:\/\//) ? input : `https://${input}`;
    url = new URL(withProtocol);
  } catch {
    // Not a URL - could be a text search query
    return { valid: true };
  }

  // Check for unsupported content types (before host check, for better error messages)
  if (PODCAST_REGEX.test(input)) {
    return {
      valid: false,
      code: "PODCAST_NOT_SUPPORTED",
      message:
        "We only support music tracks at the moment.",
    };
  }

  if (PLAYLIST_REGEX.test(input)) {
    return {
      valid: false,
      code: "PLAYLIST_NOT_SUPPORTED",
      message:
        "We support single tracks right now. Try pasting a link to a specific song.",
    };
  }

  if (ALBUM_ONLY_REGEX.test(input) && !input.includes("?i=")) {
    return {
      valid: false,
      code: "ALBUM_NOT_SUPPORTED",
      message:
        "Try pasting a link to a specific song from this album.",
    };
  }

  // Check allowed hosts (SSRF prevention)
  if (!ALLOWED_HOSTS.includes(url.hostname)) {
    return {
      valid: false,
      code: "UNSUPPORTED_SERVICE",
      message:
        "This platform isn't supported yet. Try a link from Spotify, YouTube, Tidal, Deezer, SoundCloud, or another supported service.",
    };
  }

  return { valid: true };
}

export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    const paramsToRemove = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "si",
      "context",
      "nd",
      "dl_branch",
      "feature",
    ];

    for (const param of paramsToRemove) {
      parsed.searchParams.delete(param);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

export function isUrl(input: string): boolean {
  return /^https?:\/\//.test(input) || /^[\w-]+\.[\w-]+/.test(input);
}
