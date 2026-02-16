import type {
  ServiceAdapter,
  NormalizedTrack,
  MatchResult,
  SearchQuery,
} from "../types.js";
import { calculateConfidence } from "../../lib/normalize.js";
import { MATCH_MIN_CONFIDENCE } from "../resolver.js";
import { log } from "../../lib/logger.js";

const API_BASE = "https://openapi.tidal.com/v2";
const TOKEN_URL = "https://auth.tidal.com/v1/oauth2/token";

const TIDAL_TRACK_REGEX =
  /(?:https?:\/\/)?(?:listen\.)?tidal\.com\/(?:browse\/)?track\/(\d+)/;

// Minimal types for Tidal API responses
interface TidalToken {
  accessToken: string;
  expiresAt: number;
}

interface TidalTrackResource {
  id: string;
  attributes: {
    title: string;
    isrc?: string;
    duration?: number; // ISO 8601 duration or seconds
    explicit?: boolean;
    externalLinks?: Array<{ href: string; meta: { type: string } }>;
    imageLinks?: Array<{ href: string; meta: { width: number; height: number } }>;
  };
  relationships?: {
    artists?: {
      data: Array<{ id: string }>;
    };
    albums?: {
      data: Array<{ id: string }>;
    };
  };
}

interface TidalTrackResponse {
  data: TidalTrackResource;
  included?: Array<{
    id: string;
    type: string;
    attributes: { name?: string; title?: string; imageLinks?: Array<{ href: string }> };
  }>;
}

interface TidalSearchResponse {
  data: TidalTrackResource[];
  included?: Array<{
    id: string;
    type: string;
    attributes: { name?: string; title?: string; imageLinks?: Array<{ href: string }> };
  }>;
}

let cachedToken: TidalToken | null = null;
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
  const clientId = import.meta.env.TIDAL_CLIENT_ID;
  const clientSecret = import.meta.env.TIDAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[Tidal] Missing required credentials");
    throw new Error("TIDAL_CLIENT_ID and TIDAL_CLIENT_SECRET must be set");
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
      throw new Error(`Tidal token request failed: ${response.status}`);
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

async function tidalFetch(endpoint: string): Promise<Response> {
  const token = await getAccessToken();
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseDuration(duration: number | undefined): number | undefined {
  if (duration === undefined) return undefined;
  // Tidal returns duration in seconds
  return duration * 1000;
}

function extractArtistNames(
  resource: TidalTrackResource,
  included?: TidalTrackResponse["included"],
): string[] {
  const artistIds = resource.relationships?.artists?.data?.map((a) => a.id) ?? [];
  if (!included || artistIds.length === 0) return ["Unknown Artist"];

  const names: string[] = [];
  for (const id of artistIds) {
    const artist = included.find((i) => i.id === id && i.type === "artists");
    if (artist?.attributes?.name) {
      names.push(artist.attributes.name);
    }
  }

  return names.length > 0 ? names : ["Unknown Artist"];
}

function extractAlbumName(
  resource: TidalTrackResource,
  included?: TidalTrackResponse["included"],
): string | undefined {
  const albumIds = resource.relationships?.albums?.data?.map((a) => a.id) ?? [];
  if (!included || albumIds.length === 0) return undefined;

  const album = included.find((i) => i.id === albumIds[0] && i.type === "albums");
  return album?.attributes?.title;
}

function pickLargestImage(
  imageLinks?: Array<{ href: string; meta: { width: number; height: number } }>,
): string | undefined {
  if (!imageLinks || imageLinks.length === 0) return undefined;
  const sorted = [...imageLinks].sort((a, b) => (b.meta.width ?? 0) - (a.meta.width ?? 0));
  return sorted[0].href;
}

function mapTrack(
  resource: TidalTrackResource,
  included?: TidalTrackResponse["included"],
): NormalizedTrack {
  const attrs = resource.attributes;
  return {
    sourceService: "tidal",
    sourceId: resource.id,
    isrc: attrs.isrc,
    title: attrs.title,
    artists: extractArtistNames(resource, included),
    albumName: extractAlbumName(resource, included),
    durationMs: parseDuration(attrs.duration),
    isExplicit: attrs.explicit,
    artworkUrl: pickLargestImage(attrs.imageLinks),
    webUrl: `https://tidal.com/browse/track/${resource.id}`,
  };
}

export const tidalAdapter = {
  id: "tidal",
  displayName: "Tidal",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return Boolean(import.meta.env.TIDAL_CLIENT_ID && import.meta.env.TIDAL_CLIENT_SECRET);
  },

  detectUrl(url: string): string | null {
    const match = TIDAL_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await tidalFetch(
      `/tracks/${encodeURIComponent(trackId)}?countryCode=US&include=artists,albums`,
    );

    if (!response.ok) {
      throw new Error(`Tidal getTrack failed: ${response.status}`);
    }

    const data: TidalTrackResponse = await response.json();
    return mapTrack(data.data, data.included);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await tidalFetch(
      `/tracks?filter[isrc]=${encodeURIComponent(isrc)}&countryCode=US&include=artists,albums`,
    );

    if (!response.ok) {
      log.debug("Tidal", "ISRC lookup failed:", response.status);
      return null;
    }

    const data: TidalSearchResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      log.debug("Tidal", "ISRC not found:", isrc);
      return null;
    }

    return mapTrack(data.data[0], data.included);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist
      ? query.title
      : `${query.artist} ${query.title}`;

    const response = await tidalFetch(
      `/searchresults/${encodeURIComponent(q)}/relationships/tracks?countryCode=US&include=tracks.artists,tracks.albums`,
    );

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data: TidalSearchResponse = await response.json();
    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const isFreeText = query.title === query.artist;
    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < Math.min(items.length, 5); i++) {
      const track = mapTrack(items[i], data.included);
      let confidence: number;

      if (isFreeText) {
        confidence = Math.max(0.4, 0.85 - i * 0.05);
      } else {
        confidence = calculateConfidence(
          { title: query.title, artists: [query.artist], durationMs: undefined },
          { title: track.title, artists: track.artists, durationMs: track.durationMs },
        );
      }

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
