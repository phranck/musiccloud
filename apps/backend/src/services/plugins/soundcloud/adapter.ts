import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
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
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

/**
 * @file SoundCloud adapter: internal API with self-extracted client_id.
 *
 * Keyless (always available). SoundCloud's official developer API
 * has been closed to new registrations for years, but the web player
 * talks to a public `api-v2.soundcloud.com` endpoint using a
 * `client_id` that is minted server-side and embedded in the
 * homepage's hydration JSON. This adapter extracts that client_id
 * on first use and caches it for 24 hours.
 *
 * ## client_id lifecycle
 *
 * - First call: `fetchClientId` hits `soundcloud.com`, parses the
 *   `window.__sc_hydration` array for a `{ hydratable: "apiClient" }`
 *   entry, and pulls the `id` field.
 * - Cached for 24h. SoundCloud rotates these periodically; an
 *   expired id returns 401 on API calls, and `scApiFetch` then scrapes a
 *   fresh one and repeats the request once.
 * - Concurrent callers coalesce through `clientIdPromise` so a burst
 *   of resolves does not re-fetch the homepage N times.
 * - When no client_id can be had, because the homepage failed or its
 *   hydration data carries none, `scApiFetch` throws.
 *
 * ## A failure is not a miss
 *
 * A search without results answers 200 with an empty `collection`, and
 * an id SoundCloud does not have answers 404 on `/resolve`. Only those
 * two mean "nothing". An error status, a body that is not JSON or has no
 * `collection`, and a missing client_id all throw, because the resolver
 * skips a service for a month after a returned miss.
 *
 * ## URL shape: catch-all artist/track path
 *
 * SoundCloud URLs put the track slug as the second segment under
 * the uploader's handle: `soundcloud.com/{user}/{track-slug}`.
 * Albums ("sets" in SoundCloud's vocabulary) insert `/sets/` in the
 * middle. Artists are the handle alone. The three regexes are
 * mutually exclusive in matching order.
 *
 * ## ISRC exposed but no direct lookup
 *
 * SoundCloud tracks carry ISRC in `publisher_metadata.isrc`, but
 * the API has no ISRC-to-track endpoint. `capabilities.supportsIsrc`
 * is true from the perspective of "we extract it when present" but
 * `findByIsrc` returns null because we have no way to query by it.
 * The flag primarily helps other adapters decide whether to trust
 * a SoundCloud-sourced ISRC for their own ISRC lookups.
 *
 * ## Artwork upscale
 *
 * SoundCloud's `artwork_url` ships at 100x100 by default. Swapping
 * `-large` to `-t500x500` in the path yields the high-resolution
 * variant, which the share page needs.
 *
 * ## Hydration vs OG fallback
 *
 * `extractFromHtml` first tries the `__sc_hydration` JSON (richer,
 * includes ISRC and duration). Only if that parse fails does it fall
 * back to OG + Twitter meta tags. The fallback yields track/artist/
 * duration but no ISRC.
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
  const response = await scApiFetchWithClientId(endpoint);
  if (response.status !== 401) return response;

  // A 401 means SoundCloud rotated the scraped client_id. One fresh scrape
  // replaces it, rather than every request failing until the cached id ages out.
  cachedClientId = null;
  clientIdFetchedAt = 0;
  return scApiFetchWithClientId(endpoint);
}

/**
 * Sends one API request with the current client_id.
 *
 * @param endpoint - The API path, with or without a query.
 * @returns SoundCloud's response, whatever its status.
 * @throws When no client_id can be scraped from the homepage.
 */
async function scApiFetchWithClientId(endpoint: string): Promise<Response> {
  const clientId = await getClientId();
  if (!clientId) throw new UpstreamUnavailableError("soundcloud", "no client_id available from the homepage");

  const sep = endpoint.includes("?") ? "&" : "?";
  return scFetch(`${SC_API_BASE}${endpoint}${sep}client_id=${clientId}`);
}

/**
 * Parses an API response body.
 *
 * @param response - A response with an OK status.
 * @param what - What was asked for, which the error names.
 * @returns The parsed body.
 * @throws {UpstreamUnavailableError} When the body is not JSON.
 */
async function readJson(response: Response, what: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new UpstreamUnavailableError("soundcloud", `${what} answered with a body that is not JSON`, error);
  }
}

/**
 * Runs one of SoundCloud's searches.
 *
 * @param endpoint - What to search for.
 * @param query - The search text.
 * @param kind - What the search is for, which an error names.
 * @returns The `collection` of the answer. A search without results answers an
 *   empty list, so an empty list is an answer.
 * @throws When no client_id is available, the request fails, SoundCloud answers
 *   with an error status, or the body is not JSON or has no `collection` list,
 *   because each of those is a failure rather than an answer.
 */
async function scSearch<Item>(
  endpoint: "tracks" | "albums" | "users",
  query: string,
  kind: ResourceKind,
): Promise<Item[]> {
  const response = await scApiFetch(`/search/${endpoint}?q=${encodeURIComponent(query)}&limit=5`);
  if (!response.ok) throw serviceHttpError(Service.SoundCloud, response.status, kind, query, Operation.Search);

  const body = (await readJson(response, `${endpoint} search for "${query}"`)) as { collection?: unknown } | null;
  if (!body || !Array.isArray(body.collection)) {
    throw new UpstreamUnavailableError("soundcloud", `${endpoint} search for "${query}" answered without a collection`);
  }
  return body.collection as Item[];
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

/**
 * Reads a set from SoundCloud's `/resolve` endpoint.
 *
 * @param setPath - The path after `soundcloud.com/`, such as `user/sets/slug`.
 * @returns The album, or `null` when SoundCloud answers 404 for the path.
 * @throws When no client_id is available, SoundCloud answers with another error
 *   status, or the body is not JSON or has no title.
 */
async function fetchAlbumByPath(setPath: string): Promise<NormalizedAlbum | null> {
  const pageUrl = `https://soundcloud.com/${setPath}`;
  const response = await scApiFetch(`/resolve?url=${encodeURIComponent(pageUrl)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.SoundCloud, response.status, ResourceKind.Album, setPath);

  const data = (await readJson(response, `resolve of ${setPath}`)) as ScPlaylistData | null;
  // SoundCloud says "no such set" with 404, so a resolved set without a title is not that answer.
  if (!data?.title) throw new UpstreamUnavailableError("soundcloud", `resolve of ${setPath} answered without a title`);
  return mapApiPlaylist(data, setPath);
}

async function searchSoundCloudAlbums(
  query: string,
): Promise<Array<{ path: string; title: string; artist: string; releaseDate?: string; trackCount?: number }>> {
  const playlists = await scSearch<ScPlaylistData>("albums", query, ResourceKind.Album);
  return playlists
    .filter((playlist) => playlist.title)
    .map((playlist) => ({
      path: playlist.permalink_url?.replace("https://soundcloud.com/", "") ?? "",
      title: playlist.title ?? "",
      artist: playlist.user?.username ?? playlist.user?.full_name ?? "",
      // The same date the full album is read with, so the year the score
      // counts here is the one the chosen album reports.
      releaseDate: playlist.release_date ?? playlist.created_at ?? undefined,
      trackCount: playlist.track_count,
    }))
    .filter((candidate) => candidate.path);
}

// --- Adapter ---

export const soundcloudAdapter = {
  id: "soundcloud",
  displayName: getPlatformLabel("soundcloud"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
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
    const q = searchText(query);

    const items = await scSearch<ScTrackData>("tracks", q, ResourceKind.Track);
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
    if (!album) throw serviceNotFoundError(Service.SoundCloud, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;

    const results = await searchSoundCloudAlbums(q);
    if (results.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const candidate of results) {
      const confidence = scoreAlbumCandidate(query, {
        title: candidate.title,
        artists: [candidate.artist],
        releaseDate: candidate.releaseDate,
        totalTracks: candidate.trackCount,
      });
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        // Lazy-fetch full album only if it's the best candidate
        if (bestConfidence > 0.4) {
          const full = await fetchAlbumByPath(candidate.path);
          if (full) bestMatch = full;
        }
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }
    return { found: true, album: bestMatch, confidence: bestConfidence, matchMethod: "search" };
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
      throw serviceHttpError(Service.SoundCloud, response.status, ResourceKind.Artist, artistId);
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
    const items = await scSearch<ScUserData>("users", query.name, ResourceKind.Artist);
    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const artistName = item.full_name || item.username || "";
      const confidence = calculateArtistNameConfidence(query.name, artistName);

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
  },
} satisfies ServiceAdapter & Record<string, unknown>;

// Export for testing
export function _resetClientIdCache(): void {
  cachedClientId = null;
  clientIdFetchedAt = 0;
}
