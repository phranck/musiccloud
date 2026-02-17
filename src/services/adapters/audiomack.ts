import type { ServiceAdapter, NormalizedTrack, MatchResult, SearchQuery } from "../types.js";
import { calculateConfidence } from "../../lib/normalize.js";
import { log } from "../../lib/logger.js";

const MATCH_MIN_CONFIDENCE = 0.6;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Audiomack URLs: audiomack.com/{artist}/song/{track-slug}
const AUDIOMACK_TRACK_REGEX = /^https?:\/\/(?:www\.)?audiomack\.com\/([^/]+)\/song\/([^/?]+)/;

interface AudiomackSong {
  id: number;
  title: string;
  artist: string;
  url_slug: string;
  image?: string;
  image_base?: string;
  album?: string;
  duration?: number; // seconds
  genre?: string;
  music_url?: string;
  url: string; // web URL
}

interface AudiomackSearchResponse {
  results?: AudiomackSong[];
}

async function audiomackFetch(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function mapSong(song: AudiomackSong): NormalizedTrack {
  // Audiomack uses "artist" as single string, may contain "feat." or ","
  const artistParts = song.artist
    .split(/[,&]|feat\./i)
    .map((a) => a.trim())
    .filter(Boolean);

  const artists = artistParts.length > 0 ? artistParts : ["Unknown Artist"];

  return {
    sourceService: "audiomack",
    sourceId: String(song.id),
    title: song.title,
    artists,
    albumName: song.album || undefined,
    durationMs: song.duration ? song.duration * 1000 : undefined,
    artworkUrl: song.image || song.image_base || undefined,
    webUrl: song.url || `https://audiomack.com/${song.url_slug}`,
  };
}

async function searchSongs(query: string): Promise<AudiomackSong[]> {
  // Audiomack public search endpoint (no OAuth needed for search)
  const searchUrl = `https://api.audiomack.com/v1/music/search?q=${encodeURIComponent(query)}&show=songs&limit=5`;
  const response = await audiomackFetch(searchUrl);
  if (!response.ok) return [];

  try {
    const data = await response.json() as AudiomackSearchResponse;
    return data.results ?? [];
  } catch {
    return [];
  }
}

async function fetchTrackPage(artistSlug: string, trackSlug: string): Promise<NormalizedTrack | null> {
  // Fetch track page for OG tags as fallback
  const url = `https://audiomack.com/${artistSlug}/song/${trackSlug}`;
  const response = await audiomackFetch(url);
  if (!response.ok) return null;

  const html = await response.text();

  // Extract OG tags
  const ogTitle = /<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"[^>]*>/i.exec(html)?.[1];
  const ogImage = /<meta\s+(?:property|name)="og:image"\s+content="([^"]*)"[^>]*>/i.exec(html)?.[1];

  if (!ogTitle) return null;

  // OG title format varies: "Track by Artist" or "Track"
  let title = ogTitle;
  let artist = "Unknown Artist";
  const byMatch = /^(.+?)\s+by\s+(.+)$/i.exec(ogTitle);
  if (byMatch) {
    title = byMatch[1].trim();
    artist = byMatch[2].trim();
  }

  return {
    sourceService: "audiomack",
    sourceId: `${artistSlug}/${trackSlug}`,
    title,
    artists: [artist],
    artworkUrl: ogImage || undefined,
    webUrl: url,
  };
}

export const audiomackAdapter: ServiceAdapter = {
  id: "audiomack",
  displayName: "Audiomack",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // Public search works without API key
  },

  detectUrl(url: string): string | null {
    const match = AUDIOMACK_TRACK_REGEX.exec(url);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const parts = trackId.split("/");
    if (parts.length !== 2) {
      throw new Error(`Audiomack: Invalid track ID format: ${trackId}`);
    }
    const track = await fetchTrackPage(parts[0], parts[1]);
    if (!track) {
      throw new Error(`Audiomack: Track not found: ${trackId}`);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist
      ? query.title
      : `${query.artist} ${query.title}`;

    try {
      const songs = await searchSongs(q);
      if (songs.length === 0) {
        log.debug("Audiomack", "Search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Audiomack", `Search returned ${songs.length} results for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        if (!song.id || !song.title) continue;

        const track = mapSong(song);
        let confidence: number;

        if (isFreeText) {
          confidence = Math.max(0.4, 0.85 - i * 0.05);
        } else {
          confidence = calculateConfidence(
            { title: query.title, artists: [query.artist], durationMs: undefined },
            { title: track.title, artists: track.artists, durationMs: track.durationMs },
          );
        }

        log.debug("Audiomack", `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("Audiomack", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("Audiomack", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
