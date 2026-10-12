/**
 * @file KKBOX (Taiwan / Japan / SE Asia) adapter: full-featured API client.
 *
 * Credentialed: requires `KKBOX_CLIENT_ID` and `KKBOX_CLIENT_SECRET`
 * from the KKBOX developer portal. Token lifecycle is handled by the
 * shared `TokenManager` (OAuth 2.0 client credentials flow against
 * `account.kkbox.com/oauth2/token`).
 *
 * ## Territory parameter
 *
 * All KKBOX endpoints require a `territory` query parameter (ISO
 * country code). The adapter reads `KKBOX_TERRITORY` from the
 * environment and defaults to `"TW"` (Taiwan). KKBOX's catalog
 * varies by territory: the same track ID can be available in one
 * region and blocked in another, so selecting the right territory
 * affects both `getTrack` and search completeness.
 *
 * ## URL-format locale placeholders
 *
 * KKBOX URLs include two locale segments (`/tw/en/song/{id}`).
 * The track regex allows any two-letter codes to match all shipped
 * locales without explicit enumeration. On the output side we fall
 * back to `/tw/en/...` URLs if the API does not include a canonical
 * one.
 *
 * ## ISRC via search endpoint
 *
 * KKBOX has no direct ISRC-to-track endpoint, so `findByIsrc`
 * queries the regular search endpoint with the ISRC as the query
 * string. KKBOX indexes ISRC as searchable metadata, so the top
 * result is usually the right track when a match exists.
 *
 * ## Album track listing
 *
 * Album pages need a separate `/albums/{id}/tracks` call in addition
 * to `/albums/{id}` because KKBOX does not inline track listings.
 * Failure of the track-listing call is tolerated (empty array
 * fallback); the album still resolves but without per-track ISRCs,
 * so downstream ISRC-based inference skips it.
 *
 * ## Failure versus no match
 *
 * A lookup or search answers "nothing" only when KKBOX answered with an
 * empty list. An error status, a body that is not JSON and a body without
 * the requested list all throw, because the resolver records a returned
 * miss and skips the service for that track for a month.
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { TokenManager } from "../../../lib/infra/token-manager";
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
} from "../../types.js";
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";

const API_BASE = "https://api.kkbox.com/v1.1";

const KKBOX_TRACK_REGEX = /(?:https?:\/\/)?(?:www\.)?kkbox\.com\/[a-z]{2}\/[a-z]{2}\/song\/([A-Za-z0-9_-]+)/;
// KKBOX album URLs: kkbox.com/{locale}/{locale}/album/{id}
const KKBOX_ALBUM_REGEX = /(?:https?:\/\/)?(?:www\.)?kkbox\.com\/[a-z]{2}\/[a-z]{2}\/album\/([A-Za-z0-9_-]+)/;
// KKBOX artist URLs: kkbox.com/{locale}/{locale}/artist/{id}
const KKBOX_ARTIST_REGEX = /(?:https?:\/\/)?(?:www\.)?kkbox\.com\/[a-z]{2}\/[a-z]{2}\/artist\/([A-Za-z0-9_-]+)/;

const tokenManager = new TokenManager({
  serviceName: "KKBOX",
  tokenUrl: "https://account.kkbox.com/oauth2/token",
  clientIdEnv: "KKBOX_CLIENT_ID",
  clientSecretEnv: "KKBOX_CLIENT_SECRET",
});

interface KkboxTrackResponse {
  id: string;
  name: string;
  duration: number; // milliseconds
  isrc?: string;
  url: string;
  track_number?: number;
  explicitness?: boolean;
  available_territories?: string[];
  album?: {
    id: string;
    name: string;
    url: string;
    images?: Array<{ url: string; width: number; height: number }>;
  };
  artist?: {
    id: string;
    name: string;
    url: string;
  };
}

interface KkboxAlbumTrack {
  id: string;
  name: string;
  duration: number;
  isrc?: string;
  track_number?: number;
  url: string;
}

interface KkboxAlbumTracksResponse {
  data: KkboxAlbumTrack[];
}

interface KkboxAlbumResponse {
  id: string;
  name: string;
  url: string;
  release_date?: string;
  images?: Array<{ url: string; width: number; height: number }>;
  artist?: { id: string; name: string };
  total_tracks?: number;
}

interface KkboxArtistResponse {
  id: string;
  name: string;
  url: string;
  images?: Array<{ url: string; width: number; height: number }>;
}

/** The `type` values of a KKBOX search that this adapter uses. */
type KkboxSearchType = "track" | "album" | "artist";

/** Reset token cache. For testing only. */
export function _resetTokenCache(): void {
  tokenManager.reset();
}

function getTerritory(): string {
  return process.env.KKBOX_TERRITORY || "TW";
}

async function kkboxFetch(endpoint: string): Promise<Response> {
  const token = await tokenManager.getAccessToken();
  return fetchWithTimeout(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

function pickLargestImage(images?: Array<{ url: string; width: number; height: number }>): string | undefined {
  if (!images || images.length === 0) return undefined;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0].url;
}

function mapTrack(raw: KkboxTrackResponse): NormalizedTrack {
  return {
    sourceService: "kkbox",
    sourceId: raw.id,
    isrc: raw.isrc,
    title: raw.name,
    artists: raw.artist?.name ? [raw.artist.name] : ["Unknown Artist"],
    albumName: raw.album?.name,
    durationMs: raw.duration,
    isExplicit: raw.explicitness,
    artworkUrl: pickLargestImage(raw.album?.images),
    webUrl: raw.url || `https://www.kkbox.com/tw/en/song/${raw.id}`,
  };
}

function mapAlbum(raw: KkboxAlbumResponse, tracks?: KkboxAlbumTrack[]): NormalizedAlbum {
  const territory = getTerritory();
  const albumTracks: AlbumTrackEntry[] = (tracks ?? []).map((t, i) => ({
    title: t.name,
    isrc: t.isrc,
    trackNumber: t.track_number ?? i + 1,
    durationMs: t.duration,
  }));

  return {
    sourceService: "kkbox",
    sourceId: raw.id,
    title: raw.name,
    artists: raw.artist?.name ? [raw.artist.name] : ["Unknown Artist"],
    releaseDate: raw.release_date,
    totalTracks: raw.total_tracks ?? (albumTracks.length > 0 ? albumTracks.length : undefined),
    artworkUrl: pickLargestImage(raw.images),
    webUrl: raw.url || `https://www.kkbox.com/${territory.toLowerCase()}/${territory.toLowerCase()}/album/${raw.id}`,
    tracks: albumTracks.length > 0 ? albumTracks : undefined,
  };
}

async function getAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const territory = getTerritory();
  const response = await kkboxFetch(`/albums/${encodeURIComponent(albumId)}?territory=${territory}`);
  // A 404 means KKBOX has no such album, which is an answer. Any other error
  // status is a failure.
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.KKBox, response.status, ResourceKind.Album, albumId);

  const album: KkboxAlbumResponse = await response.json();

  // Fetch track listing
  let tracks: KkboxAlbumTrack[] = [];
  try {
    const tracksResponse = await kkboxFetch(
      `/albums/${encodeURIComponent(albumId)}/tracks?territory=${territory}&limit=50`,
    );
    if (tracksResponse.ok) {
      const tracksData: KkboxAlbumTracksResponse = await tracksResponse.json();
      tracks = tracksData.data ?? [];
    }
  } catch (error) {
    // Track listing is optional
    log.deviation(
      {
        component: "KKBOX",
        errorCode: "MC-API-0004",
        operation: "album_tracklist_enrichment",
        outcome: "tracklist_omitted",
      },
      error,
    );
  }

  return mapAlbum(album, tracks);
}

/**
 * Reads the list a KKBOX search answered with.
 *
 * KKBOX documents `data` as required on every list of a search answer, so a
 * search without matches carries an empty `data`. A body without the list is
 * not that answer.
 *
 * @param response - A successful search response.
 * @param type - The `type` the search asked for, which names the list as `tracks`, `albums` or `artists`.
 * @param query - The search text, for the error message.
 * @returns The items of the list, empty when nothing matched.
 * @throws {UpstreamUnavailableError} When the body is not JSON or has no list.
 */
async function readSearchList<T>(response: Response, type: KkboxSearchType, query: string): Promise<T[]> {
  const listName = `${type}s` as const;

  let body: Partial<Record<typeof listName, { data?: unknown }>> | null;
  try {
    body = await response.json();
  } catch (error) {
    throw new UpstreamUnavailableError(Service.KKBox, `search for "${query}" answered a body that is not JSON`, error);
  }

  const items = body?.[listName]?.data;
  if (!Array.isArray(items)) {
    throw new UpstreamUnavailableError(Service.KKBox, `search for "${query}" answered without the ${listName} list`);
  }
  return items as T[];
}

/**
 * Runs a KKBOX search for one kind of result.
 *
 * @param query - The search text, which is the ISRC for an ISRC lookup.
 * @param type - What to search for, which is also the list the answer carries.
 * @param kind - What the search is for, which an error names.
 * @param operation - Which lookup the search serves, which an error names.
 * @returns The matches, an empty list when KKBOX found none.
 * @throws When the request fails, answers with an error status, or answers
 *   with a body that is not JSON or lacks the list, because each of those is
 *   a failure rather than a search without matches.
 */
async function searchKkbox<T>(
  query: string,
  type: KkboxSearchType,
  kind: ResourceKind,
  operation: Operation,
): Promise<T[]> {
  const response = await kkboxFetch(
    `/search?q=${encodeURIComponent(query)}&type=${type}&territory=${getTerritory()}&limit=5`,
  );
  if (!response.ok) throw serviceHttpError(Service.KKBox, response.status, kind, query, operation);

  return readSearchList<T>(response, type, query);
}

export const kkboxAdapter = {
  id: "kkbox",
  displayName: getPlatformLabel("kkbox"),
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = KKBOX_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const territory = getTerritory();
    const response = await kkboxFetch(`/tracks/${encodeURIComponent(trackId)}?territory=${territory}`);

    if (!response.ok) {
      throw serviceHttpError(Service.KKBox, response.status, ResourceKind.Track, trackId);
    }

    const data: KkboxTrackResponse = await response.json();
    return mapTrack(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    // KKBOX searches the ISRC field only behind the `isrc:` prefix
    // (`q=isrc:TWB670602208` in its OpenAPI description); a bare code is a
    // text search that rarely finds the track.
    const tracks = await searchKkbox<KkboxTrackResponse>(
      `isrc:${isrc}`,
      "track",
      ResourceKind.Track,
      Operation.IsrcLookup,
    );

    if (tracks.length === 0) {
      log.debug("KKBOX", "ISRC not found:", isrc);
      return null;
    }

    // Find exact ISRC match in search results
    const match = tracks.find((candidate) => candidate.isrc === isrc);
    if (!match) {
      log.debug("KKBOX", "ISRC not found in results:", isrc);
      return null;
    }

    return mapTrack(match);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const items = await searchKkbox<KkboxTrackResponse>(q, "track", ResourceKind.Track, Operation.Search);

    if (items.length === 0) {
      log.debug("KKBOX", `Search returned no tracks for: ${q}`);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    log.debug("KKBOX", `Search returned ${items.length} tracks for: ${query.artist} ${query.title}`);

    for (let i = 0; i < Math.min(items.length, 5); i++) {
      const track = mapTrack(items[i]);
      const confidence = scoreSearchCandidate(query, track, i);

      log.debug(
        "KKBOX",
        `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
      );

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
    const match = KKBOX_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await getAlbumById(albumId);
    if (!album) throw serviceNotFoundError(Service.KKBox, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;

    const results = await searchKkbox<KkboxAlbumResponse>(q, "album", ResourceKind.Album, Operation.Search);
    if (results.length === 0) {
      log.debug("KKBOX", `Album search returned no results for: ${q}`);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("KKBOX", `Album search returned ${results.length} results for: ${q}`);

    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const raw of results) {
      const candidate = mapAlbum(raw);
      const confidence = scoreAlbumCandidate(query, candidate);
      log.debug("KKBOX", `  "${raw.name}" -> confidence=${confidence.toFixed(3)}`);
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = candidate;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    // The search already found the album, so a failed fetch of its track
    // listing keeps the search result instead of turning the match into a failure.
    const fullAlbum = await getAlbumById(bestMatch.sourceId).catch((error: unknown) => {
      log.deviation(
        {
          component: "KKBOX",
          errorCode: "MC-API-0004",
          operation: "album_search_enrichment",
          outcome: "search_result_kept",
        },
        error,
      );
      return null;
    });
    return {
      found: true,
      album: fullAlbum ?? bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },
  // --- Artist support ---

  artistCapabilities: {
    supportsArtistSearch: true,
  } satisfies ArtistCapabilities,

  detectArtistUrl(url: string): string | null {
    const match = KKBOX_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const territory = getTerritory();
    const response = await kkboxFetch(`/artists/${encodeURIComponent(artistId)}?territory=${territory}`);

    if (!response.ok) {
      throw serviceHttpError(Service.KKBox, response.status, ResourceKind.Artist, artistId);
    }

    const data: KkboxArtistResponse = await response.json();

    return {
      sourceService: "kkbox",
      sourceId: data.id,
      name: data.name,
      imageUrl: pickLargestImage(data.images),
      webUrl:
        data.url || `https://www.kkbox.com/${territory.toLowerCase()}/${territory.toLowerCase()}/artist/${data.id}`,
    };
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const territory = getTerritory();
    const items = await searchKkbox<KkboxArtistResponse>(query.name, "artist", ResourceKind.Artist, Operation.Search);

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const confidence = calculateArtistNameConfidence(query.name, item.name);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestArtist = {
          sourceService: "kkbox",
          sourceId: item.id,
          name: item.name,
          imageUrl: pickLargestImage(item.images),
          webUrl:
            item.url || `https://www.kkbox.com/${territory.toLowerCase()}/${territory.toLowerCase()}/artist/${item.id}`,
        };
      }
    }

    if (!bestArtist || bestConfidence < 0.6) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
