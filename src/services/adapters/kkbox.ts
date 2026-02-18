import { fetchWithTimeout } from "../../lib/fetch.js";
import { log } from "../../lib/logger.js";
import { calculateAlbumConfidence, calculateConfidence } from "../../lib/normalize.js";
import { TokenManager } from "../../lib/token-manager.js";
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

const API_BASE = "https://api.kkbox.com/v1.1";

const KKBOX_TRACK_REGEX = /(?:https?:\/\/)?(?:www\.)?kkbox\.com\/[a-z]{2}\/[a-z]{2}\/song\/([A-Za-z0-9_-]+)/;
// KKBOX album URLs: kkbox.com/{locale}/{locale}/album/{id}
const KKBOX_ALBUM_REGEX = /(?:https?:\/\/)?(?:www\.)?kkbox\.com\/[a-z]{2}\/[a-z]{2}\/album\/([A-Za-z0-9_-]+)/;

const tokenManager = new TokenManager({
  serviceName: "KKBOX",
  tokenUrl: "https://account.kkbox.com/oauth2/token",
  clientIdEnv: "KKBOX_CLIENT_ID",
  clientSecretEnv: "KKBOX_CLIENT_SECRET",
});

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

interface KkboxAlbumTrack {
  id: string;
  name: string;
  duration: number;
  isrc?: string;
  track_number?: number;
  url: string;
}

interface KkboxAlbumTracksResponse {
  data: KkboxAlbumTrack[];
}

interface KkboxAlbumResponse {
  id: string;
  name: string;
  url: string;
  release_date?: string;
  images?: Array<{ url: string; width: number; height: number }>;
  artist?: { id: string; name: string };
  total_tracks?: number;
}

interface KkboxAlbumSearchResponse {
  albums?: {
    data: KkboxAlbumResponse[];
  };
}

/** Reset token cache. For testing only. */
export function _resetTokenCache(): void {
  tokenManager.reset();
}

function getTerritory(): string {
  return import.meta.env.KKBOX_TERRITORY || "TW";
}

async function kkboxFetch(endpoint: string): Promise<Response> {
  const token = await tokenManager.getAccessToken();
  return fetchWithTimeout(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

function pickLargestImage(images?: Array<{ url: string; width: number; height: number }>): string | undefined {
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

function mapAlbum(raw: KkboxAlbumResponse, tracks?: KkboxAlbumTrack[]): NormalizedAlbum {
  const territory = getTerritory();
  const albumTracks: AlbumTrackEntry[] = (tracks ?? []).map((t, i) => ({
    title: t.name,
    isrc: t.isrc,
    trackNumber: t.track_number ?? i + 1,
    durationMs: t.duration,
  }));

  return {
    sourceService: "kkbox",
    sourceId: raw.id,
    title: raw.name,
    artists: raw.artist?.name ? [raw.artist.name] : ["Unknown Artist"],
    releaseDate: raw.release_date,
    totalTracks: raw.total_tracks ?? (albumTracks.length > 0 ? albumTracks.length : undefined),
    artworkUrl: pickLargestImage(raw.images),
    webUrl: raw.url || `https://www.kkbox.com/${territory.toLowerCase()}/${territory.toLowerCase()}/album/${raw.id}`,
    tracks: albumTracks.length > 0 ? albumTracks : undefined,
  };
}

async function getAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const territory = getTerritory();
  const response = await kkboxFetch(`/albums/${encodeURIComponent(albumId)}?territory=${territory}`);
  if (!response.ok) return null;

  const album: KkboxAlbumResponse = await response.json();

  // Fetch track listing
  let tracks: KkboxAlbumTrack[] = [];
  try {
    const tracksResponse = await kkboxFetch(
      `/albums/${encodeURIComponent(albumId)}/tracks?territory=${territory}&limit=50`,
    );
    if (tracksResponse.ok) {
      const tracksData: KkboxAlbumTracksResponse = await tracksResponse.json();
      tracks = tracksData.data ?? [];
    }
  } catch {
    // Track listing is optional
  }

  return mapAlbum(album, tracks);
}

async function searchKkboxAlbums(query: string): Promise<KkboxAlbumResponse[]> {
  const territory = getTerritory();
  const response = await kkboxFetch(
    `/search?q=${encodeURIComponent(query)}&type=album&territory=${territory}&limit=5`,
  );
  if (!response.ok) return [];

  const data: KkboxAlbumSearchResponse = await response.json();
  return data.albums?.data ?? [];
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
    return tokenManager.isConfigured();
  },

  detectUrl(url: string): string | null {
    const match = KKBOX_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const territory = getTerritory();
    const response = await kkboxFetch(`/tracks/${encodeURIComponent(trackId)}?territory=${territory}`);

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
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    const response = await kkboxFetch(`/search?q=${encodeURIComponent(q)}&type=track&territory=${territory}&limit=5`);

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

      log.debug(
        "KKBOX",
        `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
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

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  },

  detectAlbumUrl(url: string): string | null {
    const match = KKBOX_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await getAlbumById(albumId);
    if (!album) throw new Error(`KKBOX: Album not found: ${albumId}`);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;

    try {
      const results = await searchKkboxAlbums(q);
      if (results.length === 0) {
        log.debug("KKBOX", `Album search returned no results for: ${q}`);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("KKBOX", `Album search returned ${results.length} results for: ${q}`);

      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const raw of results) {
        const candidate = mapAlbum(raw);
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], totalTracks: query.totalTracks, releaseDate: query.year },
          { title: candidate.title, artists: candidate.artists, totalTracks: candidate.totalTracks, releaseDate: candidate.releaseDate },
        );
        log.debug("KKBOX", `  "${raw.name}" -> confidence=${confidence.toFixed(3)}`);
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = candidate;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      // Fetch full album with track listing for the best match
      const fullAlbum = await getAlbumById(bestMatch.sourceId);
      return {
        found: true,
        album: fullAlbum ?? bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("KKBOX", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
