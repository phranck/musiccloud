import type {
  ServiceAdapter,
  AdapterCapabilities,
  NormalizedTrack,
  MatchResult,
  SearchResultWithCandidates,
} from "../types.js";
import { calculateConfidence } from "../../lib/normalize.js";

const SPOTIFY_TRACK_REGEX =
  /(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:intl-\w+\/)?track\/([a-zA-Z0-9]+)/;
const SPOTIFY_URI_REGEX = /spotify:track:([a-zA-Z0-9]+)/;

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

interface SpotifyToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: SpotifyToken | null = null;
let tokenPromise: Promise<string> | null = null;

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
  const clientId = import.meta.env.SPOTIFY_CLIENT_ID;
  const clientSecret = import.meta.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[Spotify] Missing required credentials");
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set");
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
      throw new Error(`Spotify token request failed: ${response.status}`);
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

async function spotifyFetch(endpoint: string): Promise<Response> {
  const token = await getAccessToken();
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function mapTrack(raw: SpotifyTrackResponse): NormalizedTrack {
  return {
    sourceService: "spotify",
    sourceId: raw.id,
    isrc: raw.external_ids?.isrc,
    title: raw.name,
    artists: raw.artists.map((a: { name: string }) => a.name),
    albumName: raw.album?.name,
    durationMs: raw.duration_ms,
    releaseDate: raw.album?.release_date,
    isExplicit: raw.explicit,
    artworkUrl: raw.album?.images?.[0]?.url,
    previewUrl: raw.preview_url ?? undefined,
    webUrl: raw.external_urls?.spotify ?? `https://open.spotify.com/track/${raw.id}`,
  };
}

// Minimal type for the Spotify API track response fields we use
interface SpotifyTrackResponse {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album?: {
    name: string;
    release_date?: string;
    images?: Array<{ url: string; width: number; height: number }>;
  };
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
}

const capabilities: AdapterCapabilities = {
  supportsIsrc: true,
  supportsPreview: true,
  supportsArtwork: true,
};

export const spotifyAdapter = {
  id: "spotify",
  displayName: "Spotify",
  capabilities,

  isAvailable(): boolean {
    return Boolean(import.meta.env.SPOTIFY_CLIENT_ID && import.meta.env.SPOTIFY_CLIENT_SECRET);
  },

  detectUrl(url: string): string | null {
    const trackMatch = SPOTIFY_TRACK_REGEX.exec(url);
    if (trackMatch) return trackMatch[1];

    const uriMatch = SPOTIFY_URI_REGEX.exec(url);
    if (uriMatch) return uriMatch[1];

    return null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await spotifyFetch(`/tracks/${encodeURIComponent(trackId)}`);

    if (!response.ok) {
      throw new Error(`Spotify getTrack failed: ${response.status}`);
    }

    const data: SpotifyTrackResponse = await response.json();
    return mapTrack(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const query = encodeURIComponent(`isrc:${isrc}`);
    const response = await spotifyFetch(`/search?type=track&q=${query}&limit=1`);

    if (!response.ok) {
      throw new Error(`Spotify findByIsrc failed: ${response.status}`);
    }

    const data = await response.json();
    const items = data.tracks?.items;

    if (!items || items.length === 0) return null;

    return mapTrack(items[0]);
  },

  async searchTrack(query: {
    title: string;
    artist: string;
    album?: string;
  }): Promise<MatchResult> {
    const isFreeText = query.title === query.artist;
    let q: string;

    if (isFreeText) {
      q = encodeURIComponent(query.title);
    } else {
      const parts: string[] = [];
      parts.push(`track:${query.title}`);
      parts.push(`artist:${query.artist}`);
      if (query.album) {
        parts.push(`album:${query.album}`);
      }
      q = encodeURIComponent(parts.join(" "));
    }

    const response = await spotifyFetch(`/search?type=track&q=${q}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const items: SpotifyTrackResponse[] = data.tracks?.items ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    // Score each result and pick the best match
    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < items.length; i++) {
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

  async searchTrackWithCandidates(query: {
    title: string;
    artist: string;
    album?: string;
  }): Promise<SearchResultWithCandidates> {
    console.log("[Spotify] searchTrackWithCandidates called with:", query);
    const isFreeText = query.title === query.artist;
    let q: string;

    if (isFreeText) {
      q = encodeURIComponent(query.title);
    } else {
      const parts: string[] = [];
      parts.push(`track:${query.title}`);
      parts.push(`artist:${query.artist}`);
      if (query.album) {
        parts.push(`album:${query.album}`);
      }
      q = encodeURIComponent(parts.join(" "));
    }

    console.log("[Spotify] Search query string:", q);

    const response = await spotifyFetch(`/search?type=track&q=${q}&limit=10`);

    console.log("[Spotify] API response status:", response.status, response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Spotify] Search failed:", response.status, errorText);
      return {
        bestMatch: { found: false, confidence: 0, matchMethod: "search" },
        candidates: [],
      };
    }

    const data = await response.json();
    const items: SpotifyTrackResponse[] = data.tracks?.items ?? [];

    if (items.length === 0) {
      return {
        bestMatch: { found: false, confidence: 0, matchMethod: "search" },
        candidates: [],
      };
    }

    const scored: Array<{ track: NormalizedTrack; confidence: number }> = [];

    for (let i = 0; i < items.length; i++) {
      const track = mapTrack(items[i]);
      let confidence: number;

      if (isFreeText) {
        // For free-text queries, use position-based confidence from Spotify's ranking.
        // Top result gets 0.85, decaying by 0.05 per position.
        confidence = Math.max(0.4, 0.85 - i * 0.05);
      } else {
        confidence = calculateConfidence(
          { title: query.title, artists: [query.artist], durationMs: undefined },
          { title: track.title, artists: track.artists, durationMs: track.durationMs },
        );
      }
      scored.push({ track, confidence });
    }

    scored.sort((a, b) => b.confidence - a.confidence);

    const best = scored[0];
    const bestMatch: MatchResult = best.confidence >= 0.6
      ? { found: true, track: best.track, confidence: best.confidence, matchMethod: "search" }
      : { found: false, confidence: best.confidence, matchMethod: "search" };

    return {
      bestMatch,
      candidates: scored.filter((c) => c.confidence >= 0.4),
    };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
