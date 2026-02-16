import type {
  ServiceAdapter,
  NormalizedTrack,
  MatchResult,
  SearchQuery,
} from "../types.js";
import { calculateConfidence } from "../../lib/normalize.js";
import { MATCH_MIN_CONFIDENCE } from "../resolver.js";
import { log } from "../../lib/logger.js";

const API_BASE = "https://api.audius.co/v1";
const APP_NAME = "music_cloud";

const AUDIUS_TRACK_REGEX =
  /(?:https?:\/\/)?audius\.co\/([^/]+\/[^/?\s]+)/;

interface AudiusTrackResponse {
  id: string;
  title: string;
  duration: number; // seconds
  genre?: string;
  mood?: string;
  release_date?: string;
  permalink: string;
  slug: string;
  artwork?: {
    "150x150"?: string;
    "480x480"?: string;
    "1000x1000"?: string;
  };
  user: {
    id: string;
    handle: string;
    name: string;
  };
}

interface AudiusSearchResponse {
  data: AudiusTrackResponse[];
}

interface AudiusTrackDetailResponse {
  data: AudiusTrackResponse;
}

async function audiusFetch(endpoint: string): Promise<Response> {
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${API_BASE}${endpoint}${separator}app_name=${APP_NAME}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function mapTrack(raw: AudiusTrackResponse): NormalizedTrack {
  return {
    sourceService: "audius",
    sourceId: raw.id,
    title: raw.title,
    artists: [raw.user.name],
    durationMs: raw.duration * 1000,
    releaseDate: raw.release_date ?? undefined,
    artworkUrl: raw.artwork?.["1000x1000"] ?? raw.artwork?.["480x480"],
    webUrl: `https://audius.co${raw.permalink}`,
  };
}

export const audiusAdapter = {
  id: "audius",
  displayName: "Audius",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true;
  },

  detectUrl(url: string): string | null {
    const match = AUDIUS_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    // trackId from detectUrl is a path like "handle/slug", use resolve endpoint
    if (trackId.includes("/")) {
      const response = await audiusFetch(
        `/resolve?url=https://audius.co/${encodeURIComponent(trackId)}`,
      );

      if (!response.ok) {
        throw new Error(`Audius resolve failed: ${response.status}`);
      }

      const data = (await response.json()) as AudiusTrackDetailResponse;
      return mapTrack(data.data);
    }

    // Direct track ID lookup
    const response = await audiusFetch(`/tracks/${encodeURIComponent(trackId)}`);

    if (!response.ok) {
      throw new Error(`Audius getTrack failed: ${response.status}`);
    }

    const data = (await response.json()) as AudiusTrackDetailResponse;
    return mapTrack(data.data);
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    // Audius tracks rarely have ISRC metadata
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist
      ? query.title
      : `${query.artist} ${query.title}`;

    const response = await audiusFetch(
      `/tracks/search?query=${encodeURIComponent(q)}&limit=5`,
    );

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = (await response.json()) as AudiusSearchResponse;
    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const isFreeText = query.title === query.artist;
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
