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
 * ## Search is a relationship projection
 *
 * The documented `/searchResults` query returns one search-results resource.
 * Its relationships provide ranking; `included` is only an unordered resource
 * store. `searchCatalogue` resolves each ranked identifier by both type and id
 * for tracks, albums, and artists. A missing referenced resource, malformed
 * consumed metadata, or failed search route is an upstream failure, never a
 * catalogue miss. See the generated API contract:
 * https://github.com/tidal-music/tidal-sdk-ios/blob/main/Sources/TidalAPI/Generated/docs/SearchResultsAPI.md
 *
 * Track text matching uses bounded query alternatives and the shared recording
 * guards in `track-search-query.ts`. Display metadata and confidence thresholds
 * remain separate from the terms sent to search.
 *
 * ## Duration and optional artwork
 *
 * `parseDuration` accepts ISO 8601 time periods with fractional seconds and
 * numeric seconds, then exposes milliseconds to matching. Consumed search
 * fields are checked before mapping so invalid durations cannot bypass scoring.
 *
 * `imageLinks` is optional. The adapter uses supplied images and never invents
 * a CDN address. Missing recording covers are owned by `artwork.ts` and its
 * `pickRecordingArtworkUrl` policy, not by artist-portrait selection.
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
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { TokenManager } from "../../../lib/infra/token-manager";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
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
import { scoreAlbumCandidate } from "../_shared/confidence.js";
import { scoreCatalogueTrackCandidate, trackSearchTexts } from "../_shared/track-search-query.js";

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
    duration?: number | string; // ISO 8601 duration or seconds
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

/** UPC-filtered album collections contain albums directly, unlike text-search documents. */
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
    upc: attrs.barcodeId ?? undefined,
    title: attrs.title,
    artists: artists.length > 0 ? artists : ["Unknown Artist"],
    releaseDate: attrs.releaseDate ?? undefined,
    totalTracks: attrs.numberOfItems ?? undefined,
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

/** Search operations own their relationship name, includes and expected label field. */
const SEARCH_RELATIONSHIPS = {
  tracks: {
    include: "tracks.artists,tracks.albums",
    label: "title",
    kind: ResourceKind.Track,
    optional: { isrc: "string", explicit: "boolean" },
  },
  albums: {
    include: "albums.artists",
    label: "title",
    kind: ResourceKind.Album,
    optional: { barcodeId: "string", releaseDate: "string", numberOfItems: "number" },
  },
  artists: { include: "artists", label: "name", kind: ResourceKind.Artist, optional: {} },
} as const;

/** Resources projected from the corresponding JSON:API search relationship. */
interface TidalSearchResourceMap {
  tracks: TidalTrackResource;
  albums: TidalAlbumResource;
  artists: {
    id: string;
    attributes: { name: string; imageLinks?: Array<{ href: string; meta: { width: number; height: number } }> };
  };
}

/** Minimal included-resource boundary; concrete shapes are checked before projection. */
interface TidalIncludedResource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: TidalTrackResource["relationships"];
}

/** The current API returns one search-results resource, never a primary track array. */
interface TidalSearchDocument {
  data: Array<{
    type: string;
    relationships?: Partial<Record<keyof TidalSearchResourceMap, { data?: Array<{ id: string; type: string }> }>>;
  }>;
  included?: TidalIncludedResource[];
}

/**
 * Searches the current query endpoint and projects one ranked relationship.
 *
 * @param query - Search text, encoded as the documented query parameter.
 * @param relationship - Resource kind and its owned include/label contract.
 * @returns Ranked concrete resources and the included artist/album metadata.
 * @throws {UpstreamUnavailableError} on malformed JSON:API data; an invalid
 * search route also throws instead of becoming a month-long catalogue miss.
 */
async function searchCatalogue<Kind extends keyof TidalSearchResourceMap>(
  query: string,
  relationship: Kind,
): Promise<{ data: TidalSearchResourceMap[Kind][]; included: TidalTrackResponse["included"] }> {
  const contract = SEARCH_RELATIONSHIPS[relationship];
  const params = new URLSearchParams({ "filter[query]": query, countryCode: "US", include: contract.include });
  const response = await tidalFetch(`/searchResults?${params}`);
  if (!response.ok)
    throw serviceHttpError(Service.Tidal, response.status, contract.kind, "catalogue search", Operation.Search);
  let document: TidalSearchDocument;
  try {
    document = await response.json();
  } catch {
    throw new UpstreamUnavailableError("tidal", "catalogue search answered with invalid JSON");
  }
  if (
    !document ||
    !Array.isArray(document.data) ||
    document.data.length !== 1 ||
    document.data[0]?.type !== "searchResults" ||
    (document.included !== undefined && !Array.isArray(document.included))
  ) {
    throw new UpstreamUnavailableError("tidal", "catalogue search answered with an invalid resource document");
  }
  const identifiers = document.data[0].relationships?.[relationship]?.data;
  if (!Array.isArray(identifiers))
    throw new UpstreamUnavailableError("tidal", "catalogue search omitted its ranked relationship");
  const included = document.included ?? [];
  if (
    included.some(
      (resource) =>
        !resource ||
        typeof resource.id !== "string" ||
        typeof resource.type !== "string" ||
        !resource.attributes ||
        typeof resource.attributes !== "object",
    )
  ) {
    throw new UpstreamUnavailableError("tidal", "catalogue search included malformed resources");
  }
  const resources = identifiers.map((identifier) => {
    if (
      !identifier ||
      identifier.type !== relationship ||
      typeof identifier.id !== "string" ||
      !/^\d+$/.test(identifier.id)
    ) {
      throw new UpstreamUnavailableError("tidal", "catalogue search included an invalid resource identifier");
    }
    const resource = included.find((entry) => entry.id === identifier.id && entry.type === relationship);
    const label = resource?.attributes[contract.label];
    if (!resource || typeof label !== "string" || !label.trim()) {
      throw new UpstreamUnavailableError("tidal", "catalogue search did not include a referenced resource");
    }
    validateSearchAttributes(resource.attributes, relationship);
    if (relationship !== "artists") {
      const artists = resource.relationships?.artists?.data;
      if (
        !Array.isArray(artists) ||
        artists.length === 0 ||
        artists.some(
          (artist) =>
            !artist ||
            typeof artist.id !== "string" ||
            !included.some(
              (entry) =>
                entry.id === artist.id &&
                entry.type === "artists" &&
                typeof entry.attributes.name === "string" &&
                entry.attributes.name.trim().length > 0,
            ),
        )
      ) {
        throw new UpstreamUnavailableError("tidal", "catalogue search omitted referenced artist metadata");
      }
    }
    return resource;
  });
  // The boundary above checks the kind, id, required label and artist metadata.
  return {
    data: resources as unknown as TidalSearchResourceMap[Kind][],
    included: included as TidalTrackResponse["included"],
  };
}

/**
 * Checks consumed optional fields before they reach scoring or image selection.
 *
 * Missing/null optional values are allowed, but a value of the wrong type is
 * not a clean miss and must not enter the negative cache. Unknown fields do
 * not constrain the provider's response shape.
 *
 * @param attributes - Included resource attributes after required-label checks.
 * @param relationship - Resource kind selecting the consumed optional fields.
 * @throws UpstreamUnavailableError for malformed consumed metadata.
 */
function validateSearchAttributes(
  attributes: Record<string, unknown>,
  relationship: keyof TidalSearchResourceMap,
): void {
  for (const [field, expected] of Object.entries(SEARCH_RELATIONSHIPS[relationship].optional)) {
    const value = attributes[field];
    if (
      value != null &&
      (typeof value !== expected || (typeof value === "number" && (!Number.isFinite(value) || value < 0)))
    ) {
      throw new UpstreamUnavailableError("tidal", "catalogue search included malformed attributes");
    }
  }
  if (relationship === "tracks" && attributes.duration != null) {
    const duration = attributes.duration;
    if (typeof duration !== "number" && typeof duration !== "string")
      throw new UpstreamUnavailableError("tidal", "catalogue search included an invalid duration");
    const parsed = parseDuration(duration);
    if (parsed === undefined || !Number.isFinite(parsed) || parsed < 0)
      throw new UpstreamUnavailableError("tidal", "catalogue search included an invalid duration");
  }
  const images = attributes.imageLinks;
  if (
    images != null &&
    (!Array.isArray(images) || images.some((image) => !image || typeof image.href !== "string" || !image.href.trim()))
  ) {
    throw new UpstreamUnavailableError("tidal", "catalogue search included malformed image metadata");
  }
}

/**
 * Tells a lookup or search answer with results apart from "nothing" and from
 * a failure. Only the first two may become a miss, because the resolver
 * remembers a miss for a month.
 *
 * @returns `true` for an OK answer, `false` for a 404 (nothing there).
 * @throws The mapped service error for every other status.
 */
function tidalAnswered(response: Response, kind: ResourceKind, id: string, op: Operation): boolean {
  if (response.status === 404) return false;
  if (!response.ok) throw serviceHttpError(Service.Tidal, response.status, kind, id, op);
  return true;
}

/**
 * Parses a complete provider duration before it participates in identity scoring.
 *
 * @param duration - Numeric seconds or an ISO 8601 time period with at least one component.
 * @returns Milliseconds, or undefined for an absent or malformed period.
 */
function parseDuration(duration: number | string | undefined): number | undefined {
  if (duration === undefined) return undefined;

  // ISO 8601 duration format: PT5M41S (5 minutes 41 seconds)
  if (typeof duration === "string") {
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(duration);
    if (!match || !match.slice(1).some((component) => component !== undefined)) return undefined;
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
  imageLinks?: Array<{ href: string; meta?: { width: number; height: number } }>,
): string | undefined {
  if (!imageLinks || imageLinks.length === 0) return undefined;
  const sorted = [...imageLinks].sort((left, right) => (right.meta?.width ?? 0) - (left.meta?.width ?? 0));
  return sorted[0].href;
}

function mapTrack(resource: TidalTrackResource, included?: TidalTrackResponse["included"]): NormalizedTrack {
  const attrs = resource.attributes;
  return {
    sourceService: "tidal",
    sourceId: resource.id,
    isrc: attrs.isrc ?? undefined,
    title: attrs.title,
    artists: extractArtistNames(resource, included),
    albumName: extractAlbumName(resource, included),
    durationMs: parseDuration(attrs.duration ?? undefined),
    isExplicit: attrs.explicit ?? undefined,
    artworkUrl: pickLargestImage(attrs.imageLinks),
    webUrl: `https://tidal.com/browse/track/${resource.id}`,
  };
}

/**
 * Tidal provider boundary. Search kinds share the ranked JSON:API projection;
 * identifier collections retain their distinct direct-resource contract.
 */
export const tidalAdapter = {
  id: "tidal",
  displayName: getPlatformLabel("tidal"),
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = TIDAL_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await tidalFetch(`/tracks/${encodeURIComponent(trackId)}?countryCode=US&include=artists,albums`);

    if (!response.ok) {
      throw serviceHttpError(Service.Tidal, response.status, ResourceKind.Track, trackId);
    }

    const data: TidalTrackResponse = await response.json();
    return mapTrack(data.data, data.included);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await tidalFetch(
      `/tracks?filter[isrc]=${encodeURIComponent(isrc)}&countryCode=US&include=artists,albums`,
    );

    if (!tidalAnswered(response, ResourceKind.Track, isrc, Operation.IsrcLookup)) return null;

    const data: TidalSearchResponse = await response.json();

    if (!Array.isArray(data?.data))
      throw new UpstreamUnavailableError("tidal", "ISRC lookup omitted its recording collection");
    if (data.data.length === 0) {
      log.debug("Tidal", "ISRC not found:", isrc);
      return null;
    }

    return mapTrack(data.data[0], data.included);
  },

  /**
   * Matches ranked recordings through bounded text alternatives and identity guards.
   * @param query - Original recording metadata or the free-text discovery marker.
   * @returns A qualifying recording without changing the caller's display metadata.
   * @throws Provider and malformed-document failures instead of catalogue misses.
   */
  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    let bestConfidence = 0;
    for (const text of trackSearchTexts(query)) {
      const data = await searchCatalogue(text, "tracks");
      let bestMatch: NormalizedTrack | null = null;
      for (let index = 0; index < Math.min(data.data.length, 5); index++) {
        const track = mapTrack(data.data[index], data.included);
        const confidence = scoreCatalogueTrackCandidate(query, track, index);
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }
      if (bestMatch && bestConfidence >= MATCH_MIN_CONFIDENCE) {
        return { found: true, track: bestMatch, confidence: bestConfidence, matchMethod: "search" };
      }
    }
    return { found: false, confidence: bestConfidence, matchMethod: "search" };
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
      throw serviceHttpError(Service.Tidal, response.status, ResourceKind.Album, albumId);
    }

    const data: TidalAlbumResponse = await response.json();
    return mapAlbum(data.data, data.included);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const response = await tidalFetch(
      `/albums?filter[barcodeId]=${encodeURIComponent(upc)}&countryCode=US&include=artists`,
    );

    if (!tidalAnswered(response, ResourceKind.Album, upc, Operation.UpcLookup)) return null;

    const data: TidalAlbumSearchResponse = await response.json();

    if (!Array.isArray(data?.data))
      throw new UpstreamUnavailableError("tidal", "UPC lookup omitted its album collection");
    if (data.data.length === 0) {
      log.debug("Tidal", "Album UPC not found:", upc);
      return null;
    }

    return mapAlbum(data.data[0], data.included);
  },

  /**
   * Scores album resources projected from their ranked search relationship.
   * @param query - Album identity including any known year and track count.
   * @returns The best album under the shared acceptance threshold.
   * @throws Search transport and JSON:API contract failures.
   */
  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const text = `${query.artist} ${query.title}`;
    const data = await searchCatalogue(text, "albums");
    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestAlbum: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const item of items.slice(0, 5)) {
      const album = mapAlbum(item, data.included);
      const confidence = scoreAlbumCandidate(query, album);

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
      throw serviceHttpError(Service.Tidal, response.status, ResourceKind.Artist, artistId);
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

  /**
   * Scores artist names without confusing included-resource order with rank.
   * @param query - Artist name to compare against the ranked relationship.
   * @returns The best qualifying artist and its independently supplied portrait.
   * @throws Search transport and JSON:API contract failures.
   */
  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const data = await searchCatalogue(query.name, "artists");
    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    // Find best name match from included resources
    const included = data.included ?? [];
    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of items.slice(0, 5)) {
      const artistResource = included.find(
        (i: { id: string; type: string }) => i.id === item.id && i.type === "artists",
      );
      if (!artistResource?.attributes?.name) continue;

      const name = artistResource.attributes.name;
      const confidence = calculateArtistNameConfidence(query.name, name);

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
