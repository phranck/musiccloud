import type { ErrorCode, ServiceId } from "@musiccloud/shared";

export type UrlValidationResult = { valid: true } | { valid: false; code: ErrorCode; message: string };

/** Services with URL detection support (YouTube Music is derived from YouTube) */
type DetectableService = Exclude<ServiceId, "youtube-music">;

export const MUSIC_URL_PATTERNS: Record<DetectableService, RegExp> = {
  spotify: /^https?:\/\/(open\.)?spotify\.com\/(track|album|intl-\w+\/track)\//,
  "apple-music": /^https?:\/\/music\.apple\.com\//,
  youtube: /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/|music\.youtube\.com\/)/,
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

export const ALBUM_URL_PATTERNS: Record<DetectableService, RegExp> = {
  spotify: /^https?:\/\/(open\.)?spotify\.com\/(intl-\w+\/)?album\/[a-zA-Z0-9]+/,
  "apple-music": /^https?:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^?\s]+(?:\?(?!i=).*)?$/,
  youtube: /^https?:\/\/music\.youtube\.com\/playlist\?list=OLAK5uy_/,
  soundcloud: /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[^/]+\/sets\/[^/]+/,
  tidal: /^https?:\/\/(listen\.)?tidal\.com\/(browse\/)?album\/\d+/,
  deezer: /^https?:\/\/(www\.)?deezer\.com\/(([a-z]{2})\/)?album\/\d+/,
  audius: /^https?:\/\/audius\.co\/[^/]+\/[^/]+-[a-zA-Z0-9]+$/, // Audius playlists/albums
  napster: /^https?:\/\/(www\.)?napster\.com\/album\//,
  pandora: /^https?:\/\/(?:www\.)?pandora\.com\/artist\/[^/]+\/[^/]+\/AL[a-zA-Z0-9]+/,
  qobuz: /^https?:\/\/(?:open|play)\.qobuz\.com\/album\//,
  boomplay: /^https?:\/\/(?:www\.)?boomplay\.com\/albums\/\d+/,
  kkbox: /^https?:\/\/(?:www\.)?kkbox\.com\/[a-z]{2}\/[a-z]{2}\/album\//,
  bandcamp: /^https?:\/\/[a-z0-9-]+\.bandcamp\.com\/album\//,
  audiomack: /^https?:\/\/(?:www\.)?audiomack\.com\/[^/]+\/album\//,
  netease: /^https?:\/\/music\.163\.com\/(?:#\/)?album\?id=\d+/,
  qqmusic: /^https?:\/\/y\.qq\.com\/n\/ryqq\/albumDetail\//,
  melon: /^https?:\/\/(?:www\.)?melon\.com\/album\/detail\.htm\?albumId=\d+/,
  bugs: /^https?:\/\/music\.bugs\.co\.kr\/album\/\d+/,
  jiosaavn: /^https?:\/\/(?:www\.)?jiosaavn\.com\/album\//,
  beatport: /^https?:\/\/(?:www\.)?beatport\.com\/release\//,
};

export function isMusicUrl(url: string): boolean {
  return Object.values(MUSIC_URL_PATTERNS).some((pattern) => pattern.test(url));
}

export function isAlbumUrl(url: string): boolean {
  return Object.values(ALBUM_URL_PATTERNS).some((pattern) => pattern.test(url));
}

export function isArtistUrl(url: string): boolean {
  return ARTIST_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export function detectPlatform(url: string): DetectableService | null {
  for (const [platform, pattern] of Object.entries(MUSIC_URL_PATTERNS)) {
    if (pattern.test(url)) {
      return platform as DetectableService;
    }
  }
  return null;
}

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
];

// Patterns for unsupported content types (specific error messages)
const PODCAST_REGEX = /spotify\.com\/(?:intl-\w+\/)?(?:episode|show)\//;
const PLAYLIST_REGEX =
  /(?:spotify\.com\/(?:intl-\w+\/)?playlist\/|music\.apple\.com\/[a-z]{2}\/playlist\/|youtube\.com\/playlist\?list=(?!OLAK5uy_))/;
export const ARTIST_URL_PATTERNS: RegExp[] = [
  // Spotify: open.spotify.com/artist/{id} or open.spotify.com/intl-xx/artist/{id}
  /^https?:\/\/(open\.)?spotify\.com\/(intl-\w+\/)?artist\/[a-zA-Z0-9]+/,
  // Apple Music: music.apple.com/{cc}/artist/{slug}/{id}
  /^https?:\/\/music\.apple\.com\/[a-z]{2}\/artist\//,
  // YouTube / YouTube Music: /@handle, /channel/{id}
  /^https?:\/\/(www\.)?youtube\.com\/(@[^/]+|channel\/[^/]+)\/?$/,
  /^https?:\/\/music\.youtube\.com\/channel\/[^/]+/,
  // Tidal: tidal.com/artist/{id} or tidal.com/browse/artist/{id}
  /^https?:\/\/(listen\.)?tidal\.com\/(browse\/)?artist\/\d+/,
  // Deezer: deezer.com/artist/{id} or deezer.com/{cc}/artist/{id}
  /^https?:\/\/(www\.)?deezer\.com\/(([a-z]{2})\/)?artist\/\d+/,
  // SoundCloud: soundcloud.com/{username} (single path segment only)
  /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[^/]+\/?$/,
  // Bandcamp: {artist}.bandcamp.com (root path only)
  /^https?:\/\/[a-z0-9-]+\.bandcamp\.com\/?$/,
  // Audiomack: audiomack.com/{username}
  /^https?:\/\/(?:www\.)?audiomack\.com\/[^/]+\/?$/,
];

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

  // Check allowed hosts (SSRF prevention)
  // Bandcamp uses subdomains: {artist}.bandcamp.com
  const isBandcamp = url.hostname.endsWith(".bandcamp.com") || url.hostname === "bandcamp.com";
  if (!isBandcamp && !ALLOWED_HOSTS.includes(url.hostname)) {
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

    // YouTube: For /watch URLs only keep v= (removes list=, t=, etc.)
    if ((parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com") && parsed.pathname === "/watch") {
      const videoId = parsed.searchParams.get("v");
      parsed.search = "";
      if (videoId) parsed.searchParams.set("v", videoId);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

export function isUrl(input: string): boolean {
  return /^https?:\/\//.test(input) || /^[\w-]+\.[\w-]+/.test(input);
}
