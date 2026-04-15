import { RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "../../../lib/resolve/normalize";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  AlbumTrackEntry,
  ArtistCapabilities,
  ArtistMatchResult,
  ArtistSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../../types";
import { scoreSearchCandidate } from "../_shared/confidence.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

/**
 * SoundCloud Scrape Adapter
 *
 * Uses SoundCloud's internal API (api-v2.soundcloud.com) with a client_id
 * extracted from the public page. Falls back to HTML scraping if API fails.
 *
 * Supports: URL detection, track resolution, search
 * No auth needed - client_id is public and extracted on demand.
 */

const SOUNDCLOUD_TRACK_REGEX = /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([^/]+\/[^/?\s]+)(?:\?.*)?$/;
// SoundCloud album (set) URLs: soundcloud.com/{user}/sets/{slug}
const SOUNDCLOUD_ALBUM_REGEX = /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([^/]+\/sets\/[^/?\s]+)(?:\?.*)?$/;
// SoundCloud artist (user) URLs: soundcloud.com/{username} (single path segment only)
const SOUNDCLOUD_ARTIST_REGEX = /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([^/?\s]+)\/?(?:\?.*)?$/;

const SC_API_BASE = "https://api-v2.soundcloud.com";

// --- Client ID management ---

let cachedClientId: string | null = null;
let clientIdFetchedAt = 0;
let clientIdPromise: Promise<string | null> | null = null;
const CLIENT_ID_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getClientId(): Promise<string | null> {
  if (cachedClientId && Date.now() - clientIdFetchedAt < CLIENT_ID_TTL_MS) {
    return cachedClientId;
  }

  // Promise coalescing: prevent parallel requests from each fetching independently
  if (clientIdPromise) return clientIdPromise;
  clientIdPromise = fetchClientId().finally(() => {
    clientIdPromise = null;
  });
  return clientIdPromise;
}

async function fetchClientId(): Promise<string | null> {
  try {
    const response = await scFetch("https://soundcloud.com", 5000);
    if (!response.ok) return cachedClientId;

    const html = await response.text();
    const match = /window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/m.exec(html);
    if (!match) return cachedClientId;

    const hydration = JSON.parse(match[1]) as Array<{ hydratable: string; data: unknown }>;
    const apiClient = hydration.find((h) => h.hydratable === "apiClient");
    const id = (apiClient?.data as { id?: string })?.id;

    if (id) {
      cachedClientId = id;
      clientIdFetchedAt = Date.now();
      log.debug("SoundCloud", "Refreshed client_id");
    }

    return cachedClientId;
  } catch {
    log.debug("SoundCloud", "Failed to refresh client_id");
    return cachedClientId;
  }
}

// --- Fetch helpers ---

async function scFetch(url: string, timeoutMs = 5000): Promise<Response> {
  return fetchWithTimeout(url, { headers: { "User-Agent": SCRAPER_USER_AGENT } }, timeoutMs);
}

async function scApiFetch(endpoint: string): Promise<Response> {
  const clientId = await getClientId();
  if (!clientId) throw new Error("SoundCloud: No client_id available");

  const sep = endpoint.includes("?") ? "&" : "?";
  return scFetch(`${SC_API_BASE}${endpoint}${sep}client_id=${clientId}`);
}

// --- Track data mapping ---

interface ScPlaylistData {
  title?: string;
  user?: { username?: string; full_name?: string };
  artwork_url?: string;
  release_date?: string;
  created_at?: string;
  permalink_url?: string;
  set_type?: string; // "album" for proper albums
  track_count?: number;
  tracks?: Array<{
    title?: string;
    isrc?: string;
    publisher_metadata?: { isrc?: string };
    duration?: number;
    full_duration?: number;
    track_number?: number;
  }>;
}

interface ScUserData {
  id?: number;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  permalink_url?: string;
}

interface ScTrackData {
  title?: string;
  user?: { username?: string; full_name?: string };
  artwork_url?: string;
  full_duration?: number;
  duration?: number;
  release_date?: string;
  created_at?: string;
  permalink_url?: string;
  publisher_metadata?: {
    isrc?: string;
    explicit?: boolean;
  };
}

function mapApiTrack(data: ScTrackData, sourceId: string): NormalizedTrack {
  const pub = data.publisher_metadata;
  const artist = data.user?.username ?? data.user?.full_name;

  return {
    sourceService: "soundcloud",
    sourceId,
    isrc: pub?.isrc || undefined,
    title: data.title ?? "Unknown",
    artists: artist ? [artist] : ["Unknown Artist"],
    durationMs: data.full_duration ?? data.duration,
    releaseDate: data.release_date ?? data.created_at ?? undefined,
    isExplicit: typeof pub?.explicit === "boolean" ? pub.explicit : undefined,
    artworkUrl: data.artwork_url?.replace("-large", "-t500x500"),
    webUrl: data.permalink_url ?? `https://soundcloud.com/${sourceId}`,
  };
}

// --- HTML scraping fallback ---

function extractFromHtml(html: string): ScTrackData | null {
  // Try hydration JSON
  const hydrationMatch = /window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/m.exec(html);
  if (hydrationMatch) {
    try {
      const hydration = JSON.parse(hydrationMatch[1]) as Array<{ hydratable: string; data: ScTrackData }>;
      const soundEntry = hydration.find((h) => h.hydratable === "sound");
      if (soundEntry?.data) return soundEntry.data;
    } catch {
      log.debug("SoundCloud", "Failed to parse hydration JSON");
    }
  }

  // Fallback: OG tags
  const title = extractOgTag(html, "og:title");
  if (!title) return null;

  return {
    title,
    user: { username: extractMetaTag(html, "twitter:audio:artist_name") },
    artwork_url: extractOgTag(html, "og:image"),
    full_duration: parseDurationTag(extractMetaTag(html, "twitter:audio:duration")),
    permalink_url: extractOgTag(html, "og:url"),
  };
}

function extractOgTag(html: string, property: string): string | undefined {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  const altRe = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i");
  return re.exec(html)?.[1] ?? altRe.exec(html)?.[1];
}

function extractMetaTag(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const altRe = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i");
  return re.exec(html)?.[1] ?? altRe.exec(html)?.[1];
}

function parseDurationTag(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

// --- Album helpers ---

function mapApiPlaylist(data: ScPlaylistData, sourcePath: string): NormalizedAlbum {
  const artist = data.user?.username ?? data.user?.full_name ?? "Unknown Artist";
  const tracks: AlbumTrackEntry[] = [];
  const playlistTracks = data.tracks ?? [];
  for (let i = 0; i < playlistTracks.length; i++) {
    const t = playlistTracks[i];
    if (t?.title) {
      tracks.push({
        title: t.title,
        isrc: t.publisher_metadata?.isrc || undefined,
        trackNumber: t.track_number ?? i + 1,
        durationMs: t.full_duration ?? t.duration,
      });
    }
  }
  return {
    sourceService: "soundcloud",
    sourceId: sourcePath,
    title: data.title ?? "Unknown",
    artists: [artist],
    artworkUrl: data.artwork_url?.replace("-large", "-t500x500"),
    releaseDate: data.release_date ?? data.created_at ?? undefined,
    totalTracks: data.track_count ?? (tracks.length > 0 ? tracks.length : undefined),
    webUrl: data.permalink_url ?? `https://soundcloud.com/${sourcePath}`,
    tracks: tracks.length > 0 ? tracks : undefined,
  };
}

async function fetchAlbumByPath(setPath: string): Promise<NormalizedAlbum | null> {
  const pageUrl = `https://soundcloud.com/${setPath}`;
  try {
    const response = await scApiFetch(`/resolve?url=${encodeURIComponent(pageUrl)}`);
    if (!response.ok) return null;
    const data = (await response.json()) as ScPlaylistData;
    // Only return if it's an album (set_type: "album") or has no set_type (treat as album)
    if (!data.title) return null;
    return mapApiPlaylist(data, setPath);
  } catch {
    return null;
  }
}

async function searchSoundCloudAlbums(
  query: string,
): Promise<Array<{ path: string; title: string; artist: string; trackCount?: number }>> {
  try {
    const response = await scApiFetch(`/search/albums?q=${encodeURIComponent(query)}&limit=5`);
    if (!response.ok) return [];
    const result = (await response.json()) as { collection?: ScPlaylistData[] };
    return (result.collection ?? [])
      .filter((p) => p.title)
      .map((p) => ({
        path: p.permalink_url?.replace("https://soundcloud.com/", "") ?? "",
        title: p.title ?? "",
        artist: p.user?.username ?? p.user?.full_name ?? "",
        trackCount: p.track_count,
      }))
      .filter((r) => r.path);
  } catch {
    return [];
  }
}

// --- Adapter ---

export const soundcloudAdapter = {
  id: "soundcloud",
  displayName: "SoundCloud",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true;
  },

  detectUrl(url: string): string | null {
    const match = SOUNDCLOUD_TRACK_REGEX.exec(url);
    if (!match) return null;

    const path = match[1];
    if (path.includes("/sets/") || path.startsWith("sets/")) return null;

    return path;
  },

  async getTrack(trackPath: string): Promise<NormalizedTrack> {
    const pageUrl = `https://soundcloud.com/${trackPath}`;

    // Try internal API first (/resolve endpoint)
    try {
      const response = await scApiFetch(`/resolve?url=${encodeURIComponent(pageUrl)}`);
      if (response.ok) {
        const data = (await response.json()) as ScTrackData;
        if (data.title) {
          return mapApiTrack(data, trackPath);
        }
      }
    } catch (error) {
      log.debug(
        "SoundCloud",
        "API resolve failed, falling back to scraping:",
        error instanceof Error ? error.message : error,
      );
    }

    // Fallback: scrape the page
    const response = await scFetch(pageUrl);
    if (!response.ok) {
      throw new Error(`SoundCloud page fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const data = extractFromHtml(html);

    if (!data?.title) {
      throw new Error("SoundCloud: Could not extract track title from page");
    }

    return mapApiTrack(data, trackPath);
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    // SoundCloud has no ISRC lookup endpoint
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const response = await scApiFetch(`/search/tracks?q=${encodeURIComponent(q)}&limit=5`);

      if (!response.ok) {
        log.debug("SoundCloud", "Search API failed:", response.status);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const result = (await response.json()) as { collection?: ScTrackData[] };
      const items = result.collection ?? [];

      if (items.length === 0) {
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const track = mapApiTrack(item, item.permalink_url?.replace("https://soundcloud.com/", "") ?? `search-${i}`);
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
    } catch (error) {
      log.debug("SoundCloud", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  },

  detectAlbumUrl(url: string): string | null {
    const match = SOUNDCLOUD_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumByPath(albumId);
    if (!album) throw serviceNotFoundError(SERVICE.SOUNDCLOUD, RESOURCE_KIND.ALBUM, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const results = await searchSoundCloudAlbums(q);
      if (results.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const r of results) {
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], totalTracks: query.totalTracks, releaseDate: query.year },
          { title: r.title, artists: [r.artist], totalTracks: r.trackCount },
        );
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          // Lazy-fetch full album only if it's the best candidate
          if (bestConfidence > 0.4) {
            const full = await fetchAlbumByPath(r.path);
            if (full) bestMatch = full;
          }
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }
      return { found: true, album: bestMatch, confidence: bestConfidence, matchMethod: "search" };
    } catch (error) {
      log.debug("SoundCloud", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
  // --- Artist support ---

  artistCapabilities: {
    supportsArtistSearch: true,
  } satisfies ArtistCapabilities,

  detectArtistUrl(url: string): string | null {
    const match = SOUNDCLOUD_ARTIST_REGEX.exec(url);
    if (!match) return null;

    const username = match[1];
    // Exclude known non-artist paths
    const reserved = ["discover", "search", "stream", "you", "stations", "upload", "settings", "messages", "charts"];
    if (reserved.includes(username.toLowerCase())) return null;

    return username;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const pageUrl = `https://soundcloud.com/${artistId}`;

    const response = await scApiFetch(`/resolve?url=${encodeURIComponent(pageUrl)}`);
    if (!response.ok) {
      throw serviceHttpError(SERVICE.SOUNDCLOUD, response.status, RESOURCE_KIND.ARTIST, artistId);
    }

    const data = (await response.json()) as ScUserData;

    if (!data.username && !data.full_name) {
      throw new Error("SoundCloud: Could not resolve artist profile");
    }

    return {
      sourceService: "soundcloud",
      sourceId: artistId,
      name: data.full_name || data.username || artistId,
      imageUrl: data.avatar_url?.replace("-large", "-t500x500"),
      webUrl: data.permalink_url ?? pageUrl,
    };
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    try {
      const response = await scApiFetch(`/search/users?q=${encodeURIComponent(query.name)}&limit=5`);

      if (!response.ok) {
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const result = (await response.json()) as { collection?: ScUserData[] };
      const items = result.collection ?? [];

      if (items.length === 0) {
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      let bestArtist: NormalizedArtist | null = null;
      let bestConfidence = 0;

      for (const item of items) {
        const artistName = item.full_name || item.username || "";
        const confidence = calculateConfidence(
          { title: query.name, artists: [], durationMs: undefined },
          { title: artistName, artists: [], durationMs: undefined },
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          const username = item.permalink_url?.replace("https://soundcloud.com/", "") ?? String(item.id);
          bestArtist = {
            sourceService: "soundcloud",
            sourceId: username,
            name: artistName,
            imageUrl: item.avatar_url?.replace("-large", "-t500x500"),
            webUrl: item.permalink_url ?? `https://soundcloud.com/${username}`,
          };
        }
      }

      if (!bestArtist || bestConfidence < 0.6) {
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
    } catch (error) {
      log.debug("SoundCloud", "Artist search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;

// Export for testing
export function _resetClientIdCache(): void {
  cachedClientId = null;
  clientIdFetchedAt = 0;
}
