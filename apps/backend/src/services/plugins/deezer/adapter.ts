import { RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { calculateAlbumConfidence } from "../../../lib/resolve/normalize";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumCapabilities,
  AlbumMatchResult,
  AlbumSearchQuery,
  ArtistCapabilities,
  ArtistMatchResult,
  ArtistSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../../types.js";
import { scoreSearchCandidate } from "../_shared/confidence.js";

const API_BASE = "https://api.deezer.com";

const DEEZER_TRACK_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/;
const DEEZER_ALBUM_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/;
const DEEZER_ARTIST_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/;

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

interface DeezerAlbumTrack {
  id: number;
  title: string;
  isrc?: string;
  track_position: number;
  duration: number; // seconds
  rank?: number;
  preview?: string;
}

interface DeezerAlbumResponse {
  id: number;
  title: string;
  artist: { name: string };
  release_date?: string;
  nb_tracks?: number;
  cover_xl?: string;
  cover_big?: string;
  upc?: string;
  label?: string;
  link: string;
  tracks?: { data: DeezerAlbumTrack[] };
}

interface DeezerAlbumSearchResponse {
  data: DeezerAlbumResponse[];
  total: number;
}

function mapAlbum(raw: DeezerAlbumResponse): NormalizedAlbum {
  const tracks = raw.tracks?.data ?? [];
  // Pick the track with the highest rank as "most popular"
  const topTrack = tracks.reduce<DeezerAlbumTrack | undefined>(
    (best, t) => (t.rank !== undefined && (best === undefined || t.rank > (best.rank ?? 0)) ? t : best),
    undefined,
  );

  return {
    sourceService: "deezer",
    sourceId: String(raw.id),
    upc: raw.upc,
    title: raw.title,
    artists: [raw.artist.name],
    releaseDate: raw.release_date,
    totalTracks: raw.nb_tracks,
    artworkUrl: raw.cover_xl ?? raw.cover_big,
    label: raw.label,
    webUrl: raw.link ?? `https://www.deezer.com/album/${raw.id}`,
    topTrackPreviewUrl: topTrack?.preview,
    tracks: tracks.map((t) => ({
      title: t.title,
      trackNumber: t.track_position,
      durationMs: t.duration * 1000,
      isrc: t.isrc,
    })),
  };
}

interface DeezerErrorResponse {
  error: { type: string; message: string; code: number };
}

async function deezerFetch(endpoint: string): Promise<Response> {
  return fetchWithTimeout(`${API_BASE}${endpoint}`, {}, 5000);
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
      throw serviceHttpError(SERVICE.DEEZER, response.status, RESOURCE_KIND.TRACK, trackId);
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      throw serviceNotFoundError(SERVICE.DEEZER, RESOURCE_KIND.TRACK, trackId, data.error.message);
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
    const q = query.title === query.artist ? query.title : `artist:"${query.artist}" track:"${query.title}"`;

    const response = await deezerFetch(`/search/track?q=${encodeURIComponent(q)}&limit=5`);

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

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < items.length; i++) {
      const track = mapTrack(items[i]);
      const confidence = scoreSearchCandidate(query, track, i);
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
  // --- Album support ---

  albumCapabilities: {
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  } satisfies AlbumCapabilities,

  detectAlbumUrl(url: string): string | null {
    const match = DEEZER_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const response = await deezerFetch(`/album/${encodeURIComponent(albumId)}`);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.DEEZER, response.status, RESOURCE_KIND.ALBUM, albumId);
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      throw serviceNotFoundError(
        SERVICE.DEEZER,
        RESOURCE_KIND.ALBUM,
        albumId,
        (data as DeezerErrorResponse).error.message,
      );
    }

    return mapAlbum(data as DeezerAlbumResponse);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const response = await deezerFetch(`/album/upc:${encodeURIComponent(upc)}`);

    if (!response.ok) {
      log.debug("Deezer", "UPC album lookup failed:", response.status);
      return null;
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      log.debug("Deezer", "Album UPC not found:", upc);
      return null;
    }

    return mapAlbum(data as DeezerAlbumResponse);
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `artist:"${query.artist}" album:"${query.title}"`;
    const response = await deezerFetch(`/search/album?q=${encodeURIComponent(q)}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const items = (data as DeezerAlbumSearchResponse).data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestAlbum: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const album = mapAlbum(item);
      const confidence = calculateAlbumConfidence(
        { title: query.title, artists: [query.artist], totalTracks: query.totalTracks },
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

  // --- Artist support ---

  artistCapabilities: {
    supportsArtistSearch: true,
  } satisfies ArtistCapabilities,

  detectArtistUrl(url: string): string | null {
    const match = DEEZER_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const response = await deezerFetch(`/artist/${encodeURIComponent(artistId)}`);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.DEEZER, response.status, RESOURCE_KIND.ARTIST, artistId);
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      throw serviceNotFoundError(SERVICE.DEEZER, RESOURCE_KIND.ARTIST, artistId, data.error.message);
    }

    return {
      sourceService: "deezer",
      sourceId: String(data.id),
      name: data.name,
      imageUrl: data.picture_xl ?? data.picture_big,
      webUrl: data.link ?? `https://www.deezer.com/artist/${data.id}`,
    };
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const response = await deezerFetch(`/search/artist?q=${encodeURIComponent(query.name)}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const queryNameLower = query.name.toLowerCase().trim();
    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const nameLower = item.name.toLowerCase().trim();

      let confidence: number;
      if (nameLower === queryNameLower) {
        confidence = 0.95;
      } else if (nameLower.includes(queryNameLower) || queryNameLower.includes(nameLower)) {
        confidence = 0.75;
      } else {
        confidence = 0.5;
      }

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestArtist = {
          sourceService: "deezer",
          sourceId: String(item.id),
          name: item.name,
          imageUrl: item.picture_xl ?? item.picture_big,
          webUrl: item.link ?? `https://www.deezer.com/artist/${item.id}`,
        };
      }
    }

    if (!bestArtist || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
