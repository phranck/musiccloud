import { RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { ResolveError } from "../../../lib/resolve/errors";
import { calculateConfidence, normalizeTitle } from "../../../lib/resolve/normalize";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AdapterCapabilities,
  ArtistCapabilities,
  ArtistMatchResult,
  ArtistSearchQuery,
  MatchResult,
  NormalizedArtist,
  NormalizedTrack,
  ServiceAdapter,
} from "../../types.js";

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.|music\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

// Matches YouTube channel/artist URLs:
//   youtube.com/@handle, youtube.com/channel/UCxxxx, music.youtube.com/channel/UCxxxx
const YOUTUBE_ARTIST_HANDLE_REGEX = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([^/?]+)/;
const YOUTUBE_ARTIST_CHANNEL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:music\.)?youtube\.com\/channel\/([a-zA-Z0-9_-]+)/;

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
  const apiKey = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new ResolveError("MC-CFG-6001", "YOUTUBE_API_KEY must be set");
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  return fetchWithTimeout(`${API_BASE}${endpoint}${separator}key=${apiKey}`, {}, 5000);
}

function mapVideoToTrack(video: YouTubeVideoResource): NormalizedTrack {
  const { artist, trackTitle } = parseArtistFromTitle(video.snippet.title);

  return {
    sourceService: "youtube",
    sourceId: video.id,
    title: trackTitle,
    artists: artist ? [artist] : [video.snippet.channelTitle],
    artworkUrl: getBestThumbnail(video.snippet.thumbnails),
    durationMs: video.contentDetails ? parseIsoDuration(video.contentDetails.duration) : undefined,
    releaseDate: video.snippet.publishedAt,
    webUrl: `https://www.youtube.com/watch?v=${video.id}`,
  };
}

const capabilities: AdapterCapabilities = {
  supportsIsrc: false,
  supportsPreview: false,
  supportsArtwork: true,
};

const artistCapabilities: ArtistCapabilities = {
  supportsArtistSearch: true,
};

interface YouTubeChannelResource {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    thumbnails: YouTubeSnippet["thumbnails"];
  };
}

function mapChannelToArtist(channel: YouTubeChannelResource): NormalizedArtist {
  const handle = channel.snippet.customUrl;
  const webUrl = handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${channel.id}`;

  return {
    sourceService: "youtube",
    sourceId: channel.id,
    name: channel.snippet.title,
    imageUrl: getBestThumbnail(channel.snippet.thumbnails),
    webUrl,
  };
}

export const youtubeAdapter: ServiceAdapter = {
  id: "youtube",
  displayName: "YouTube",
  capabilities,
  artistCapabilities,

  isAvailable(): boolean {
    return Boolean(process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY);
  },

  detectUrl(url: string): string | null {
    const match = YOUTUBE_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(videoId: string): Promise<NormalizedTrack> {
    const response = await youtubeFetch(`/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}`);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.YOUTUBE, response.status, RESOURCE_KIND.TRACK, videoId);
    }

    const data = await response.json();
    const items: YouTubeVideoResource[] = data.items ?? [];

    if (items.length === 0) {
      throw serviceNotFoundError(SERVICE.YOUTUBE, RESOURCE_KIND.TRACK, videoId);
    }

    return mapVideoToTrack(items[0]);
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    // YouTube does not support ISRC lookups
    return null;
  },

  async searchTrack(query: { title: string; artist: string; album?: string }): Promise<MatchResult> {
    const searchQuery = encodeURIComponent(`${query.artist} ${query.title} official`);
    const response = await youtubeFetch(
      `/search?part=snippet&type=video&videoCategoryId=10&q=${searchQuery}&maxResults=3`,
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
    const detailsResponse = await youtubeFetch(`/videos?part=snippet,contentDetails&id=${videoIds}`);

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

  detectArtistUrl(url: string): string | null {
    const handleMatch = YOUTUBE_ARTIST_HANDLE_REGEX.exec(url);
    if (handleMatch) return `handle:${handleMatch[1]}`;

    const channelMatch = YOUTUBE_ARTIST_CHANNEL_REGEX.exec(url);
    if (channelMatch) return channelMatch[1];

    return null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    let endpoint: string;
    if (artistId.startsWith("handle:")) {
      const handle = artistId.slice(7);
      endpoint = `/channels?part=snippet&forHandle=${encodeURIComponent(handle)}`;
    } else {
      endpoint = `/channels?part=snippet&id=${encodeURIComponent(artistId)}`;
    }

    const response = await youtubeFetch(endpoint);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.YOUTUBE, response.status, RESOURCE_KIND.ARTIST, artistId);
    }

    const data = await response.json();
    const channels: YouTubeChannelResource[] = data.items ?? [];

    if (channels.length === 0) {
      throw serviceNotFoundError(SERVICE.YOUTUBE, RESOURCE_KIND.ARTIST, artistId);
    }

    return mapChannelToArtist(channels[0]);
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const searchQuery = encodeURIComponent(query.name);
    const response = await youtubeFetch(`/search?part=snippet&type=channel&q=${searchQuery}&maxResults=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const items: Array<{ id: { channelId: string }; snippet: YouTubeSnippet }> = data.items ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    // Fetch full channel details for thumbnails
    const channelIds = items.map((item) => item.id.channelId).join(",");
    const detailsResponse = await youtubeFetch(`/channels?part=snippet&id=${channelIds}`);

    let channels: YouTubeChannelResource[] = [];
    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json();
      channels = detailsData.items ?? [];
    }

    let bestMatch: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const channel of channels) {
      const artist = mapChannelToArtist(channel);
      const confidence = calculateConfidence(
        { title: query.name, artists: [], durationMs: undefined },
        { title: artist.name, artists: [], durationMs: undefined },
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = artist;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return {
      found: true,
      artist: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },
};
