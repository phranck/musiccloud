import type {
  ServiceAdapter,
  NormalizedTrack,
  MatchResult,
  SearchQuery,
} from "../types.js";
import { calculateConfidence } from "../../lib/normalize.js";
import { MATCH_MIN_CONFIDENCE } from "../resolver.js";
import { log } from "../../lib/logger.js";

const API_BASE = "https://api.kkbox.com/v1.1";
const TOKEN_URL = "https://account.kkbox.com/oauth2/token";

const KKBOX_TRACK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?kkbox\.com\/[a-z]{2}\/[a-z]{2}\/song\/([A-Za-z0-9_-]+)/;

interface KkboxToken {
  accessToken: string;
  expiresAt: number;
}

interface KkboxTrackResponse {
  id: string;
  name: string;
  duration: number; // milliseconds
  isrc?: string;
  url: string;
  track_number?: number;
  explicitness?: boolean;
  available_territories?: string[];
  album?: {
    id: string;
    name: string;
    url: string;
    images?: Array<{ url: string; width: number; height: number }>;
  };
  artist?: {
    id: string;
    name: string;
    url: string;
  };
}

interface KkboxSearchResponse {
  tracks?: {
    data: KkboxTrackResponse[];
    paging?: { offset: number; limit: number; total?: number };
  };
}

let cachedToken: KkboxToken | null = null;
let tokenPromise: Promise<string> | null = null;

/** Reset module-level token cache. For testing only. */
export function _resetTokenCache(): void {
  cachedToken = null;
  tokenPromise = null;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  // Promise coalescing: prevent parallel token refresh requests
  if (tokenPromise) return tokenPromise;

  tokenPromise = fetchNewToken().finally(() => {
    tokenPromise = null;
  });
  return tokenPromise;
}

async function fetchNewToken(): Promise<string> {
  const clientId = import.meta.env.KKBOX_CLIENT_ID;
  const clientSecret = import.meta.env.KKBOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[KKBOX] Missing required credentials");
    throw new Error("KKBOX_CLIENT_ID and KKBOX_CLIENT_SECRET must be set");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`KKBOX token request failed: ${response.status}`);
    }

    const data = await response.json();

    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return cachedToken.accessToken;
  } finally {
    clearTimeout(timeout);
  }
}

function getTerritory(): string {
  return import.meta.env.KKBOX_TERRITORY || "TW";
}

async function kkboxFetch(endpoint: string): Promise<Response> {
  const token = await getAccessToken();
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function pickLargestImage(
  images?: Array<{ url: string; width: number; height: number }>,
): string | undefined {
  if (!images || images.length === 0) return undefined;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0].url;
}

function mapTrack(raw: KkboxTrackResponse): NormalizedTrack {
  return {
    sourceService: "kkbox",
    sourceId: raw.id,
    isrc: raw.isrc,
    title: raw.name,
    artists: raw.artist?.name ? [raw.artist.name] : ["Unknown Artist"],
    albumName: raw.album?.name,
    durationMs: raw.duration,
    isExplicit: raw.explicitness,
    artworkUrl: pickLargestImage(raw.album?.images),
    webUrl: raw.url || `https://www.kkbox.com/tw/en/song/${raw.id}`,
  };
}

export const kkboxAdapter = {
  id: "kkbox",
  displayName: "KKBOX",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return Boolean(import.meta.env.KKBOX_CLIENT_ID && import.meta.env.KKBOX_CLIENT_SECRET);
  },

  detectUrl(url: string): string | null {
    const match = KKBOX_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const territory = getTerritory();
    const response = await kkboxFetch(
      `/tracks/${encodeURIComponent(trackId)}?territory=${territory}`,
    );

    if (!response.ok) {
      throw new Error(`KKBOX getTrack failed: ${response.status}`);
    }

    const data: KkboxTrackResponse = await response.json();
    return mapTrack(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const territory = getTerritory();
    const response = await kkboxFetch(
      `/search?q=${encodeURIComponent(isrc)}&type=track&territory=${territory}&limit=5`,
    );

    if (!response.ok) {
      log.debug("KKBOX", "ISRC lookup failed:", response.status);
      return null;
    }

    const data: KkboxSearchResponse = await response.json();
    const tracks = data.tracks?.data ?? [];

    if (tracks.length === 0) {
      log.debug("KKBOX", "ISRC not found:", isrc);
      return null;
    }

    // Find exact ISRC match in search results
    const match = tracks.find((t) => t.isrc === isrc);
    if (!match) {
      log.debug("KKBOX", "ISRC not found in results:", isrc);
      return null;
    }

    return mapTrack(match);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const territory = getTerritory();
    const q = query.title === query.artist
      ? query.title
      : `${query.artist} ${query.title}`;

    const response = await kkboxFetch(
      `/search?q=${encodeURIComponent(q)}&type=track&territory=${territory}&limit=5`,
    );

    if (!response.ok) {
      log.debug("KKBOX", "Search API failed:", response.status);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data: KkboxSearchResponse = await response.json();
    const items = data.tracks?.data ?? [];

    if (items.length === 0) {
      log.debug("KKBOX", `Search returned no tracks for: ${q}`);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const isFreeText = query.title === query.artist;
    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    log.debug("KKBOX", `Search returned ${items.length} tracks for: ${query.artist} ${query.title}`);

    for (let i = 0; i < Math.min(items.length, 5); i++) {
      const track = mapTrack(items[i]);
      let confidence: number;

      if (isFreeText) {
        confidence = Math.max(0.4, 0.85 - i * 0.05);
      } else {
        confidence = calculateConfidence(
          { title: query.title, artists: [query.artist], durationMs: undefined },
          { title: track.title, artists: track.artists, durationMs: track.durationMs },
        );
      }

      log.debug("KKBOX", `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return {
      found: true,
      track: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
