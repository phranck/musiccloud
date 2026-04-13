import { RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../lib/infra/fetch";
import { log } from "../../lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "../../lib/resolve/normalize";
import { serviceNotFoundError } from "../../lib/resolve/service-errors";
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

// Beatport URLs: beatport.com/track/{slug}/{id}
const BEATPORT_TRACK_REGEX = /^https?:\/\/(?:www\.)?beatport\.com\/track\/[^/]+\/(\d+)/;
// Beatport release (album) URLs: beatport.com/release/{slug}/{id}
const BEATPORT_ALBUM_REGEX = /^https?:\/\/(?:www\.)?beatport\.com\/release\/[^/]+\/(\d+)/;

interface BeatportRelease {
  id: number;
  name: string;
  slug: string;
  artists?: Array<{ name: string; slug: string }>;
  label?: { name?: string };
  image?: { uri?: string };
  publish_date?: string;
  upc?: string;
  track_count?: number;
  catalog_number?: string;
}

interface BeatportTrack {
  id: number;
  name: string;
  mix_name?: string;
  slug: string;
  isrc?: string;
  length_ms?: number;
  length?: string; // "7:22"
  bpm?: number;
  key?: { name?: string };
  genre?: { name?: string };
  sub_genre?: { name?: string };
  artists?: Array<{ name: string; slug: string }>;
  release?: { name?: string; image?: { uri?: string } };
  label?: { name?: string };
  publish_date?: string;
  image?: { uri?: string };
  preview?: { mp3?: { url?: string } };
  exclusive?: boolean;
}

async function beatportFetch(url: string, timeoutMs = 10000): Promise<Response> {
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

function parseNextData(html: string): Record<string, unknown> | null {
  const match = /__NEXT_DATA__[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractTrackFromNextData(data: Record<string, unknown>): BeatportTrack | null {
  try {
    const props = data.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const dehydratedState = pageProps?.dehydratedState as Record<string, unknown> | undefined;
    const queries = dehydratedState?.queries as Array<Record<string, unknown>> | undefined;

    if (!queries) return null;

    for (const q of queries) {
      const state = q.state as Record<string, unknown> | undefined;
      const stateData = state?.data as Record<string, unknown> | undefined;

      // Direct track data
      if (stateData && "name" in stateData && "id" in stateData && "artists" in stateData) {
        return stateData as unknown as BeatportTrack;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractSearchResultsFromNextData(data: Record<string, unknown>): BeatportTrack[] {
  try {
    const props = data.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const dehydratedState = pageProps?.dehydratedState as Record<string, unknown> | undefined;
    const queries = dehydratedState?.queries as Array<Record<string, unknown>> | undefined;

    if (!queries) return [];

    for (const q of queries) {
      const state = q.state as Record<string, unknown> | undefined;
      const stateData = state?.data as Record<string, unknown> | undefined;

      // Search results
      if (stateData && "tracks" in stateData) {
        const tracks = stateData.tracks;
        if (Array.isArray(tracks)) return tracks as BeatportTrack[];
        // Beatport sometimes returns { count, data: [...] } instead of a direct array
        const nested = (tracks as Record<string, unknown>)?.data;
        if (Array.isArray(nested)) return nested as BeatportTrack[];
        return [];
      }

      // Alternative: results array
      if (stateData && Array.isArray(stateData)) {
        return stateData.filter((item: unknown) => {
          const record = item as Record<string, unknown>;
          return record && typeof record.name === "string" && typeof record.id === "number";
        }) as unknown as BeatportTrack[];
      }
    }

    return [];
  } catch {
    return [];
  }
}

function mapTrack(track: BeatportTrack): NormalizedTrack {
  const artists = track.artists?.map((a) => a.name).filter(Boolean) ?? ["Unknown Artist"];

  // Full track name: "Name (Mix Name)"
  const title = track.mix_name && track.mix_name !== "Original Mix" ? `${track.name} (${track.mix_name})` : track.name;

  const artworkUrl = track.image?.uri ?? track.release?.image?.uri;

  // Parse length string "7:22" to ms if length_ms not available
  let durationMs = track.length_ms;
  if (!durationMs && track.length) {
    const parts = track.length.split(":");
    if (parts.length === 2) {
      durationMs = (parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)) * 1000;
    }
  }

  return {
    sourceService: "beatport",
    sourceId: String(track.id),
    title,
    artists,
    albumName: track.release?.name,
    durationMs,
    isrc: track.isrc || undefined,
    artworkUrl,
    releaseDate: track.publish_date,
    webUrl: `https://www.beatport.com/track/${track.slug}/${track.id}`,
  };
}

async function fetchTrackById(trackId: string): Promise<NormalizedTrack | null> {
  // Fetch track page and extract from __NEXT_DATA__
  const url = `https://www.beatport.com/track/x/${trackId}`;
  const response = await beatportFetch(url);
  if (!response.ok) return null;

  const html = await response.text();

  // Try __NEXT_DATA__ first
  const nextData = parseNextData(html);
  if (nextData) {
    const track = extractTrackFromNextData(nextData);
    if (track) return mapTrack(track);
  }

  // Fallback to OG tags
  const ogTitle = /<meta\s+property="og:title"\s+content="([^"]*)"[^>]*>/i.exec(html)?.[1];
  const ogImage = /<meta\s+property="og:image"\s+content="([^"]*)"[^>]*>/i.exec(html)?.[1];

  if (ogTitle) {
    // OG title: "Artist - Track (Mix) [Label] | Beatport"
    const titleMatch = /^(.+?)\s*-\s*(.+?)(?:\s*\[.*\])?\s*\|?\s*(?:Music & Downloads on\s*)?Beatport$/i.exec(ogTitle);
    if (titleMatch) {
      return {
        sourceService: "beatport",
        sourceId: trackId,
        title: titleMatch[2].trim(),
        artists: [titleMatch[1].trim()],
        artworkUrl: ogImage || undefined,
        webUrl: `https://www.beatport.com/track/x/${trackId}`,
      };
    }
  }

  return null;
}

function extractReleaseFromNextData(data: Record<string, unknown>): BeatportRelease | null {
  try {
    const props = data.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const dehydratedState = pageProps?.dehydratedState as Record<string, unknown> | undefined;
    const queries = dehydratedState?.queries as Array<Record<string, unknown>> | undefined;
    if (!queries) return null;

    for (const q of queries) {
      const state = q.state as Record<string, unknown> | undefined;
      const stateData = state?.data as Record<string, unknown> | undefined;
      if (stateData && "name" in stateData && "id" in stateData && !("artists" in stateData)) {
        // Release data (no "artists" at top level, but has "artists" nested differently)
        if ("publish_date" in stateData || "upc" in stateData || "track_count" in stateData) {
          return stateData as unknown as BeatportRelease;
        }
      }
      // Also check if the data has a "release" field (track detail page)
      if (stateData && "release" in stateData) {
        return (stateData as Record<string, unknown>).release as BeatportRelease;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function extractReleaseSearchFromNextData(data: Record<string, unknown>): BeatportRelease[] {
  try {
    const props = data.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const dehydratedState = pageProps?.dehydratedState as Record<string, unknown> | undefined;
    const queries = dehydratedState?.queries as Array<Record<string, unknown>> | undefined;
    if (!queries) return [];

    for (const q of queries) {
      const state = q.state as Record<string, unknown> | undefined;
      const stateData = state?.data as Record<string, unknown> | undefined;
      if (stateData && "releases" in stateData) {
        const releases = stateData.releases;
        if (Array.isArray(releases)) return releases as BeatportRelease[];
        const nested = (releases as Record<string, unknown>)?.data;
        if (Array.isArray(nested)) return nested as BeatportRelease[];
      }
    }
    return [];
  } catch {
    return [];
  }
}

function mapRelease(release: BeatportRelease): NormalizedAlbum {
  const artists = release.artists?.map((a) => a.name).filter(Boolean) ?? ["Unknown Artist"];
  return {
    sourceService: "beatport",
    sourceId: String(release.id),
    upc: release.upc,
    title: release.name,
    artists,
    label: release.label?.name,
    artworkUrl: release.image?.uri,
    releaseDate: release.publish_date,
    totalTracks: release.track_count,
    webUrl: `https://www.beatport.com/release/${release.slug}/${release.id}`,
  };
}

async function fetchReleaseById(releaseId: string): Promise<NormalizedAlbum | null> {
  const url = `https://www.beatport.com/release/x/${releaseId}`;
  const response = await beatportFetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const nextData = parseNextData(html);
  if (!nextData) return null;

  const release = extractReleaseFromNextData(nextData);
  if (!release?.name) return null;
  return mapRelease(release);
}

export const beatportAdapter: ServiceAdapter = {
  id: "beatport",
  displayName: "Beatport",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed (SSR scraping)
  },

  detectUrl(url: string): string | null {
    const match = BEATPORT_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(SERVICE.BEATPORT, RESOURCE_KIND.TRACK, trackId);
    }
    return track;
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    try {
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(isrc)}`;
      const response = await beatportFetch(searchUrl);
      if (!response.ok) return null;

      const html = await response.text();
      const nextData = parseNextData(html);
      if (!nextData) return null;

      const tracks = extractSearchResultsFromNextData(nextData);
      const match = tracks.find((t) => t.isrc === isrc);
      if (!match) return null;

      return mapTrack(match);
    } catch (error) {
      log.debug("Beatport", "findByIsrc failed:", error instanceof Error ? error.message : error);
      return null;
    }
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(q)}`;
      const response = await beatportFetch(searchUrl);
      if (!response.ok) {
        log.debug("Beatport", "Search page failed:", response.status);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const html = await response.text();
      const nextData = parseNextData(html);

      if (!nextData) {
        log.debug("Beatport", "No __NEXT_DATA__ found in search page");
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const tracks = extractSearchResultsFromNextData(nextData);
      if (tracks.length === 0) {
        log.debug("Beatport", "Search returned no tracks for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Beatport", `Search returned ${tracks.length} tracks for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < Math.min(tracks.length, 5); i++) {
        const bpTrack = tracks[i];
        if (!bpTrack.id || !bpTrack.name) continue;

        const track = mapTrack(bpTrack);
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
          "Beatport",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("Beatport", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("Beatport", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  albumCapabilities: {
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = BEATPORT_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchReleaseById(albumId);
    if (!album) throw serviceNotFoundError(SERVICE.BEATPORT, RESOURCE_KIND.ALBUM, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const searchUrl = `https://www.beatport.com/search/releases?q=${encodeURIComponent(q)}`;
      const response = await beatportFetch(searchUrl);
      if (!response.ok) return { found: false, confidence: 0, matchMethod: "search" };

      const html = await response.text();
      const nextData = parseNextData(html);
      if (!nextData) return { found: false, confidence: 0, matchMethod: "search" };

      const releases = extractReleaseSearchFromNextData(nextData);
      if (releases.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const release of releases.slice(0, 5)) {
        if (!release.id || !release.name) continue;
        const album = mapRelease(release);
        const confidence = calculateAlbumConfidence(
          {
            title: query.title,
            artists: [query.artist],
            totalTracks: query.totalTracks,
            releaseDate: query.year,
            upc: undefined,
          },
          {
            title: album.title,
            artists: album.artists,
            totalTracks: album.totalTracks,
            releaseDate: album.releaseDate,
            upc: album.upc,
          },
        );
        log.debug("Beatport", `  "${release.name}" -> confidence=${confidence.toFixed(3)}`);
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
      log.debug("Beatport", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
