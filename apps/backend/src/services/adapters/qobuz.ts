import { fetchWithTimeout } from "../../lib/infra/fetch";
import { log } from "../../lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "../../lib/resolve/normalize";
import { MATCH_MIN_CONFIDENCE } from "../constants.js";
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
} from "../types";

/**
 * Qobuz Adapter
 *
 * Uses the Qobuz REST API (www.qobuz.com/api.json/0.2/) with an app_id
 * extracted from the Qobuz web player's JavaScript bundle plus user
 * authentication via QOBUZ_EMAIL/QOBUZ_PASSWORD to bypass geo-restrictions.
 *
 * Supports: URL detection, track resolution, search, ISRC lookup, album support
 */

// URL formats:
//   https://open.qobuz.com/track/59954869
//   https://play.qobuz.com/track/59954869
const QOBUZ_TRACK_REGEX = /^https?:\/\/(?:open|play)\.qobuz\.com\/track\/(\d+)(?:\?.*)?$/;
// Album URL formats:
//   https://open.qobuz.com/album/0060253780968
//   https://play.qobuz.com/album/0060253780968
const QOBUZ_ALBUM_REGEX = /^https?:\/\/(?:open|play)\.qobuz\.com\/album\/([a-zA-Z0-9]+)(?:\?.*)?$/;
// Artist URL formats:
//   https://open.qobuz.com/artist/36819
//   https://play.qobuz.com/artist/36819
const QOBUZ_ARTIST_REGEX = /^https?:\/\/(?:open|play)\.qobuz\.com\/artist\/(\d+)(?:\?.*)?$/;

const API_BASE = "https://www.qobuz.com/api.json/0.2";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// --- App ID management ---

const ENV_APP_ID = process.env.QOBUZ_APP_ID ?? null;
if (ENV_APP_ID) log.debug("Qobuz", "Using QOBUZ_APP_ID from environment");
let cachedAppId: string | null = ENV_APP_ID;
let appIdFetchedAt = ENV_APP_ID ? Date.now() : 0;
let appIdPromise: Promise<string | null> | null = null;
const APP_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (app_id changes rarely)

async function getAppId(): Promise<string | null> {
  if (cachedAppId && Date.now() - appIdFetchedAt < APP_ID_TTL_MS) {
    return cachedAppId;
  }

  // Promise coalescing: prevent parallel requests from each fetching independently
  if (appIdPromise) return appIdPromise;
  appIdPromise = fetchAppId().finally(() => {
    appIdPromise = null;
  });
  return appIdPromise;
}

async function fetchAppId(): Promise<string | null> {
  try {
    // Step 1: Fetch play.qobuz.com login page to find bundle script URLs
    const pageResponse = await qobuzFetch("https://play.qobuz.com/login", 8000);
    if (!pageResponse.ok) {
      log.debug("Qobuz", "Failed to fetch login page:", pageResponse.status);
      return cachedAppId;
    }

    const html = await pageResponse.text();

    // Find all JS bundle URLs (typically /resources/xxx.xxx.bundle.js)
    const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']*bundle[^"']*\.js)["']/gi);
    const scriptUrls: string[] = [];
    for (const m of scriptMatches) {
      const src = m[1];
      scriptUrls.push(src.startsWith("http") ? src : `https://play.qobuz.com${src}`);
    }

    if (scriptUrls.length === 0) {
      log.debug("Qobuz", "No bundle scripts found on login page");
      return cachedAppId;
    }

    // Step 2: Fetch each bundle and look for appId pattern
    for (const scriptUrl of scriptUrls) {
      try {
        const jsResponse = await qobuzFetch(scriptUrl, 10000);
        if (!jsResponse.ok) continue;

        const js = await jsResponse.text();

        // Bundle uses camelCase: appId:"377257687" (inside config object)
        const appIdMatch = /appId:"(\d{9,10})"/.exec(js);
        if (appIdMatch?.[1]) {
          cachedAppId = appIdMatch[1];
          appIdFetchedAt = Date.now();
          log.debug("Qobuz", "Extracted app_id from bundle");
          return cachedAppId;
        }
      } catch {}
    }

    log.error("Qobuz", "app_id not found in any bundle - adapter will be unavailable");
    return cachedAppId;
  } catch {
    log.debug("Qobuz", "Failed to extract app_id");
    return cachedAppId;
  }
}

// --- User auth token management ---

let cachedAuthToken: string | null = null;
let authTokenFetchedAt = 0;
let authTokenPromise: Promise<string | null> | null = null;
const AUTH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface QobuzLoginResponse {
  user_auth_token?: string;
}

async function getAuthToken(): Promise<string | null> {
  if (cachedAuthToken && Date.now() - authTokenFetchedAt < AUTH_TOKEN_TTL_MS) {
    return cachedAuthToken;
  }

  if (authTokenPromise) return authTokenPromise;
  authTokenPromise = fetchAuthToken().finally(() => {
    authTokenPromise = null;
  });
  return authTokenPromise;
}

async function fetchAuthToken(): Promise<string | null> {
  const email = process.env.QOBUZ_EMAIL;
  const password = process.env.QOBUZ_PASSWORD;
  if (!email || !password) return null;

  const appId = await getAppId();
  if (!appId) return null;

  try {
    const response = await fetchWithTimeout(
      `${API_BASE}/user/login`,
      {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "X-App-Id": appId,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      },
      10000,
    );

    if (!response.ok) {
      log.error("Qobuz", "Login failed:", response.status);
      return cachedAuthToken;
    }

    const data = (await response.json()) as QobuzLoginResponse;
    if (data.user_auth_token) {
      cachedAuthToken = data.user_auth_token;
      authTokenFetchedAt = Date.now();
      log.debug("Qobuz", "User authenticated successfully");
      return cachedAuthToken;
    }

    log.error("Qobuz", "Login response missing user_auth_token");
    return cachedAuthToken;
  } catch (err) {
    log.error("Qobuz", "Login error:", err instanceof Error ? err.message : "Unknown");
    return cachedAuthToken;
  }
}

// --- Fetch helpers ---

async function qobuzFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } }, timeoutMs);
}

async function qobuzApiFetch(endpoint: string): Promise<Response> {
  const appId = await getAppId();
  if (!appId) throw new Error("Qobuz: No app_id available");

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "X-App-Id": appId,
  };

  // Add auth token if available (required for geo-restricted regions)
  const authToken = await getAuthToken();
  if (authToken) {
    headers["X-User-Auth-Token"] = authToken;
  }

  const response = await fetchWithTimeout(`${API_BASE}${endpoint}`, { headers }, 8000);

  // On 401, invalidate token and retry once with fresh login
  if (response.status === 401 && authToken) {
    log.debug("Qobuz", "Got 401, refreshing auth token");
    cachedAuthToken = null;
    authTokenFetchedAt = 0;

    const newToken = await getAuthToken();
    if (newToken && newToken !== authToken) {
      headers["X-User-Auth-Token"] = newToken;
      return fetchWithTimeout(`${API_BASE}${endpoint}`, { headers }, 8000);
    }
  }

  return response;
}

// --- Response types ---

interface QobuzTrack {
  id?: number;
  title?: string;
  duration?: number; // seconds
  isrc?: string;
  performer?: { id?: number; name?: string };
  album?: {
    title?: string;
    image?: {
      small?: string;
      thumbnail?: string;
      large?: string;
    };
    released_at?: number; // unix timestamp
  };
  parental_warning?: boolean;
}

interface QobuzSearchResponse {
  tracks?: {
    items?: QobuzTrack[];
    total?: number;
  };
}

interface QobuzAlbumTrack {
  id?: number;
  title?: string;
  isrc?: string;
  track_number?: number;
  duration?: number; // seconds
}

interface QobuzAlbum {
  id?: string;
  title?: string;
  upc?: string;
  released_at?: number; // unix timestamp
  tracks_count?: number;
  image?: { small?: string; thumbnail?: string; large?: string };
  label?: { name?: string };
  artist?: { name?: string };
  tracks?: { items?: QobuzAlbumTrack[] };
}

interface QobuzAlbumSearchResponse {
  albums?: {
    items?: QobuzAlbum[];
    total?: number;
  };
}

interface QobuzArtist {
  id?: number;
  name?: string;
  image?: { small?: string; medium?: string; large?: string };
}

interface QobuzArtistSearchResponse {
  artists?: {
    items?: QobuzArtist[];
    total?: number;
  };
}

function mapAlbum(data: QobuzAlbum): NormalizedAlbum {
  const albumId = data.id ?? "";
  const artists = data.artist?.name ? [data.artist.name] : ["Unknown Artist"];

  let releaseDate: string | undefined;
  if (data.released_at) {
    releaseDate = new Date(data.released_at * 1000).toISOString().slice(0, 10);
  }

  return {
    sourceService: "qobuz",
    sourceId: albumId,
    upc: data.upc,
    title: data.title ?? "Unknown",
    artists,
    releaseDate,
    totalTracks: data.tracks_count,
    artworkUrl: data.image?.large ?? data.image?.thumbnail,
    label: data.label?.name,
    webUrl: `https://open.qobuz.com/album/${albumId}`,
    tracks: data.tracks?.items
      ?.filter((t): t is QobuzAlbumTrack & { title: string } => Boolean(t.title))
      .map((t) => ({
        title: t.title,
        trackNumber: t.track_number ?? 0,
        durationMs: t.duration ? t.duration * 1000 : undefined,
        isrc: t.isrc,
      })),
  };
}

// --- Track data mapping ---

function mapTrack(data: QobuzTrack): NormalizedTrack {
  const trackId = String(data.id ?? "");
  const artists = data.performer?.name ? [data.performer.name] : ["Unknown Artist"];

  let releaseDate: string | undefined;
  if (data.album?.released_at) {
    const d = new Date(data.album.released_at * 1000);
    releaseDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  return {
    sourceService: "qobuz",
    sourceId: trackId,
    isrc: data.isrc || undefined,
    title: data.title ?? "Unknown",
    artists,
    albumName: data.album?.title,
    durationMs: data.duration ? data.duration * 1000 : undefined, // API returns seconds
    releaseDate,
    isExplicit: data.parental_warning === true ? true : undefined,
    artworkUrl: data.album?.image?.large ?? data.album?.image?.thumbnail,
    webUrl: `https://open.qobuz.com/track/${trackId}`,
  };
}

// Eagerly fetch app_id and auth token on import
getAppId()
  .then(() => getAuthToken())
  .catch(() => {});

// --- Adapter ---

export const qobuzAdapter = {
  id: "qobuz",
  displayName: "Qobuz",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    // Always report as available - getAppId() handles lazy fetching.
    // Returning false would prevent URL detection and cross-service matching.
    return true;
  },

  detectUrl(url: string): string | null {
    const match = QOBUZ_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await qobuzApiFetch(`/track/get?track_id=${trackId}`);

    if (!response.ok) {
      throw new Error(`Qobuz track/get failed: ${response.status}`);
    }

    const data = (await response.json()) as QobuzTrack;
    if (!data.title) {
      throw new Error("Qobuz: No track data in response");
    }

    return mapTrack(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    try {
      const response = await qobuzApiFetch(`/track/search?query=${encodeURIComponent(isrc)}&limit=3`);
      if (!response.ok) return null;

      const result = (await response.json()) as QobuzSearchResponse;
      const items = result.tracks?.items ?? [];

      const match = items.find((t) => t.isrc === isrc);
      if (!match?.title) return null;

      return mapTrack(match);
    } catch {
      return null;
    }
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const response = await qobuzApiFetch(`/track/search?query=${encodeURIComponent(q)}&limit=5`);

      if (!response.ok) {
        log.debug("Qobuz", "Search API failed:", response.status);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const result = (await response.json()) as QobuzSearchResponse;
      const items = result.tracks?.items ?? [];

      if (items.length === 0) {
        log.debug("Qobuz", "Search returned no tracks for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Qobuz", `Search returned ${items.length} tracks for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.title) continue;

        const track = mapTrack(item);
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
          "Qobuz",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("Qobuz", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("Qobuz", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
  // --- Album support ---

  albumCapabilities: {
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  } satisfies AlbumCapabilities,

  detectAlbumUrl(url: string): string | null {
    const match = QOBUZ_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const response = await qobuzApiFetch(`/album/get?album_id=${encodeURIComponent(albumId)}&extra=tracks`);

    if (!response.ok) {
      throw new Error(`Qobuz getAlbum failed: ${response.status}`);
    }

    const data = (await response.json()) as QobuzAlbum;
    if (!data.title) {
      throw new Error("Qobuz: No album data in response");
    }

    return mapAlbum(data);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    // Qobuz accepts UPC as album_id in the album/get endpoint
    try {
      const response = await qobuzApiFetch(`/album/get?album_id=${encodeURIComponent(upc)}`);

      if (!response.ok) {
        log.debug("Qobuz", "UPC album lookup failed:", response.status);
        return null;
      }

      const data = (await response.json()) as QobuzAlbum;
      if (!data.title) return null;

      return mapAlbum(data);
    } catch {
      return null;
    }
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;

    try {
      const response = await qobuzApiFetch(`/album/search?query=${encodeURIComponent(q)}&limit=5`);

      if (!response.ok) {
        log.debug("Qobuz", "Album search failed:", response.status);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const result = (await response.json()) as QobuzAlbumSearchResponse;
      const items = result.albums?.items ?? [];

      if (items.length === 0) {
        log.debug("Qobuz", "Album search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      let bestAlbum: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const item of items) {
        if (!item.title) continue;
        const album = mapAlbum(item);
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], totalTracks: query.totalTracks },
          {
            title: album.title,
            artists: album.artists,
            releaseDate: album.releaseDate,
            totalTracks: album.totalTracks,
          },
        );

        log.debug("Qobuz", `  Album "${album.title}" by ${album.artists.join(", ")} -> ${confidence.toFixed(3)}`);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestAlbum = album;
        }
      }

      if (!bestAlbum || bestConfidence < MATCH_MIN_CONFIDENCE) {
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return { found: true, album: bestAlbum, confidence: bestConfidence, matchMethod: "search" };
    } catch (error) {
      log.debug("Qobuz", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  // --- Artist support ---

  artistCapabilities: {
    supportsArtistSearch: true,
  } satisfies ArtistCapabilities,

  detectArtistUrl(url: string): string | null {
    const match = QOBUZ_ARTIST_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const response = await qobuzApiFetch(`/artist/get?artist_id=${encodeURIComponent(artistId)}`);

    if (!response.ok) {
      throw new Error(`Qobuz getArtist failed: ${response.status}`);
    }

    const data = (await response.json()) as QobuzArtist;
    if (!data.name) {
      throw new Error("Qobuz: No artist data in response");
    }

    const id = String(data.id ?? artistId);
    return {
      sourceService: "qobuz",
      sourceId: id,
      name: data.name,
      imageUrl: data.image?.large ?? data.image?.medium ?? data.image?.small,
      webUrl: `https://open.qobuz.com/artist/${id}`,
    };
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    try {
      const response = await qobuzApiFetch(`/artist/search?query=${encodeURIComponent(query.name)}&limit=5`);

      if (!response.ok) {
        log.debug("Qobuz", "Artist search failed:", response.status);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const result = (await response.json()) as QobuzArtistSearchResponse;
      const items = result.artists?.items ?? [];

      if (items.length === 0) {
        log.debug("Qobuz", "Artist search returned no results for:", query.name);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      let bestArtist: NormalizedArtist | null = null;
      let bestConfidence = 0;

      for (const item of items) {
        if (!item.name) continue;

        const confidence = calculateConfidence(
          { title: query.name, artists: [], durationMs: undefined },
          { title: item.name, artists: [], durationMs: undefined },
        );

        const id = String(item.id ?? "");
        log.debug("Qobuz", `  Artist "${item.name}" -> confidence=${confidence.toFixed(3)}`);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestArtist = {
            sourceService: "qobuz",
            sourceId: id,
            name: item.name,
            imageUrl: item.image?.large ?? item.image?.medium ?? item.image?.small,
            webUrl: `https://open.qobuz.com/artist/${id}`,
          };
        }
      }

      if (!bestArtist || bestConfidence < 0.6) {
        log.debug("Qobuz", `Best artist confidence ${bestConfidence.toFixed(3)} below threshold 0.6`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
    } catch (error) {
      log.debug("Qobuz", "Artist search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;

// Export for testing
export function _resetAppIdCache(): void {
  cachedAppId = null;
  appIdFetchedAt = 0;
}

export function _setAppIdForTest(appId: string): void {
  cachedAppId = appId;
  appIdFetchedAt = Date.now();
}

export function _resetAuthTokenCache(): void {
  cachedAuthToken = null;
  authTokenFetchedAt = 0;
}
