/**
 * Boomplay Scrape Adapter
 *
 * Boomplay has no public API. This adapter scrapes the web player pages:
 * - getTrack: Fetches song page HTML, parses JSON-LD MusicRecording schema
 * - searchTrack: Fetches search page, extracts song IDs, then fetches each
 *   result page for JSON-LD metadata (N+1 pattern, limited to top 5)
 * - findByIsrc: Not supported (Boomplay exposes no ISRC data)
 */

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
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BOOMPLAY_SONG_REGEX = /^https?:\/\/(?:www\.)?boomplay\.com\/songs\/(\d+)/;
// Boomplay album URLs: boomplay.com/albums/{id}
const BOOMPLAY_ALBUM_REGEX = /^https?:\/\/(?:www\.)?boomplay\.com\/albums\/(\d+)/;

/** JSON-LD MusicAlbum schema as embedded in Boomplay album pages */
interface BoomplayAlbumJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  datePublished?: string;
  byArtist?: Array<{ name?: string }>;
  numTracks?: number;
}

/** JSON-LD MusicRecording schema as embedded in Boomplay song pages */
interface BoomplayJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  duration?: string; // ISO 8601: "PT03M45S"
  byArtist?: Array<{ name?: string }>;
  inAlbum?: { name?: string };
}

/** Parse ISO 8601 duration (PTxxMxxS) to milliseconds */
function parseDuration(iso: string): number | undefined {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return undefined;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

async function boomplayFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
    timeoutMs,
  );
}

/** Extract JSON-LD MusicRecording from a Boomplay song page */
function parseJsonLd(html: string): BoomplayJsonLd | null {
  const match = /application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;

  try {
    const data = JSON.parse(match[1]) as BoomplayJsonLd;
    if (data["@type"] !== "MusicRecording") return null;
    return data;
  } catch {
    return null;
  }
}

/** Fetch a Boomplay song page and extract track metadata from JSON-LD */
async function fetchTrackById(songId: string): Promise<NormalizedTrack | null> {
  const url = `https://www.boomplay.com/songs/${songId}`;
  const response = await boomplayFetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const jsonLd = parseJsonLd(html);
  if (!jsonLd?.name) return null;

  return mapJsonLd(jsonLd, songId);
}

function mapJsonLd(data: BoomplayJsonLd, songId: string): NormalizedTrack {
  const artists = data.byArtist?.map((a) => a.name).filter((n): n is string => Boolean(n)) ?? ["Unknown Artist"];

  return {
    sourceService: "boomplay",
    sourceId: songId,
    title: data.name ?? "Unknown",
    artists,
    albumName: data.inAlbum?.name,
    durationMs: data.duration ? parseDuration(data.duration) : undefined,
    artworkUrl: data.image,
    webUrl: `https://www.boomplay.com/songs/${songId}`,
  };
}

/** Extract JSON-LD MusicAlbum from a Boomplay album page */
function parseAlbumJsonLd(html: string): BoomplayAlbumJsonLd | null {
  const match = /application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;
  try {
    const data = JSON.parse(match[1]) as BoomplayAlbumJsonLd;
    if (data["@type"] !== "MusicAlbum" || !data.name) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const url = `https://www.boomplay.com/albums/${albumId}`;
  const response = await boomplayFetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const jsonLd = parseAlbumJsonLd(html);
  if (!jsonLd) return null;

  const artists = jsonLd.byArtist?.map((a) => a.name).filter((n): n is string => Boolean(n)) ?? ["Unknown Artist"];
  return {
    sourceService: "boomplay",
    sourceId: albumId,
    title: jsonLd.name!,
    artists,
    artworkUrl: jsonLd.image,
    releaseDate: jsonLd.datePublished,
    totalTracks: jsonLd.numTracks,
    webUrl: `https://www.boomplay.com/albums/${albumId}`,
  };
}

async function searchBoomplayAlbumIds(query: string): Promise<string[]> {
  const searchUrl = `https://www.boomplay.com/search/default/${encodeURIComponent(query)}`;
  const response = await boomplayFetch(searchUrl);
  if (!response.ok) return [];

  const html = await response.text();

  // Extract album IDs from /albums/{id} links in the search page
  const albumIds: string[] = [];
  const seen = new Set<string>();
  const idMatches = html.matchAll(/\/albums\/(\d+)/g);
  for (const m of idMatches) {
    if (m[1] && !seen.has(m[1])) {
      seen.add(m[1]);
      albumIds.push(m[1]);
    }
    if (albumIds.length >= 5) break;
  }
  return albumIds;
}

export const boomplayAdapter: ServiceAdapter = {
  id: "boomplay",
  displayName: "Boomplay",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed
  },

  detectUrl(url: string): string | null {
    const match = BOOMPLAY_SONG_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw new Error(`Boomplay: Track not found: ${trackId}`);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    // Boomplay exposes no ISRC data
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      // Step 1: Fetch search page and extract song IDs
      const searchUrl = `https://www.boomplay.com/search/default/${encodeURIComponent(q)}`;
      const response = await boomplayFetch(searchUrl);

      if (!response.ok) {
        log.debug("Boomplay", "Search page failed:", response.status);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const html = await response.text();

      // Extract data-id attributes (song IDs embedded in search results)
      const idMatches = html.matchAll(/data-id="(\d+)"/g);
      const songIds: string[] = [];
      const seen = new Set<string>();
      for (const m of idMatches) {
        if (m[1] && !seen.has(m[1])) {
          seen.add(m[1]);
          songIds.push(m[1]);
        }
        if (songIds.length >= 5) break;
      }

      if (songIds.length === 0) {
        log.debug("Boomplay", "Search returned no song IDs for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Boomplay", `Search returned ${songIds.length} IDs for: ${q}`);

      // Step 2: Fetch each song page in parallel for JSON-LD metadata
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
          "Boomplay",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("Boomplay", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("Boomplay", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = BOOMPLAY_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumById(albumId);
    if (!album) throw new Error(`Boomplay: Album not found: ${albumId}`);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const albumIds = await searchBoomplayAlbumIds(q);
      if (albumIds.length === 0) {
        log.debug("Boomplay", "Album search returned no IDs for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Boomplay", `Album search returned ${albumIds.length} IDs for: ${q}`);

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
        log.debug("Boomplay", `  "${album.title}" -> confidence=${confidence.toFixed(3)}`);
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
      log.debug("Boomplay", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
