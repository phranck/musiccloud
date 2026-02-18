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

// QQ Music URLs: y.qq.com/n/ryqq/songDetail/{mid}
const QQMUSIC_TRACK_REGEX = /^https?:\/\/y\.qq\.com\/n\/ryqq\/songDetail\/([A-Za-z0-9]+)/;
// QQ Music album URLs: y.qq.com/n/ryqq/albumDetail/{mid}
const QQMUSIC_ALBUM_REGEX = /^https?:\/\/y\.qq\.com\/n\/ryqq\/albumDetail\/([A-Za-z0-9]+)/;

interface QQMusicSong {
  mid: string;
  name: string;
  singer: Array<{ mid: string; name: string }>;
  album: { mid: string; name: string };
  interval: number; // duration in seconds
}

interface QQMusicAlbum {
  mid: string;
  name: string;
  singer: Array<{ mid: string; name: string }>;
  publicTime?: string; // "YYYY-MM-DD"
  upc?: string;
  genre?: string;
  total?: number; // track count
  desc?: string;
}

interface QQMusicAlbumSearchResponse {
  [key: string]: {
    data?: {
      body?: {
        album?: {
          list?: QQMusicAlbum[];
        };
      };
    };
    code?: number;
  };
}

interface QQMusicSearchResponse {
  [key: string]: {
    data?: {
      body?: {
        song?: {
          list?: QQMusicSong[];
        };
      };
    };
    code?: number;
  };
}

async function qqmusicFetch(url: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        Referer: "https://y.qq.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ...init?.headers,
      },
    },
    timeoutMs,
  );
}

function mapSong(song: QQMusicSong): NormalizedTrack {
  const artists = song.singer?.map((s) => s.name).filter(Boolean) ?? ["Unknown Artist"];

  // QQ Music album art: https://y.qq.com/music/photo_new/T002R300x300M000{album_mid}.jpg
  const artworkUrl = song.album?.mid
    ? `https://y.qq.com/music/photo_new/T002R300x300M000${song.album.mid}.jpg`
    : undefined;

  return {
    sourceService: "qqmusic",
    sourceId: song.mid,
    title: song.name,
    artists,
    albumName: song.album?.name,
    durationMs: song.interval ? song.interval * 1000 : undefined,
    artworkUrl,
    webUrl: `https://y.qq.com/n/ryqq/songDetail/${song.mid}`,
  };
}

async function searchSongs(query: string): Promise<QQMusicSong[]> {
  const requestBody = {
    "music.search.SearchCgiService": {
      method: "DoSearchForQQMusicDesktop",
      module: "music.search.SearchCgiService",
      param: {
        num_per_page: 5,
        page_num: 1,
        query: query,
        search_type: 0,
      },
    },
  };

  const response = await qqmusicFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) return [];

  try {
    const data = (await response.json()) as QQMusicSearchResponse;
    const searchResult = data["music.search.SearchCgiService"];
    return searchResult?.data?.body?.song?.list ?? [];
  } catch {
    return [];
  }
}

async function getTrackByMid(mid: string): Promise<NormalizedTrack | null> {
  // Use search to find track by mid (no direct detail API without auth)
  const requestBody = {
    "music.search.SearchCgiService": {
      method: "DoSearchForQQMusicDesktop",
      module: "music.search.SearchCgiService",
      param: {
        num_per_page: 1,
        page_num: 1,
        query: mid,
        search_type: 0,
      },
    },
  };

  const response = await qqmusicFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) return null;

  try {
    const data = (await response.json()) as QQMusicSearchResponse;
    const songs = data["music.search.SearchCgiService"]?.data?.body?.song?.list ?? [];
    const song = songs.find((s) => s.mid === mid);
    if (!song) return null;
    return mapSong(song);
  } catch {
    return null;
  }
}

function mapQQAlbum(album: QQMusicAlbum): NormalizedAlbum {
  const artists = album.singer?.map((s) => s.name).filter(Boolean) ?? ["Unknown Artist"];
  // QQ Music album art: T002R500x500M000{album_mid}.jpg
  const artworkUrl = album.mid
    ? `https://y.qq.com/music/photo_new/T002R500x500M000${album.mid}.jpg`
    : undefined;

  return {
    sourceService: "qqmusic",
    sourceId: album.mid,
    upc: album.upc,
    title: album.name,
    artists,
    artworkUrl,
    releaseDate: album.publicTime,
    totalTracks: album.total,
    webUrl: `https://y.qq.com/n/ryqq/albumDetail/${album.mid}`,
  };
}

async function searchQQMusicAlbums(query: string): Promise<QQMusicAlbum[]> {
  const requestBody = {
    "music.search.SearchCgiService": {
      method: "DoSearchForQQMusicDesktop",
      module: "music.search.SearchCgiService",
      param: {
        num_per_page: 5,
        page_num: 1,
        query,
        search_type: 8, // 8 = albums
      },
    },
  };

  const response = await qqmusicFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) return [];

  try {
    const data = (await response.json()) as QQMusicAlbumSearchResponse;
    const searchResult = data["music.search.SearchCgiService"];
    return searchResult?.data?.body?.album?.list ?? [];
  } catch {
    return [];
  }
}

async function getAlbumByMid(albumMid: string): Promise<NormalizedAlbum | null> {
  // Use search with album mid to get album details
  const requestBody = {
    "music.search.SearchCgiService": {
      method: "DoSearchForQQMusicDesktop",
      module: "music.search.SearchCgiService",
      param: { num_per_page: 1, page_num: 1, query: albumMid, search_type: 8 },
    },
  };

  const response = await qqmusicFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) return null;

  try {
    const data = (await response.json()) as QQMusicAlbumSearchResponse;
    const albums = data["music.search.SearchCgiService"]?.data?.body?.album?.list ?? [];
    const album = albums.find((a) => a.mid === albumMid);
    if (!album) return null;
    return mapQQAlbum(album);
  } catch {
    return null;
  }
}

export const qqmusicAdapter: ServiceAdapter = {
  id: "qqmusic",
  displayName: "QQ Music",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed
  },

  detectUrl(url: string): string | null {
    const match = QQMUSIC_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await getTrackByMid(trackId);
    if (!track) {
      throw new Error(`QQ Music: Track not found: ${trackId}`);
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
        log.debug("QQ Music", "Search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("QQ Music", `Search returned ${songs.length} results for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        if (!song.mid || !song.name) continue;

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
          "QQ Music",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("QQ Music", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("QQ Music", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = QQMUSIC_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await getAlbumByMid(albumId);
    if (!album) throw new Error(`QQ Music: Album not found: ${albumId}`);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const results = await searchQQMusicAlbums(q);
      if (results.length === 0) {
        log.debug("QQ Music", "Album search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("QQ Music", `Album search returned ${results.length} results for: ${q}`);

      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const raw of results) {
        if (!raw.mid || !raw.name) continue;
        const album = mapQQAlbum(raw);
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], totalTracks: query.totalTracks, releaseDate: query.year },
          { title: album.title, artists: album.artists, totalTracks: album.totalTracks, releaseDate: album.releaseDate },
        );
        log.debug("QQ Music", `  "${raw.name}" -> confidence=${confidence.toFixed(3)}`);
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
      log.debug("QQ Music", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
