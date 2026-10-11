import { ENDPOINTS, type ErrorCode, parseJamendoLink } from "@musiccloud/shared";

export type UrlValidationResult = { valid: true } | { valid: false; code: ErrorCode; message: string };

const ALLOWED_HOSTS = [
  // Spotify
  "open.spotify.com",
  "play.spotify.com",
  // Apple Music
  "music.apple.com",
  // YouTube / YouTube Music
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  // SoundCloud
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
  "on.soundcloud.com",
  // Tidal
  "tidal.com",
  "listen.tidal.com",
  // Deezer
  "deezer.com",
  "www.deezer.com",
  "link.deezer.com",
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
  // Qobuz
  "open.qobuz.com",
  "play.qobuz.com",
  // Boomplay
  "boomplay.com",
  "www.boomplay.com",
  // KKBOX
  "kkbox.com",
  "www.kkbox.com",
  // Audiomack
  "audiomack.com",
  "www.audiomack.com",
  // NetEase Cloud Music
  "music.163.com",
  // QQ Music
  "y.qq.com",
  // Melon
  "melon.com",
  "www.melon.com",
  // Bugs!
  "music.bugs.co.kr",
  // JioSaavn
  "jiosaavn.com",
  "www.jiosaavn.com",
  // Beatport
  "beatport.com",
  "www.beatport.com",
  // MusicBrainz is metadata-only, and its adapter resolves its release,
  // recording and artist URLs.
  "musicbrainz.org",
  "www.musicbrainz.org",
];

// Patterns for unsupported content types (specific error messages)
const PODCAST_REGEX = /spotify\.com\/(?:intl-\w+\/)?(?:episode|show)\//;
const PLAYLIST_REGEX =
  /(?:spotify\.com\/(?:intl-\w+\/)?playlist\/|music\.apple\.com\/[a-z]{2}\/playlist\/|youtube\.com\/playlist\?list=(?!OLAK5uy_))/;

export function validateMusicUrl(input: string): UrlValidationResult {
  const explicitUrl = hasExplicitHttpScheme(input);
  const url = explicitUrl ? parseExplicitHttpUrl(input) : parseKnownSchemelessMusicUrl(input);

  if (!url) {
    if (explicitUrl) {
      return {
        valid: false,
        code: "INVALID_URL",
        message: "That URL looks malformed. Please paste the full link from the streaming service.",
      };
    }
    // Not a supported schemaless music URL candidate - treat as text search.
    return { valid: true };
  }

  // Check for unsupported content types (before host check, for better error messages)
  if (PODCAST_REGEX.test(input)) {
    return {
      valid: false,
      code: "PODCAST_NOT_SUPPORTED",
      message: "We only support music tracks at the moment.",
    };
  }

  if (PLAYLIST_REGEX.test(input)) {
    return {
      valid: false,
      code: "PLAYLIST_NOT_SUPPORTED",
      message: "We support single tracks right now. Try pasting a link to a specific song.",
    };
  }

  // Jamendo is the Creative Commons catalog and resolves through its own
  // endpoint. The generic message below would call it unsupported.
  if (parseJamendoLink(input)) {
    return {
      valid: false,
      code: "UNSUPPORTED_SERVICE",
      message: `Jamendo links point to Creative Commons music. Resolve them through POST ${ENDPOINTS.v1.ccResolve}.`,
    };
  }

  // Check allowed hosts (SSRF prevention)
  // Bandcamp uses subdomains: {artist}.bandcamp.com
  const isBandcamp = url.hostname.endsWith(".bandcamp.com") || url.hostname === "bandcamp.com";
  if (!isBandcamp && !ALLOWED_HOSTS.includes(url.hostname)) {
    return {
      valid: false,
      code: "UNSUPPORTED_SERVICE",
      message:
        "This platform isn't supported. Try a link from Spotify, YouTube, Tidal, Deezer, SoundCloud, or another supported service.",
    };
  }

  return { valid: true };
}

export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);

    // Universal tracking params to remove across all services
    const paramsToRemove = [
      // UTM
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      // Social/ad click IDs
      "fbclid",
      "gclid",
      "ttclid",
      "twclid",
      "igshid",
      "msclkid",
      // Service-specific session/sharing tokens
      "si", // Spotify
      "context", // Spotify
      "nd", // Spotify
      "dl_branch", // Spotify
      "feature", // YouTube/Spotify
      // YouTube non-essential params (only v= is needed for /watch)
      "list",
      "index",
      "t",
      "start_radio",
      "pp",
      "playnext",
      // Apple Music locale param
      "l",
      // Generic
      "ref",
      "referral",
      "app_destination",
    ];

    for (const param of paramsToRemove) {
      parsed.searchParams.delete(param);
    }

    // ── Per-service path/hostname normalization ───────────────────────────────

    // Spotify: Remove intl-XX locale prefix
    // open.spotify.com/intl-de/track/... → open.spotify.com/track/...
    if (parsed.hostname === "open.spotify.com" || parsed.hostname === "play.spotify.com") {
      parsed.pathname = parsed.pathname.replace(/^\/intl-[a-z]+\//, "/");
    }

    // Deezer: Remove 2-letter locale prefix from path
    // www.deezer.com/de/track/123 → www.deezer.com/track/123
    if (parsed.hostname === "www.deezer.com" || parsed.hostname === "deezer.com") {
      parsed.hostname = "www.deezer.com";
      parsed.pathname = parsed.pathname.replace(/^\/[a-z]{2}\//, "/");
    }

    // Tidal: Normalize listen.tidal.com → tidal.com
    if (parsed.hostname === "listen.tidal.com") {
      parsed.hostname = "tidal.com";
    }

    // Qobuz: Normalize play.qobuz.com → open.qobuz.com
    if (parsed.hostname === "play.qobuz.com") {
      parsed.hostname = "open.qobuz.com";
    }

    // YouTube: normalize the mobile host (m.youtube.com) to www so a link
    // pasted from the mobile app shares the desktop cache key.
    if (parsed.hostname === "m.youtube.com") {
      parsed.hostname = "www.youtube.com";
    }

    // YouTube: For /watch URLs only keep v= (removes list=, t=, ra=, fragments, etc.)
    if ((parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com") && parsed.pathname === "/watch") {
      const videoId = parsed.searchParams.get("v");
      parsed.search = "";
      parsed.hash = "";
      if (videoId) parsed.searchParams.set("v", videoId);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

export function isUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (hasExplicitHttpScheme(trimmed)) return true;
  return parseKnownSchemelessMusicUrl(trimmed) !== null;
}

function hasExplicitHttpScheme(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

function parseExplicitHttpUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function parseKnownSchemelessMusicUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.endsWith(".")) return null;

  let url: URL;
  try {
    url = new URL(`https://${trimmed}`);
  } catch {
    return null;
  }

  if (!hasValidHostShape(url.hostname)) return null;
  if (!isAllowedMusicHost(url.hostname)) return null;
  return url;
}

function hasValidHostShape(hostname: string): boolean {
  if (!hostname || hostname.endsWith(".")) return false;
  const labels = hostname.toLowerCase().split(".");
  if (labels.length < 2) return false;
  if (labels[labels.length - 1].length < 2 || labels[labels.length - 2].length < 2) return false;
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

function isAllowedMusicHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const isBandcamp = normalized.endsWith(".bandcamp.com") || normalized === "bandcamp.com";
  return isBandcamp || ALLOWED_HOSTS.includes(normalized);
}
