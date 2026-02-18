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

// Melon URLs: melon.com/song/detail.htm?songId={id}
const MELON_TRACK_REGEX = /^https?:\/\/(?:www\.)?melon\.com\/song\/detail\.htm\?songId=(\d+)/;
// Melon album URLs: melon.com/album/detail.htm?albumId={id}
const MELON_ALBUM_REGEX = /^https?:\/\/(?:www\.)?melon\.com\/album\/detail\.htm\?albumId=(\d+)/;

interface MelonAlbumJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  datePublished?: string;
  byArtist?: { name?: string } | Array<{ name?: string }>;
  numTracks?: number;
}

interface MelonJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  duration?: string; // ISO 8601
  byArtist?: { name?: string } | Array<{ name?: string }>;
  inAlbum?: { name?: string };
}

function parseDuration(iso: string): number | undefined {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return undefined;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

async function melonFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
      },
    },
    timeoutMs,
  );
}

function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const regex = /<meta\s+(?:property|name)="og:(\w+)"\s+content="([^"]*)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    tags[m[1]] = m[2];
  }
  return tags;
}

function parseJsonLd(html: string): MelonJsonLd | null {
  const match = /application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;

  try {
    const data = JSON.parse(match[1]) as MelonJsonLd;
    if (data["@type"] !== "MusicRecording") return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchTrackById(songId: string): Promise<NormalizedTrack | null> {
  const url = `https://www.melon.com/song/detail.htm?songId=${songId}`;
  const response = await melonFetch(url);
  if (!response.ok) return null;

  const html = await response.text();

  // Try JSON-LD first
  const jsonLd = parseJsonLd(html);
  if (jsonLd?.name) {
    const artistData = jsonLd.byArtist;
    const artists: string[] = [];
    if (Array.isArray(artistData)) {
      for (const a of artistData) {
        if (a.name) artists.push(a.name);
      }
    } else if (artistData?.name) {
      artists.push(artistData.name);
    }
    if (artists.length === 0) artists.push("Unknown Artist");

    return {
      sourceService: "melon",
      sourceId: songId,
      title: jsonLd.name,
      artists,
      albumName: jsonLd.inAlbum?.name,
      durationMs: jsonLd.duration ? parseDuration(jsonLd.duration) : undefined,
      artworkUrl: jsonLd.image,
      webUrl: `https://www.melon.com/song/detail.htm?songId=${songId}`,
    };
  }

  // Fallback to OG tags
  const og = extractOgTags(html);
  if (og.title) {
    return {
      sourceService: "melon",
      sourceId: songId,
      title: og.title,
      artists: ["Unknown Artist"],
      artworkUrl: og.image,
      webUrl: `https://www.melon.com/song/detail.htm?songId=${songId}`,
    };
  }

  return null;
}

async function searchForSongIds(query: string): Promise<string[]> {
  const searchUrl = `https://www.melon.com/search/song/index.htm?q=${encodeURIComponent(query)}`;
  const response = await melonFetch(searchUrl);
  if (!response.ok) return [];

  const html = await response.text();

  // Extract song IDs from data-song-no attributes
  const songIds: string[] = [];
  const seen = new Set<string>();
  const idMatches = html.matchAll(/data-song-no="(\d+)"/g);
  for (const m of idMatches) {
    if (m[1] && !seen.has(m[1])) {
      seen.add(m[1]);
      songIds.push(m[1]);
    }
    if (songIds.length >= 5) break;
  }

  return songIds;
}

function parseMelonAlbumJsonLd(html: string): MelonAlbumJsonLd | null {
  const match = /application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;
  try {
    const data = JSON.parse(match[1]) as MelonAlbumJsonLd;
    if (data["@type"] !== "MusicAlbum" || !data.name) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const url = `https://www.melon.com/album/detail.htm?albumId=${albumId}`;
  const response = await melonFetch(url);
  if (!response.ok) return null;

  const html = await response.text();

  // Try JSON-LD first
  const jsonLd = parseMelonAlbumJsonLd(html);
  if (jsonLd) {
    const artistData = jsonLd.byArtist;
    const artists: string[] = [];
    if (Array.isArray(artistData)) {
      for (const a of artistData) {
        if (a.name) artists.push(a.name);
      }
    } else if (artistData?.name) {
      artists.push(artistData.name);
    }
    if (artists.length === 0) artists.push("Unknown Artist");

    return {
      sourceService: "melon",
      sourceId: albumId,
      title: jsonLd.name!,
      artists,
      artworkUrl: jsonLd.image,
      releaseDate: jsonLd.datePublished,
      totalTracks: jsonLd.numTracks,
      webUrl: `https://www.melon.com/album/detail.htm?albumId=${albumId}`,
    };
  }

  // Fallback to OG tags
  const og = extractOgTags(html);
  if (og.title) {
    return {
      sourceService: "melon",
      sourceId: albumId,
      title: og.title,
      artists: ["Unknown Artist"],
      artworkUrl: og.image,
      webUrl: `https://www.melon.com/album/detail.htm?albumId=${albumId}`,
    };
  }

  return null;
}

async function searchMelonAlbumIds(query: string): Promise<string[]> {
  const searchUrl = `https://www.melon.com/search/album/index.htm?q=${encodeURIComponent(query)}`;
  const response = await melonFetch(searchUrl);
  if (!response.ok) return [];

  const html = await response.text();
  const albumIds: string[] = [];
  const seen = new Set<string>();
  const idMatches = html.matchAll(/albumId=(\d+)/g);
  for (const m of idMatches) {
    if (m[1] && !seen.has(m[1])) {
      seen.add(m[1]);
      albumIds.push(m[1]);
    }
    if (albumIds.length >= 5) break;
  }
  return albumIds;
}

export const melonAdapter: ServiceAdapter = {
  id: "melon",
  displayName: "Melon",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed
  },

  detectUrl(url: string): string | null {
    const match = MELON_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw new Error(`Melon: Track not found: ${trackId}`);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const songIds = await searchForSongIds(q);
      if (songIds.length === 0) {
        log.debug("Melon", "Search returned no song IDs for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Melon", `Search returned ${songIds.length} IDs for: ${q}`);

      // Fetch track pages in parallel
      const trackResults = await Promise.allSettled(songIds.map((id) => fetchTrackById(id)));

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < trackResults.length; i++) {
        const result = trackResults[i];
        if (result.status !== "fulfilled" || !result.value) continue;

        const track = result.value;
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
          "Melon",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("Melon", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("Melon", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = MELON_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumById(albumId);
    if (!album) throw new Error(`Melon: Album not found: ${albumId}`);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const albumIds = await searchMelonAlbumIds(q);
      if (albumIds.length === 0) {
        log.debug("Melon", "Album search returned no IDs for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Melon", `Album search returned ${albumIds.length} IDs for: ${q}`);

      const albumResults = await Promise.allSettled(albumIds.map((id) => fetchAlbumById(id)));
      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const result of albumResults) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const album = result.value;
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], releaseDate: query.year },
          { title: album.title, artists: album.artists, releaseDate: album.releaseDate },
        );
        log.debug("Melon", `  "${album.title}" -> confidence=${confidence.toFixed(3)}`);
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
      log.debug("Melon", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
