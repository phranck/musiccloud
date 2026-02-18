import { fetchWithTimeout } from "@/lib/infra/fetch";
import { log } from "@/lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "@/lib/resolve/normalize";
import { MATCH_MIN_CONFIDENCE } from "../resolver.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  AlbumTrackEntry,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../types.js";

const API_BASE = "https://api.audius.co/v1";
const APP_NAME = "music_cloud";

const AUDIUS_TRACK_REGEX = /(?:https?:\/\/)?audius\.co\/([^/]+\/[^/?\s]+)/;
// Audius album (playlist with is_album=true) URLs: audius.co/{user}/{slug}
// Albums share the same URL structure as playlists; detected via API response.
const AUDIUS_ALBUM_REGEX = /(?:https?:\/\/)?audius\.co\/([^/]+\/[^/?\s]+)/;

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

interface AudiusPlaylistResponse {
  id: string;
  playlist_name: string;
  is_album: boolean;
  permalink: string;
  playlist_image_multihash?: string;
  artwork?: { "150x150"?: string; "480x480"?: string; "1000x1000"?: string };
  user: { id: string; handle: string; name: string };
  playlist_contents?: {
    track_ids?: Array<{ track: string; time: number }>;
  };
  track_count?: number;
}

interface AudiusPlaylistDetailResponse {
  data: AudiusPlaylistResponse;
}

interface AudiusPlaylistSearchResponse {
  data: AudiusPlaylistResponse[];
}

async function audiusFetch(endpoint: string): Promise<Response> {
  const separator = endpoint.includes("?") ? "&" : "?";
  return fetchWithTimeout(`${API_BASE}${endpoint}${separator}app_name=${APP_NAME}`, {}, 5000);
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

function mapPlaylist(raw: AudiusPlaylistResponse): NormalizedAlbum {
  const artUrl = raw.artwork?.["1000x1000"] ?? raw.artwork?.["480x480"];
  return {
    sourceService: "audius",
    sourceId: raw.id,
    title: raw.playlist_name,
    artists: [raw.user.name],
    artworkUrl: artUrl,
    totalTracks: raw.track_count,
    webUrl: `https://audius.co${raw.permalink}`,
  };
}

async function fetchAlbumById(playlistId: string): Promise<NormalizedAlbum | null> {
  // Try resolve first (for path-based IDs), then direct ID lookup
  if (playlistId.includes("/")) {
    const response = await audiusFetch(
      `/resolve?url=https://audius.co/${encodeURIComponent(playlistId)}`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as AudiusPlaylistDetailResponse;
    if (!data.data?.is_album) return null;
    return mapPlaylist(data.data);
  }

  const response = await audiusFetch(`/playlists/${encodeURIComponent(playlistId)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as AudiusPlaylistDetailResponse;
  if (!data.data?.is_album) return null;
  return mapPlaylist(data.data);
}

async function searchAudiusAlbums(query: string): Promise<NormalizedAlbum[]> {
  const response = await audiusFetch(
    `/playlists/search?query=${encodeURIComponent(query)}&limit=10`,
  );
  if (!response.ok) return [];
  const data = (await response.json()) as AudiusPlaylistSearchResponse;
  return (data.data ?? []).filter((p) => p.is_album).slice(0, 5).map(mapPlaylist);
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
      const response = await audiusFetch(`/resolve?url=https://audius.co/${encodeURIComponent(trackId)}`);

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
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    const response = await audiusFetch(`/tracks/search?query=${encodeURIComponent(q)}&limit=5`);

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

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    // Audius albums share URL structure with tracks; resolved by API response
    const match = AUDIUS_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumById(albumId);
    if (!album) throw new Error(`Audius: Album not found: ${albumId}`);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const albums = await searchAudiusAlbums(q);
      if (albums.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const album of albums) {
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], totalTracks: query.totalTracks, releaseDate: query.year },
          { title: album.title, artists: album.artists, totalTracks: album.totalTracks, releaseDate: album.releaseDate },
        );
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
      log.debug("Audius", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
