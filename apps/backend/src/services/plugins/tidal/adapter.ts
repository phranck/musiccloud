/**
 * @file Tidal adapter: track + album + artist resolves via Tidal OpenAPI v2.
 *
 * Credentialed: requires `TIDAL_CLIENT_ID` and `TIDAL_CLIENT_SECRET`
 * from the Tidal developer portal. Token lifecycle goes through the
 * shared `TokenManager` (OAuth 2.0 client credentials).
 *
 * ## JSON:API response shape
 *
 * Tidal OpenAPI v2 uses the JSON:API standard: responses have a
 * top-level `data` field for the primary resource and an `included`
 * array for related resources. Artist names, for example, live in
 * `included` as separate resources referenced by ID from the track's
 * `relationships.artists.data`. The adapter's `extractArtistNames`
 * and `mapAlbum` walk this structure rather than expecting nested
 * objects.
 *
 * ## ISO 8601 duration (fixed 2026-03-22)
 *
 * Tidal's `duration` field is an ISO 8601 period string (`"PT5M41S"`),
 * not a number of seconds as the older API version used. The adapter
 * previously parsed it as raw seconds, producing dramatically wrong
 * durations; `parseDuration` now handles the ISO form with a
 * fractional-seconds fallback for exotic edge cases. Pure-number
 * responses from older endpoints still work as a fallback.
 *
 * ## No artwork from API for albums
 *
 * Tidal API v2 does not return `imageLinks` on album resources in
 * all responses. The resolver's cross-service artwork fallback
 * (Spotify -> Apple Music -> ...) fills this gap downstream; the
 * adapter itself leaves `artworkUrl` empty rather than fabricating
 * a broken URL.
 *
 * ## URL formats
 *
 * Tidal URLs have multiple forms:
 * - `listen.tidal.com/track/...`
 * - `tidal.com/browse/track/...`
 * - `tidal.com/track/...`
 *
 * The regexes accept all three via optional segments.
 */
import { RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { TokenManager } from "../../../lib/infra/token-manager";
import { calculateAlbumConfidence } from "../../../lib/resolve/normalize";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
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
} from "../../types.js";
import { scoreSearchCandidate } from "../_shared/confidence.js";

const API_BASE = "https://openapi.tidal.com/v2";

const TIDAL_TRACK_REGEX = /(?:https?:\/\/)?(?:listen\.)?tidal\.com\/(?:browse\/)?track\/(\d+)/;
const TIDAL_ALBUM_REGEX = /(?:https?:\/\/)?(?:listen\.)?tidal\.com\/(?:browse\/)?album\/(\d+)/;
const TIDAL_ARTIST_REGEX = /(?:https?:\/\/)?(?:listen\.)?tidal\.com\/(?:browse\/)?artist\/(\d+)/;

const tokenManager = new TokenManager({
  serviceName: "Tidal",
  tokenUrl: "https://auth.tidal.com/v1/oauth2/token",
  clientIdEnv: "TIDAL_CLIENT_ID",
  clientSecretEnv: "TIDAL_CLIENT_SECRET",
});

interface TidalTrackResource {
  id: string;
  attributes: {
    title: string;
    isrc?: string;
    duration?: number; // ISO 8601 duration or seconds
    explicit?: boolean;
    externalLinks?: Array<{ href: string; meta: { type: string } }>;
    imageLinks?: Array<{ href: string; meta: { width: number; height: number } }>;
  };
  relationships?: {
    artists?: {
      data: Array<{ id: string }>;
    };
    albums?: {
      data: Array<{ id: string }>;
    };
  };
}

interface TidalTrackResponse {
  data: TidalTrackResource;
  included?: Array<{
    id: string;
    type: string;
    attributes: { name?: string; title?: string; imageLinks?: Array<{ href: string }> };
  }>;
}

interface TidalSearchResponse {
  data: TidalTrackResource[];
  included?: Array<{
    id: string;
    type: string;
    attributes: { name?: string; title?: string; imageLinks?: Array<{ href: string }> };
  }>;
}

interface TidalAlbumResource {
  id: string;
  attributes: {
    title: string;
    barcodeId?: string; // UPC
    releaseDate?: string;
    numberOfItems?: number;
    imageLinks?: Array<{ href: string; meta: { width: number; height: number } }>;
  };
  relationships?: {
    artists?: { data: Array<{ id: string }> };
    items?: { data: Array<{ id: string }> };
  };
}

interface TidalAlbumResponse {
  data: TidalAlbumResource;
  included?: Array<{
    id: string;
    type: string;
    attributes: {
      name?: string;
      title?: string;
      isrc?: string;
      trackNumber?: number;
      duration?: number;
    };
  }>;
}

interface TidalAlbumSearchResponse {
  data: TidalAlbumResource[];
  included?: TidalAlbumResponse["included"];
}

function mapAlbum(resource: TidalAlbumResource, included?: TidalAlbumResponse["included"]): NormalizedAlbum {
  const attrs = resource.attributes;

  const artistIds = resource.relationships?.artists?.data?.map((a) => a.id) ?? [];
  const artists: string[] = [];
  if (included) {
    for (const id of artistIds) {
      const artist = included.find((i) => i.id === id && i.type === "artists");
      if (artist?.attributes?.name) artists.push(artist.attributes.name);
    }
  }

  // Extract track listing from included resources
  const trackIds = resource.relationships?.items?.data?.map((t) => t.id) ?? [];
  const tracks = included
    ? trackIds
        .map((id, idx) => {
          const t = included.find((i) => i.id === id && i.type === "tracks");
          if (!t?.attributes?.title) return null;
          return {
            title: t.attributes.title,
            trackNumber: t.attributes.trackNumber ?? idx + 1,
            durationMs: t.attributes.duration ? t.attributes.duration * 1000 : undefined,
            isrc: t.attributes.isrc,
          };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
    : undefined;

  return {
    sourceService: "tidal",
    sourceId: resource.id,
    upc: attrs.barcodeId,
    title: attrs.title,
    artists: artists.length > 0 ? artists : ["Unknown Artist"],
    releaseDate: attrs.releaseDate,
    totalTracks: attrs.numberOfItems,
    artworkUrl: pickLargestImage(attrs.imageLinks),
    webUrl: `https://tidal.com/browse/album/${resource.id}`,
    tracks: tracks && tracks.length > 0 ? tracks : undefined,
  };
}

/** Reset token cache. For testing only. */
export function _resetTokenCache(): void {
  tokenManager.reset();
}

async function tidalFetch(endpoint: string): Promise<Response> {
  const token = await tokenManager.getAccessToken();
  return fetchWithTimeout(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
    },
  });
}

function parseDuration(duration: number | string | undefined): number | undefined {
  if (duration === undefined) return undefined;

  // ISO 8601 duration format: PT5M41S (5 minutes 41 seconds)
  if (typeof duration === "string") {
    const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(duration);
    if (!match) return undefined;
    const hours = Number(match[1]) || 0;
    const minutes = Number(match[2]) || 0;
    const seconds = Number(match[3]) || 0;
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  // Fallback: assume duration is in seconds
  return duration * 1000;
}

function extractArtistNames(resource: TidalTrackResource, included?: TidalTrackResponse["included"]): string[] {
  const artistIds = resource.relationships?.artists?.data?.map((a) => a.id) ?? [];
  if (!included || artistIds.length === 0) return ["Unknown Artist"];

  const names: string[] = [];
  for (const id of artistIds) {
    const artist = included.find((i) => i.id === id && i.type === "artists");
    if (artist?.attributes?.name) {
      names.push(artist.attributes.name);
    }
  }

  return names.length > 0 ? names : ["Unknown Artist"];
}

function extractAlbumName(resource: TidalTrackResource, included?: TidalTrackResponse["included"]): string | undefined {
  const albumIds = resource.relationships?.albums?.data?.map((a) => a.id) ?? [];
  if (!included || albumIds.length === 0) return undefined;

  const album = included.find((i) => i.id === albumIds[0] && i.type === "albums");
  return album?.attributes?.title;
}

function pickLargestImage(
  imageLinks?: Array<{ href: string; meta: { width: number; height: number } }>,
): string | undefined {
  if (!imageLinks || imageLinks.length === 0) return undefined;
  const sorted = [...imageLinks].sort((a, b) => (b.meta.width ?? 0) - (a.meta.width ?? 0));
  return sorted[0].href;
}

function mapTrack(resource: TidalTrackResource, included?: TidalTrackResponse["included"]): NormalizedTrack {
  const attrs = resource.attributes;
  return {
    sourceService: "tidal",
    sourceId: resource.id,
    isrc: attrs.isrc,
    title: attrs.title,
    artists: extractArtistNames(resource, included),
    albumName: extractAlbumName(resource, included),
    durationMs: parseDuration(attrs.duration),
    isExplicit: attrs.explicit,
    artworkUrl: pickLargestImage(attrs.imageLinks),
    webUrl: `https://tidal.com/browse/track/${resource.id}`,
  };
}

export const tidalAdapter = {
  id: "tidal",
  displayName: "Tidal",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return tokenManager.isConfigured();
  },

  detectUrl(url: string): string | null {
    const match = TIDAL_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await tidalFetch(`/tracks/${encodeURIComponent(trackId)}?countryCode=US&include=artists,albums`);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.TIDAL, response.status, RESOURCE_KIND.TRACK, trackId);
    }

    const data: TidalTrackResponse = await response.json();
    return mapTrack(data.data, data.included);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await tidalFetch(
      `/tracks?filter[isrc]=${encodeURIComponent(isrc)}&countryCode=US&include=artists,albums`,
    );

    if (!response.ok) {
      log.debug("Tidal", "ISRC lookup failed:", response.status);
      return null;
    }

    const data: TidalSearchResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      log.debug("Tidal", "ISRC not found:", isrc);
      return null;
    }

    return mapTrack(data.data[0], data.included);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    const response = await tidalFetch(
      `/searchresults/${encodeURIComponent(q)}/relationships/tracks?countryCode=US&include=tracks.artists,tracks.albums`,
    );

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data: TidalSearchResponse = await response.json();
    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < Math.min(items.length, 5); i++) {
      const track = mapTrack(items[i], data.included);
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
  // --- Album support ---

  albumCapabilities: {
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  } satisfies AlbumCapabilities,

  detectAlbumUrl(url: string): string | null {
    const match = TIDAL_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const response = await tidalFetch(`/albums/${encodeURIComponent(albumId)}?countryCode=US&include=artists,items`);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.TIDAL, response.status, RESOURCE_KIND.ALBUM, albumId);
    }

    const data: TidalAlbumResponse = await response.json();
    return mapAlbum(data.data, data.included);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const response = await tidalFetch(
      `/albums?filter[barcodeId]=${encodeURIComponent(upc)}&countryCode=US&include=artists`,
    );

    if (!response.ok) {
      log.debug("Tidal", "UPC album lookup failed:", response.status);
      return null;
    }

    const data: TidalAlbumSearchResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      log.debug("Tidal", "Album UPC not found:", upc);
      return null;
    }

    return mapAlbum(data.data[0], data.included);
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const response = await tidalFetch(
      `/searchresults/${encodeURIComponent(q)}/relationships/albums?countryCode=US&include=albums.artists`,
    );

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data: TidalAlbumSearchResponse = await response.json();
    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestAlbum: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const item of items.slice(0, 5)) {
      const album = mapAlbum(item, data.included);
      const confidence = calculateAlbumConfidence(
        { title: query.title, artists: [query.artist], totalTracks: query.totalTracks },
        { title: album.title, artists: album.artists, releaseDate: album.releaseDate, totalTracks: album.totalTracks },
      );

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
    const match = TIDAL_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const response = await tidalFetch(`/artists/${encodeURIComponent(artistId)}?countryCode=US`);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.TIDAL, response.status, RESOURCE_KIND.ARTIST, artistId);
    }

    const data = await response.json();
    const resource = data.data;
    const attrs = resource.attributes;

    return {
      sourceService: "tidal",
      sourceId: resource.id,
      name: attrs.name,
      imageUrl: pickLargestImage(attrs.imageLinks),
      webUrl: `https://tidal.com/browse/artist/${resource.id}`,
    };
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const response = await tidalFetch(
      `/searchresults/${encodeURIComponent(query.name)}/relationships/artists?countryCode=US&include=artists`,
    );

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    // Find best name match from included resources
    const included = data.included ?? [];
    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;
    const queryNameLower = query.name.toLowerCase().trim();

    for (const item of items.slice(0, 5)) {
      const artistResource = included.find(
        (i: { id: string; type: string }) => i.id === item.id && i.type === "artists",
      );
      if (!artistResource?.attributes?.name) continue;

      const name = artistResource.attributes.name;
      const nameLower = name.toLowerCase().trim();

      let confidence: number;
      if (nameLower === queryNameLower) {
        confidence = 0.95;
      } else if (nameLower.includes(queryNameLower) || queryNameLower.includes(nameLower)) {
        confidence = 0.75;
      } else {
        confidence = 0.5;
      }

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestArtist = {
          sourceService: "tidal",
          sourceId: item.id,
          name,
          imageUrl: pickLargestImage(artistResource.attributes.imageLinks),
          webUrl: `https://tidal.com/browse/artist/${item.id}`,
        };
      }
    }

    if (!bestArtist || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
