import { fetchWithTimeout } from "@/lib/infra/fetch";
import { log } from "@/lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "@/lib/resolve/normalize";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../types.js";

const MATCH_MIN_CONFIDENCE = 0.6;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Audiomack URLs: audiomack.com/{artist}/song/{track-slug}
const AUDIOMACK_TRACK_REGEX = /^https?:\/\/(?:www\.)?audiomack\.com\/([^/]+)\/song\/([^/?]+)/;
// Audiomack album URLs: audiomack.com/{artist}/album/{slug}
const AUDIOMACK_ALBUM_REGEX = /^https?:\/\/(?:www\.)?audiomack\.com\/([^/]+)\/album\/([^/?]+)/;

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

interface AudiomackAlbumResult {
  id: number;
  title: string;
  artist: string;
  url_slug: string;
  image?: string;
  image_base?: string;
  genre?: string;
  url: string;
}

interface AudiomackAlbumSearchResponse {
  results?: AudiomackAlbumResult[];
}

async function audiomackFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    },
    timeoutMs,
  );
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
    const data = (await response.json()) as AudiomackSearchResponse;
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

function mapAlbumResult(album: AudiomackAlbumResult): NormalizedAlbum {
  const artistParts = album.artist
    .split(/[,&]|feat\./i)
    .map((a) => a.trim())
    .filter(Boolean);
  return {
    sourceService: "audiomack",
    sourceId: `${album.url_slug}`,
    title: album.title,
    artists: artistParts.length > 0 ? artistParts : ["Unknown Artist"],
    artworkUrl: album.image || album.image_base || undefined,
    webUrl: album.url || `https://audiomack.com/${album.url_slug}`,
  };
}

async function fetchAlbumPage(artistSlug: string, albumSlug: string): Promise<NormalizedAlbum | null> {
  const url = `https://audiomack.com/${artistSlug}/album/${albumSlug}`;
  const response = await audiomackFetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const ogTitle = /<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"[^>]*>/i.exec(html)?.[1];
  const ogImage = /<meta\s+(?:property|name)="og:image"\s+content="([^"]*)"[^>]*>/i.exec(html)?.[1];

  if (!ogTitle) return null;

  let title = ogTitle;
  let artist = "Unknown Artist";
  const byMatch = /^(.+?)\s+by\s+(.+)$/i.exec(ogTitle);
  if (byMatch) {
    title = byMatch[1].trim();
    artist = byMatch[2].trim();
  }

  return {
    sourceService: "audiomack",
    sourceId: `${artistSlug}/${albumSlug}`,
    title,
    artists: [artist],
    artworkUrl: ogImage || undefined,
    webUrl: url,
  };
}

async function searchAudiomackAlbums(query: string): Promise<AudiomackAlbumResult[]> {
  const searchUrl = `https://api.audiomack.com/v1/music/search?q=${encodeURIComponent(query)}&show=albums&limit=5`;
  const response = await audiomackFetch(searchUrl);
  if (!response.ok) return [];

  try {
    const data = (await response.json()) as AudiomackAlbumSearchResponse;
    return data.results ?? [];
  } catch {
    return [];
  }
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
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

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

        log.debug(
          "Audiomack",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

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

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = AUDIOMACK_ALBUM_REGEX.exec(url);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const parts = albumId.split("/");
    if (parts.length !== 2) throw new Error(`Audiomack: Invalid album ID: ${albumId}`);
    const album = await fetchAlbumPage(parts[0], parts[1]);
    if (!album) throw new Error(`Audiomack: Album not found: ${albumId}`);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const results = await searchAudiomackAlbums(q);
      if (results.length === 0) {
        log.debug("Audiomack", "Album search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Audiomack", `Album search returned ${results.length} results for: ${q}`);

      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const r of results) {
        if (!r.id || !r.title) continue;
        const album = mapAlbumResult(r);
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], releaseDate: query.year },
          { title: album.title, artists: album.artists },
        );
        log.debug("Audiomack", `  "${r.title}" -> confidence=${confidence.toFixed(3)}`);
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = album;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }
      return { found: true, album: bestMatch, confidence: bestConfidence, matchMethod: "search" };
    } catch (error) {
      log.debug("Audiomack", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
