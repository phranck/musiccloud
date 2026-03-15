import { fetchWithTimeout } from "../../lib/infra/fetch";
import { log } from "../../lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "../../lib/resolve/normalize";
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

// NetEase Cloud Music URLs: music.163.com/song?id={songId} or music.163.com/#/song?id={songId}
const NETEASE_TRACK_REGEX = /^https?:\/\/music\.163\.com\/(?:#\/)?song\?id=(\d+)/;
// NetEase album URLs: music.163.com/album?id={id} or music.163.com/#/album?id={id}
const NETEASE_ALBUM_REGEX = /^https?:\/\/music\.163\.com\/(?:#\/)?album\?id=(\d+)/;

interface NetEaseSong {
  id: number;
  name: string;
  artists?: Array<{ id: number; name: string }>;
  album?: { id: number; name: string; picUrl?: string };
  duration?: number; // milliseconds
}

interface NetEaseSearchResponse {
  result?: {
    songs?: NetEaseSong[];
    songCount?: number;
  };
  code?: number;
}

interface NetEaseAlbum {
  id: number;
  name: string;
  picUrl?: string;
  artist?: { name: string };
  artists?: Array<{ id: number; name: string }>;
  publishTime?: number; // epoch ms
  company?: string;
  size?: number; // track count
  description?: string;
}

interface NetEaseAlbumDetailResponse {
  album?: NetEaseAlbum;
  songs?: Array<{ id: number; name: string; dt?: number; ar?: Array<{ name: string }> }>;
  code?: number;
}

interface NetEaseAlbumSearchResponse {
  result?: {
    albums?: NetEaseAlbum[];
    albumCount?: number;
  };
  code?: number;
}

interface NetEaseDetailResponse {
  songs?: Array<{
    id: number;
    name: string;
    ar?: Array<{ id: number; name: string }>;
    al?: { id: number; name: string; picUrl?: string };
    dt?: number; // duration ms
  }>;
  code?: number;
}

async function neteaseFetch(url: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://music.163.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ...init?.headers,
      },
    },
    timeoutMs,
  );
}

function mapSearchSong(song: NetEaseSong): NormalizedTrack {
  const artists = song.artists?.map((a) => a.name).filter(Boolean) ?? ["Unknown Artist"];

  return {
    sourceService: "netease",
    sourceId: String(song.id),
    title: song.name,
    artists,
    albumName: song.album?.name,
    durationMs: song.duration,
    artworkUrl: song.album?.picUrl,
    webUrl: `https://music.163.com/song?id=${song.id}`,
  };
}

async function getTrackById(songId: string): Promise<NormalizedTrack | null> {
  const url = `https://music.163.com/api/song/detail?ids=[${songId}]&id=${songId}`;

  const response = await neteaseFetch(url);
  if (!response.ok) return null;

  try {
    const data = (await response.json()) as NetEaseDetailResponse;
    const song = data.songs?.[0];
    if (!song) return null;

    const artists = song.ar?.map((a) => a.name).filter(Boolean) ?? ["Unknown Artist"];

    return {
      sourceService: "netease",
      sourceId: String(song.id),
      title: song.name,
      artists,
      albumName: song.al?.name,
      durationMs: song.dt,
      artworkUrl: song.al?.picUrl,
      webUrl: `https://music.163.com/song?id=${song.id}`,
    };
  } catch {
    return null;
  }
}

async function searchSongs(query: string): Promise<NetEaseSong[]> {
  const params = new URLSearchParams({
    s: query,
    type: "1",
    offset: "0",
    limit: "5",
  });

  const response = await neteaseFetch("https://music.163.com/api/search/get", {
    method: "POST",
    body: params.toString(),
  });

  if (!response.ok) return [];

  try {
    const data = (await response.json()) as NetEaseSearchResponse;
    return data.result?.songs ?? [];
  } catch {
    return [];
  }
}

function mapNetEaseAlbum(album: NetEaseAlbum, songCount?: number): NormalizedAlbum {
  const artists =
    album.artists?.map((a) => a.name).filter(Boolean) ??
    (album.artist?.name ? [album.artist.name] : ["Unknown Artist"]);
  const releaseDate = album.publishTime ? new Date(album.publishTime).toISOString().slice(0, 10) : undefined;

  return {
    sourceService: "netease",
    sourceId: String(album.id),
    title: album.name,
    artists,
    artworkUrl: album.picUrl,
    releaseDate,
    totalTracks: songCount ?? album.size,
    label: album.company,
    webUrl: `https://music.163.com/album?id=${album.id}`,
  };
}

async function getAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const response = await neteaseFetch(`https://music.163.com/api/album/${albumId}`);
  if (!response.ok) return null;

  try {
    const data = (await response.json()) as NetEaseAlbumDetailResponse;
    const album = data.album;
    if (!album) return null;
    return mapNetEaseAlbum(album, data.songs?.length);
  } catch {
    return null;
  }
}

async function searchNetEaseAlbums(query: string): Promise<NetEaseAlbum[]> {
  const params = new URLSearchParams({ s: query, type: "10", offset: "0", limit: "5" });
  const response = await neteaseFetch("https://music.163.com/api/search/get", {
    method: "POST",
    body: params.toString(),
  });
  if (!response.ok) return [];

  try {
    const data = (await response.json()) as NetEaseAlbumSearchResponse;
    return data.result?.albums ?? [];
  } catch {
    return [];
  }
}

export const neteaseAdapter: ServiceAdapter = {
  id: "netease",
  displayName: "NetEase Cloud Music",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed
  },

  detectUrl(url: string): string | null {
    const match = NETEASE_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await getTrackById(trackId);
    if (!track) {
      throw new Error(`NetEase: Track not found: ${trackId}`);
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
        log.debug("NetEase", "Search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("NetEase", `Search returned ${songs.length} results for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        if (!song.id || !song.name) continue;

        const track = mapSearchSong(song);
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
          "NetEase",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("NetEase", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("NetEase", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = NETEASE_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await getAlbumById(albumId);
    if (!album) throw new Error(`NetEase: Album not found: ${albumId}`);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const results = await searchNetEaseAlbums(q);
      if (results.length === 0) {
        log.debug("NetEase", "Album search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("NetEase", `Album search returned ${results.length} results for: ${q}`);

      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const raw of results) {
        if (!raw.id || !raw.name) continue;
        const album = mapNetEaseAlbum(raw);
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], totalTracks: query.totalTracks, releaseDate: query.year },
          {
            title: album.title,
            artists: album.artists,
            totalTracks: album.totalTracks,
            releaseDate: album.releaseDate,
          },
        );
        log.debug("NetEase", `  "${raw.name}" -> confidence=${confidence.toFixed(3)}`);
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
      log.debug("NetEase", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
