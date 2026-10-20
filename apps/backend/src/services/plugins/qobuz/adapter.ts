import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
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
} from "../../types";
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

/**
 * @file Qobuz adapter: track + album + artist resolves against the Qobuz API.
 *
 * The manifest requires no account. Optional QOBUZ_EMAIL/QOBUZ_PASSWORD enable
 * account authentication; QOBUZ_APP_ID overrides the app identifier selected by
 * getAppId. These settings do not prove regional access or working credentials.
 * Public metadata controls establish only the observed request/account profile.
 *
 * Authentication belongs to explicit metadata requests, not module imports.
 * qobuzApiFetch calls getAuthToken, which coalesces concurrent login attempts.
 * AUTH_TOKEN_TTL_MS owns the local token-cache lifetime; it is not a promise
 * about the provider's token validity or the recording miss cache. If any API call returns 401 with a
 * cached token, the cache is cleared and a fresh login
 * is attempted once; that single retry covers cases where Qobuz
 * invalidated the token early (on password change, server cycle,
 * etc.). Login request coalescing via `authTokenPromise` ensures a
 * burst of resolves does not re-login N times on cache miss. A login that
 * fails keeps the token it had, or none. A request refused for want of a
 * token answers 401 and throws, so it never becomes a stored miss.
 *
 * ## Failure is not "not found"
 *
 * Lookups and searches return `null` or `{ found: false }` only when Qobuz
 * answered and has no match: a search without hits answers 200 with an empty
 * `items` list, and an unknown album id or UPC answers 404. An error status,
 * a timeout, a body that is not JSON and a search answer without its list
 * all throw. The resolver stores a returned miss and skips Qobuz for that
 * track for a month, so a failure reported as "not found" hides the link long
 * after Qobuz is back.
 *
 * ## Available regardless of config
 *
 * Registry availability is a configuration gate because the manifest requires
 * no variable. HTTP responses still decide request availability. The registry
 * asks every plugin detector when classifying inactive links, independently of
 * enabled state, so a disabled Qobuz URL remains recognizable.
 *
 * ## Full capability surface
 *
 * Track, album (with UPC + track listing), and artist resolves are
 * all supported. ISRC lookup works via the search endpoint with
 * exact-match filter. This makes Qobuz one of the richer sources
 * for cross-service resolves despite its niche catalog.
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

// --- App ID management ---

// Existing consumer app identifier. Configuration can override it; a chosen
// identifier does not guarantee API access or a successful account login.
const DEFAULT_APP_ID = "425621600";
let cachedAppId: string = process.env.QOBUZ_APP_ID || DEFAULT_APP_ID;
if (process.env.QOBUZ_APP_ID) log.debug("Qobuz", "Using QOBUZ_APP_ID from environment");

function getAppId(): string {
  return cachedAppId;
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

  const appId = getAppId();

  // A failed login keeps the token it had, or none. The catalog answers
  // without a token too, and a request that then fails throws on its own
  // status, so a refused login costs the token and never a stored miss.
  try {
    const response = await fetchWithTimeout(
      `${API_BASE}/user/login`,
      {
        method: "POST",
        headers: {
          "User-Agent": SCRAPER_USER_AGENT,
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

    const data = await readJson<QobuzLoginResponse>(response, "login");
    if (data.user_auth_token) {
      cachedAuthToken = data.user_auth_token;
      authTokenFetchedAt = Date.now();
      log.debug("Qobuz", "User authenticated successfully");
      return cachedAuthToken;
    }

    log.error("Qobuz", "Login response missing user_auth_token");
    return cachedAuthToken;
  } catch (error) {
    log.error("Qobuz", "Login error:", error instanceof Error ? error.message : "Unknown");
    return cachedAuthToken;
  }
}

// --- Fetch helpers ---

async function qobuzApiFetch(endpoint: string): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": SCRAPER_USER_AGENT,
    "X-App-Id": getAppId(),
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

/**
 * Reads the JSON object Qobuz answered with.
 *
 * @param response - An answer that already passed the status check.
 * @param what - What the request was for, which the error names.
 * @returns The parsed body.
 * @throws {UpstreamUnavailableError} When the body is not JSON or not an
 *   object, because an answer Qobuz did not give cannot be a "not found".
 */
async function readJson<T extends object>(response: Response, what: string): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new UpstreamUnavailableError("qobuz", `${what} answered a body that is not JSON`, error);
  }
  if (typeof body !== "object" || body === null) {
    throw new UpstreamUnavailableError("qobuz", `${what} answered JSON that is not an object`);
  }
  return body as T;
}

/**
 * Reads the list of hits out of a search answer.
 *
 * @param response - An answer that already passed the status check.
 * @param key - The list the endpoint answers under, one per search endpoint.
 * @param what - What the search was for, which the error names.
 * @returns The hits, an empty array when Qobuz found nothing.
 * @throws {UpstreamUnavailableError} When the body is unreadable or has no
 *   `items` list under `key`. Qobuz answers a search without hits with an
 *   empty list, so a body without one is not an answer.
 */
async function readSearchItems<T>(response: Response, key: SearchListKey, what: string): Promise<T[]> {
  const body = await readJson<Partial<Record<SearchListKey, QobuzSearchList<T>>>>(response, what);
  const items = body[key]?.items;
  if (!Array.isArray(items)) {
    throw new UpstreamUnavailableError("qobuz", `${what} answered without a ${key} list`);
  }
  return items;
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

/** The key each search endpoint answers its hits under. */
type SearchListKey = "tracks" | "albums" | "artists";

interface QobuzSearchList<T> {
  items?: T[];
  total?: number;
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

interface QobuzArtist {
  id?: number;
  name?: string;
  image?: { small?: string; medium?: string; large?: string };
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

// --- Adapter ---

export const qobuzAdapter = {
  id: "qobuz",
  displayName: getPlatformLabel("qobuz"),
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = QOBUZ_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await qobuzApiFetch(`/track/get?track_id=${trackId}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Qobuz, response.status, ResourceKind.Track, trackId);
    }

    const data = await readJson<QobuzTrack>(response, `track ${trackId}`);
    if (!data.title) {
      throw serviceNotFoundError(Service.Qobuz, ResourceKind.Track, trackId);
    }

    return mapTrack(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await qobuzApiFetch(`/track/search?query=${encodeURIComponent(isrc)}&limit=3`);
    if (!response.ok) {
      throw serviceHttpError(Service.Qobuz, response.status, ResourceKind.Track, isrc, Operation.IsrcLookup);
    }

    const items = await readSearchItems<QobuzTrack>(response, "tracks", `ISRC lookup for ${isrc}`);

    const match = items.find((candidate) => candidate.isrc === isrc);
    if (!match?.title) return null;

    return mapTrack(match);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const response = await qobuzApiFetch(`/track/search?query=${encodeURIComponent(q)}&limit=5`);
    if (!response.ok) {
      throw serviceHttpError(Service.Qobuz, response.status, ResourceKind.Track, q, Operation.Search);
    }

    const items = await readSearchItems<QobuzTrack>(response, "tracks", `track search for "${q}"`);

    if (items.length === 0) {
      log.debug("Qobuz", "Search returned no tracks for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Qobuz", `Search returned ${items.length} tracks for: ${q}`);

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.title) continue;

      const track = mapTrack(item);
      const confidence = scoreSearchCandidate(query, track, i);

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
    // Tracks are included in the response by default; the `extra=tracks` parameter
    // is rejected by the Chromecast app_id (Invalid argument: extra).
    const response = await qobuzApiFetch(`/album/get?album_id=${encodeURIComponent(albumId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Qobuz, response.status, ResourceKind.Album, albumId);
    }

    const data = await readJson<QobuzAlbum>(response, `album ${albumId}`);
    if (!data.title) {
      throw serviceNotFoundError(Service.Qobuz, ResourceKind.Album, albumId);
    }

    return mapAlbum(data);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    // Qobuz accepts UPC as album_id in the album/get endpoint
    const response = await qobuzApiFetch(`/album/get?album_id=${encodeURIComponent(upc)}`);

    // An id Qobuz does not know answers 404 with a JSON error body, which is
    // the service saying it has no such album. Any other error status is a failure.
    if (response.status === 404) return null;
    if (!response.ok) {
      throw serviceHttpError(Service.Qobuz, response.status, ResourceKind.Album, upc, Operation.UpcLookup);
    }

    const data = await readJson<QobuzAlbum>(response, `UPC lookup for ${upc}`);
    if (!data.title) {
      throw new UpstreamUnavailableError("qobuz", `UPC lookup for ${upc} answered an album without a title`);
    }

    return mapAlbum(data);
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;

    const response = await qobuzApiFetch(`/album/search?query=${encodeURIComponent(q)}&limit=5`);
    if (!response.ok) {
      throw serviceHttpError(Service.Qobuz, response.status, ResourceKind.Album, q, Operation.Search);
    }

    const items = await readSearchItems<QobuzAlbum>(response, "albums", `album search for "${q}"`);

    if (items.length === 0) {
      log.debug("Qobuz", "Album search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestAlbum: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      if (!item.title) continue;
      const album = mapAlbum(item);
      const confidence = scoreAlbumCandidate(query, album);

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
      throw serviceHttpError(Service.Qobuz, response.status, ResourceKind.Artist, artistId);
    }

    const data = await readJson<QobuzArtist>(response, `artist ${artistId}`);
    if (!data.name) {
      throw serviceNotFoundError(Service.Qobuz, ResourceKind.Artist, artistId);
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
    const response = await qobuzApiFetch(`/artist/search?query=${encodeURIComponent(query.name)}&limit=5`);
    if (!response.ok) {
      throw serviceHttpError(Service.Qobuz, response.status, ResourceKind.Artist, query.name, Operation.Search);
    }

    const items = await readSearchItems<QobuzArtist>(response, "artists", `artist search for "${query.name}"`);

    if (items.length === 0) {
      log.debug("Qobuz", "Artist search returned no results for:", query.name);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      if (!item.name) continue;

      const confidence = calculateArtistNameConfidence(query.name, item.name);

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
  },
} satisfies ServiceAdapter & Record<string, unknown>;

// Export for testing
export function _resetAppIdCache(): void {
  cachedAppId = process.env.QOBUZ_APP_ID || DEFAULT_APP_ID;
}

export function _setAppIdForTest(appId: string): void {
  cachedAppId = appId;
}

export function _resetAuthTokenCache(): void {
  cachedAuthToken = null;
  authTokenFetchedAt = 0;
}
