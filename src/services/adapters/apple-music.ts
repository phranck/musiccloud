import type {
  ServiceAdapter,
  AdapterCapabilities,
  NormalizedTrack,
  MatchResult,
} from "../types.js";
import { calculateConfidence } from "../../lib/normalize.js";
import { importPKCS8, SignJWT } from "jose";

// Matches: music.apple.com/{storefront}/album/{name}/{albumId}?i={trackId}
//          music.apple.com/{storefront}/song/{name}/{trackId}
const APPLE_MUSIC_REGEX =
  /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/(?:album\/[^/]+\/(\d+)(?:\?i=(\d+))?|song\/[^/]+\/(\d+))/;

const API_BASE = "https://api.music.apple.com/v1";
const DEFAULT_STOREFRONT = "us";

// Token cache: JWT is valid for 1 hour, we refresh 5 minutes early
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedJwt {
  token: string;
  expiresAt: number;
}

let cachedJwt: CachedJwt | null = null;

async function getDevToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedJwt && Date.now() < cachedJwt.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return cachedJwt.token;
  }

  // Legacy: support pre-generated static token for development
  const staticToken = import.meta.env.APPLE_MUSIC_TOKEN;
  if (staticToken) {
    cachedJwt = { token: staticToken, expiresAt: Date.now() + TOKEN_LIFETIME_SECONDS * 1000 };
    return staticToken;
  }

  // Generate JWT from MusicKit credentials
  const keyId = import.meta.env.APPLE_MUSIC_KEY_ID;
  const teamId = import.meta.env.APPLE_MUSIC_TEAM_ID;
  const privateKeyPem = import.meta.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!keyId || !teamId || !privateKeyPem) {
    throw new Error(
      "Apple Music requires APPLE_MUSIC_KEY_ID + APPLE_MUSIC_TEAM_ID + APPLE_MUSIC_PRIVATE_KEY",
    );
  }

  // The private key may be base64-encoded or raw PEM.
  // Decode if it doesn't start with "-----BEGIN".
  const pem = privateKeyPem.startsWith("-----BEGIN")
    ? privateKeyPem
    : Buffer.from(privateKeyPem, "base64").toString("utf-8");

  const privateKey = await importPKCS8(pem, "ES256");

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_LIFETIME_SECONDS)
    .sign(privateKey);

  cachedJwt = {
    token,
    expiresAt: Date.now() + TOKEN_LIFETIME_SECONDS * 1000,
  };

  return token;
}

async function appleMusicFetch(endpoint: string): Promise<Response> {
  const token = await getDevToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(`${API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

interface AppleMusicSongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
  durationInMillis?: number;
  releaseDate?: string;
  isrc?: string;
  contentRating?: string;
  url: string;
  artwork?: {
    url: string;
    width: number;
    height: number;
  };
  previews?: Array<{ url: string }>;
  genreNames?: string[];
}

interface AppleMusicSongResource {
  id: string;
  type: "songs";
  attributes: AppleMusicSongAttributes;
}

function mapTrack(raw: AppleMusicSongResource): NormalizedTrack {
  const attrs = raw.attributes;
  let artworkUrl: string | undefined;

  if (attrs.artwork?.url) {
    // Apple Music artwork URLs use {w}x{h} placeholders for dynamic sizing
    artworkUrl = attrs.artwork.url.replace("{w}", "640").replace("{h}", "640");
  }

  return {
    sourceService: "apple-music",
    sourceId: raw.id,
    isrc: attrs.isrc,
    title: attrs.name,
    artists: attrs.artistName
      .split(/[,&]/)
      .map((a) => a.trim())
      .filter(Boolean),
    albumName: attrs.albumName,
    durationMs: attrs.durationInMillis,
    releaseDate: attrs.releaseDate,
    isExplicit: attrs.contentRating === "explicit",
    artworkUrl,
    previewUrl: attrs.previews?.[0]?.url,
    webUrl: attrs.url,
  };
}

const capabilities: AdapterCapabilities = {
  supportsIsrc: true,
  supportsPreview: true,
  supportsArtwork: true,
};

export const appleMusicAdapter: ServiceAdapter = {
  id: "apple-music",
  displayName: "Apple Music",
  capabilities,

  isAvailable(): boolean {
    return Boolean(
      import.meta.env.APPLE_MUSIC_TOKEN ||
        (import.meta.env.APPLE_MUSIC_KEY_ID &&
          import.meta.env.APPLE_MUSIC_TEAM_ID &&
          import.meta.env.APPLE_MUSIC_PRIVATE_KEY),
    );
  },

  detectUrl(url: string): string | null {
    const match = APPLE_MUSIC_REGEX.exec(url);
    if (!match) return null;

    // Track ID is either ?i= param (from album link) or direct song ID
    const trackId = match[3] ?? match[4];
    if (trackId) return trackId;

    // Album-only link without ?i= - not a track link
    if (match[2] && !match[3]) return null;

    return null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const storefront = import.meta.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT;
    const response = await appleMusicFetch(
      `/catalog/${storefront}/songs/${encodeURIComponent(trackId)}`,
    );

    if (!response.ok) {
      throw new Error(`Apple Music getTrack failed: ${response.status}`);
    }

    const data = await response.json();
    const song: AppleMusicSongResource = data.data[0];

    if (!song) {
      throw new Error(`Apple Music track not found: ${trackId}`);
    }

    return mapTrack(song);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const storefront = import.meta.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT;
    const response = await appleMusicFetch(
      `/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const songs: AppleMusicSongResource[] = data.data ?? [];

    if (songs.length === 0) return null;

    return mapTrack(songs[0]);
  },

  async searchTrack(query: {
    title: string;
    artist: string;
    album?: string;
  }): Promise<MatchResult> {
    const storefront = import.meta.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT;
    const term = encodeURIComponent(`${query.artist} ${query.title}`);
    const response = await appleMusicFetch(
      `/catalog/${storefront}/search?types=songs&term=${term}&limit=5`,
    );

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const songs: AppleMusicSongResource[] = data.results?.songs?.data ?? [];

    if (songs.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (const song of songs) {
      const track = mapTrack(song);
      const confidence = calculateConfidence(
        { title: query.title, artists: [query.artist], durationMs: undefined },
        { title: track.title, artists: track.artists, durationMs: track.durationMs },
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
    }

    if (!bestMatch || bestConfidence < 0.6) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return {
      found: true,
      track: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },
};
