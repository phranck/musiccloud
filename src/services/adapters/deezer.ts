import type {
  ServiceAdapter,
  NormalizedTrack,
  MatchResult,
  SearchQuery,
} from "../types.js";
import { calculateConfidence } from "../../lib/normalize.js";
import { MATCH_MIN_CONFIDENCE } from "../resolver.js";
import { log } from "../../lib/logger.js";

const API_BASE = "https://api.deezer.com";

const DEEZER_TRACK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/;

// Minimal type for the Deezer API track response fields we use
interface DeezerTrackResponse {
  id: number;
  title: string;
  artist: { id: number; name: string };
  album: {
    id: number;
    title: string;
    cover_xl?: string;
    cover_big?: string;
    release_date?: string;
  };
  duration: number; // in seconds
  isrc?: string;
  explicit_lyrics: boolean;
  preview?: string;
  link: string;
}

interface DeezerSearchResponse {
  data: DeezerTrackResponse[];
  total: number;
}

interface DeezerErrorResponse {
  error: { type: string; message: string; code: number };
}

async function deezerFetch(endpoint: string): Promise<Response> {
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isDeezerError(data: unknown): data is DeezerErrorResponse {
  return typeof data === "object" && data !== null && "error" in data;
}

function mapTrack(raw: DeezerTrackResponse): NormalizedTrack {
  return {
    sourceService: "deezer",
    sourceId: String(raw.id),
    isrc: raw.isrc,
    title: raw.title,
    artists: [raw.artist.name],
    albumName: raw.album?.title,
    durationMs: raw.duration * 1000,
    releaseDate: raw.album?.release_date,
    isExplicit: raw.explicit_lyrics,
    artworkUrl: raw.album?.cover_xl ?? raw.album?.cover_big,
    previewUrl: raw.preview ?? undefined,
    webUrl: raw.link ?? `https://www.deezer.com/track/${raw.id}`,
  };
}

export const deezerAdapter = {
  id: "deezer",
  displayName: "Deezer",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: true,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    // Deezer public API requires no credentials
    return true;
  },

  detectUrl(url: string): string | null {
    const match = DEEZER_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await deezerFetch(`/track/${encodeURIComponent(trackId)}`);

    if (!response.ok) {
      throw new Error(`Deezer getTrack failed: ${response.status}`);
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      throw new Error(`Deezer API error: ${data.error.message}`);
    }

    return mapTrack(data as DeezerTrackResponse);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await deezerFetch(`/track/isrc:${encodeURIComponent(isrc)}`);

    if (!response.ok) {
      log.debug("Deezer", "ISRC lookup failed:", response.status);
      return null;
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      log.debug("Deezer", "ISRC not found:", isrc);
      return null;
    }

    return mapTrack(data as DeezerTrackResponse);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist
      ? query.title
      : `artist:"${query.artist}" track:"${query.title}"`;

    const response = await deezerFetch(
      `/search/track?q=${encodeURIComponent(q)}&limit=5`,
    );

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const items = (data as DeezerSearchResponse).data ?? [];

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
