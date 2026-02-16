import type {
  ServiceAdapter,
  AdapterCapabilities,
  NormalizedTrack,
  MatchResult,
} from "../types.js";
import { calculateConfidence, normalizeTitle } from "../../lib/normalize.js";

const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.|music\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeSnippet {
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  categoryId?: string;
  thumbnails: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
    standard?: { url: string };
    maxres?: { url: string };
  };
}

interface YouTubeContentDetails {
  duration: string; // ISO 8601, e.g. "PT4M30S"
}

interface YouTubeVideoResource {
  id: string;
  snippet: YouTubeSnippet;
  contentDetails?: YouTubeContentDetails;
}

interface YouTubeSearchItem {
  id: { kind: string; videoId: string };
  snippet: YouTubeSnippet;
}

function parseIsoDuration(iso: string): number {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!match) return 0;

  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function getBestThumbnail(thumbnails: YouTubeSnippet["thumbnails"]): string | undefined {
  return (
    thumbnails.maxres?.url ??
    thumbnails.standard?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url
  );
}

function parseArtistFromTitle(title: string): { artist: string; trackTitle: string } {
  // Common pattern: "Artist - Track Title"
  const dashMatch = /^(.+?)\s*[-\u2013\u2014]\s*(.+)$/.exec(title);
  if (dashMatch) {
    return {
      artist: dashMatch[1].trim(),
      trackTitle: normalizeTitle(dashMatch[2].trim(), "youtube"),
    };
  }
  return { artist: "", trackTitle: normalizeTitle(title, "youtube") };
}

async function youtubeFetch(endpoint: string): Promise<Response> {
  const apiKey = import.meta.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY must be set");
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(`${API_BASE}${endpoint}${separator}key=${apiKey}`, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function mapVideoToTrack(video: YouTubeVideoResource): NormalizedTrack {
  const { artist, trackTitle } = parseArtistFromTitle(video.snippet.title);

  return {
    sourceService: "youtube",
    sourceId: video.id,
    title: trackTitle,
    artists: artist ? [artist] : [video.snippet.channelTitle],
    artworkUrl: getBestThumbnail(video.snippet.thumbnails),
    durationMs: video.contentDetails
      ? parseIsoDuration(video.contentDetails.duration)
      : undefined,
    releaseDate: video.snippet.publishedAt,
    webUrl: `https://www.youtube.com/watch?v=${video.id}`,
  };
}

const capabilities: AdapterCapabilities = {
  supportsIsrc: false,
  supportsPreview: false,
  supportsArtwork: true,
};

export const youtubeAdapter: ServiceAdapter = {
  id: "youtube",
  displayName: "YouTube",
  capabilities,

  isAvailable(): boolean {
    return Boolean(import.meta.env.YOUTUBE_API_KEY);
  },

  detectUrl(url: string): string | null {
    const match = YOUTUBE_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(videoId: string): Promise<NormalizedTrack> {
    const response = await youtubeFetch(
      `/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}`,
    );

    if (!response.ok) {
      throw new Error(`YouTube getTrack failed: ${response.status}`);
    }

    const data = await response.json();
    const items: YouTubeVideoResource[] = data.items ?? [];

    if (items.length === 0) {
      throw new Error(`YouTube video not found: ${videoId}`);
    }

    return mapVideoToTrack(items[0]);
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    // YouTube does not support ISRC lookups
    return null;
  },

  async searchTrack(query: {
    title: string;
    artist: string;
    album?: string;
  }): Promise<MatchResult> {
    const searchQuery = encodeURIComponent(`${query.artist} ${query.title} official`);
    const response = await youtubeFetch(
      `/search?part=snippet&type=video&videoCategoryId=10&q=${searchQuery}&maxResults=5`,
    );

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const items: YouTubeSearchItem[] = data.items ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    // Fetch full video details (including duration) for the top results
    const videoIds = items.map((item) => item.id.videoId).join(",");
    const detailsResponse = await youtubeFetch(
      `/videos?part=snippet,contentDetails&id=${videoIds}`,
    );

    let videos: YouTubeVideoResource[] = [];
    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json();
      videos = detailsData.items ?? [];
    }

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (const video of videos) {
      const track = mapVideoToTrack(video);
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
