import { fetchWithTimeout } from "@/lib/infra/fetch";
import { log } from "@/lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "@/lib/resolve/normalize";
import { TokenManager } from "@/lib/infra/token-manager";
import { MATCH_MIN_CONFIDENCE } from "../resolver.js";
import type {
  AdapterCapabilities,
  AlbumCapabilities,
  AlbumMatchResult,
  AlbumSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchResultWithCandidates,
  ServiceAdapter,
} from "../types.js";

const SPOTIFY_TRACK_REGEX = /(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:intl-\w+\/)?track\/([a-zA-Z0-9]+)/;
const SPOTIFY_URI_REGEX = /spotify:track:([a-zA-Z0-9]+)/;
const SPOTIFY_ALBUM_REGEX = /(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:intl-\w+\/)?album\/([a-zA-Z0-9]+)/;

const API_BASE = "https://api.spotify.com/v1";

const tokenManager = new TokenManager({
  serviceName: "Spotify",
  tokenUrl: "https://accounts.spotify.com/api/token",
  clientIdEnv: "SPOTIFY_CLIENT_ID",
  clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
});

async function spotifyFetch(endpoint: string): Promise<Response> {
  const token = await tokenManager.getAccessToken();
  return fetchWithTimeout(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
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

// Minimal types for the Spotify API album response fields we use
interface SpotifyAlbumTrack {
  id: string;
  name: string;
  track_number: number;
  duration_ms: number;
  external_ids?: { isrc?: string };
}

interface SpotifyAlbumResponse {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  release_date?: string;
  total_tracks?: number;
  images?: Array<{ url: string; width: number; height: number }>;
  external_ids?: { upc?: string };
  label?: string;
  external_urls?: { spotify?: string };
  tracks?: { items: SpotifyAlbumTrack[] };
}

interface SpotifyAlbumSearchResponse {
  albums?: { items: SpotifyAlbumResponse[] };
}

function mapAlbum(raw: SpotifyAlbumResponse): NormalizedAlbum {
  return {
    sourceService: "spotify",
    sourceId: raw.id,
    upc: raw.external_ids?.upc,
    title: raw.name,
    artists: raw.artists.map((a) => a.name),
    releaseDate: raw.release_date,
    totalTracks: raw.total_tracks,
    artworkUrl: raw.images?.[0]?.url,
    label: raw.label,
    webUrl: raw.external_urls?.spotify ?? `https://open.spotify.com/album/${raw.id}`,
    tracks: raw.tracks?.items.map((t) => ({
      title: t.name,
      trackNumber: t.track_number,
      durationMs: t.duration_ms,
      isrc: t.external_ids?.isrc,
    })),
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
    return tokenManager.isConfigured();
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

  async searchTrack(query: { title: string; artist: string; album?: string }): Promise<MatchResult> {
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

  async searchTrackWithCandidates(query: {
    title: string;
    artist: string;
    album?: string;
  }): Promise<SearchResultWithCandidates> {
    log.debug("Spotify", "searchTrackWithCandidates called with:", query);
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

    log.debug("Spotify", "Search query string:", q);

    const response = await spotifyFetch(`/search?type=track&q=${q}&limit=10`);

    log.debug("Spotify", "API response status:", response.status, response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Spotify", "Search failed:", response.status, errorText);
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
    const bestMatch: MatchResult =
      best.confidence >= MATCH_MIN_CONFIDENCE
        ? { found: true, track: best.track, confidence: best.confidence, matchMethod: "search" }
        : { found: false, confidence: best.confidence, matchMethod: "search" };

    return {
      bestMatch,
      candidates: scored.filter((c) => c.confidence >= 0.4),
    };
  },
  // --- Album support ---

  albumCapabilities: {
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  } satisfies AlbumCapabilities,

  detectAlbumUrl(url: string): string | null {
    const match = SPOTIFY_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const response = await spotifyFetch(`/albums/${encodeURIComponent(albumId)}`);

    if (!response.ok) {
      throw new Error(`Spotify getAlbum failed: ${response.status}`);
    }

    const data: SpotifyAlbumResponse = await response.json();
    return mapAlbum(data);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const response = await spotifyFetch(`/search?type=album&q=${encodeURIComponent(`upc:${upc}`)}&limit=1`);

    if (!response.ok) {
      log.debug("Spotify", "UPC album lookup failed:", response.status);
      return null;
    }

    const data: SpotifyAlbumSearchResponse = await response.json();
    const items = data.albums?.items ?? [];
    if (items.length === 0) return null;

    return mapAlbum(items[0]);
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `album:${query.title} artist:${query.artist}`;
    const response = await spotifyFetch(`/search?type=album&q=${encodeURIComponent(q)}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data: SpotifyAlbumSearchResponse = await response.json();
    const items = data.albums?.items ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestAlbum: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const album = mapAlbum(item);
      const confidence = calculateAlbumConfidence(
        { title: query.title, artists: [query.artist], releaseDate: query.year, totalTracks: query.totalTracks },
        { title: album.title, artists: album.artists, releaseDate: album.releaseDate, totalTracks: album.totalTracks },
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestAlbum = album;
      }
    }

    if (!bestAlbum || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, album: bestAlbum, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
