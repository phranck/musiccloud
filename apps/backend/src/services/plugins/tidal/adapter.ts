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
 * store. `searchCatalogue` in `search-document.ts` resolves each ranked
 * identifier by both type and id for tracks, albums, and artists. A missing
 * referenced resource, malformed consumed metadata, or failed search route is
 * an upstream failure, never a catalogue miss. See the generated API contract:
 * https://github.com/tidal-music/tidal-sdk-ios/blob/main/Sources/TidalAPI/Generated/docs/SearchResultsAPI.md
 *
 * Track text matching uses bounded query alternatives and the shared recording
 * guards in `track-search-query.ts`. Display metadata and confidence thresholds
 * remain separate from the terms sent to search.
 *
 * ## Duration and optional artwork
 *
 * `parseDuration` in `duration.ts` accepts ISO 8601 time periods with fractional seconds and
 * numeric seconds, then exposes milliseconds to matching. Consumed search
 * fields are checked before mapping so invalid durations cannot bypass scoring.
 *
 * Current covers/profile pictures are ordered coverArt/profileArt relationships
 * pointing to included artworks.attributes.files. Those includes travel with
 * the metadata request; there is no per-result image request. Related assets
 * are joined by type and id, and the largest supplied file is selected without
 * constructing a CDN address. Legacy imageLinks remain a compatibility fallback.
 * Album-listing ISO durations use the same parseDuration boundary as tracks.
 * Recording-cover eligibility remains in artwork.ts; profileArt never becomes
 * a recording cover.
 * @see https://github.com/tidal-music/tidal-sdk-ios/blob/main/Sources/TidalAPI/Generated/docs/ArtworksAttributes.md
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
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
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
import { UNKNOWN_ARTIST } from "../_shared/artists.js";
import { scoreAlbumCandidate } from "../_shared/confidence.js";
import { pickLargestImage } from "../_shared/images.js";
import { pickBestCandidate, rankByArtistName, searchMatchResult } from "../_shared/rank.js";
import { scoreCatalogueTrackCandidate, trackSearchTexts } from "../_shared/track-search-query.js";
import { tidalFetch } from "./client.js";
import { parseDuration } from "./duration.js";
import { searchCatalogue } from "./search-document.js";
import type {
  TidalAlbumResource,
  TidalAlbumResponse,
  TidalAlbumSearchResponse,
  TidalArtworkRelationships,
  TidalImageLink,
  TidalRelatedResource,
  TidalSearchResponse,
  TidalTrackResource,
  TidalTrackResponse,
} from "./types.js";

export { _resetTokenCache } from "./client.js";

/**
 * How many of the hits Tidal ranks first each search scores: `5`. The track,
 * album and artist searches all stop there, so a hit further down the
 * relationship never becomes a match.
 */
const TIDAL_SEARCH_CANDIDATE_LIMIT = 5;

const TIDAL_TRACK_REGEX = /(?:https?:\/\/)?(?:listen\.)?tidal\.com\/(?:browse\/)?track\/(\d+)/;
const TIDAL_ALBUM_REGEX = /(?:https?:\/\/)?(?:listen\.)?tidal\.com\/(?:browse\/)?album\/(\d+)/;
const TIDAL_ARTIST_REGEX = /(?:https?:\/\/)?(?:listen\.)?tidal\.com\/(?:browse\/)?artist\/(\d+)/;

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
            durationMs: parseDuration(t.attributes.duration),
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
    artists: artists.length > 0 ? artists : [UNKNOWN_ARTIST],
    releaseDate: attrs.releaseDate ?? undefined,
    totalTracks: attrs.numberOfItems ?? undefined,
    artworkUrl: pickRelatedArtwork(resource, included, "coverArt") ?? pickLargestTidalImage(attrs.imageLinks),
    webUrl: `https://tidal.com/browse/album/${resource.id}`,
    tracks: tracks && tracks.length > 0 ? tracks : undefined,
  };
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

function extractArtistNames(resource: TidalTrackResource, included?: TidalTrackResponse["included"]): string[] {
  const artistIds = resource.relationships?.artists?.data?.map((a) => a.id) ?? [];
  if (!included || artistIds.length === 0) return [UNKNOWN_ARTIST];

  const names: string[] = [];
  for (const id of artistIds) {
    const artist = included.find((i) => i.id === id && i.type === "artists");
    if (artist?.attributes?.name) {
      names.push(artist.attributes.name);
    }
  }

  return names.length > 0 ? names : [UNKNOWN_ARTIST];
}

function extractAlbumName(resource: TidalTrackResource, included?: TidalTrackResponse["included"]): string | undefined {
  const albumIds = resource.relationships?.albums?.data?.map((a) => a.id) ?? [];
  if (!included || albumIds.length === 0) return undefined;

  const album = included.find((i) => i.id === albumIds[0] && i.type === "albums");
  return album?.attributes?.title;
}

/**
 * Picks the widest of Tidal's image variants through the shared {@link pickLargestImage}.
 *
 * @param imageLinks - Legacy `imageLinks` or an artwork's `files`, or `undefined` when absent.
 * @returns The `href` of the widest variant, or `undefined` without a variant.
 */
function pickLargestTidalImage(imageLinks?: readonly TidalImageLink[]): string | undefined {
  return pickLargestImage(
    imageLinks,
    (link) => link.meta?.width,
    (link) => link.href,
  );
}

/**
 * Maps a Tidal artist to the shared artist shape, for both lookup and search.
 *
 * @param resource - The artist resource from `/artists/{id}` or from a search's included resources.
 * @param name - The artist name the caller read from that resource.
 * @param included - Resources of the same response, which hold the `profileArt` artwork.
 * @returns The artist with its profile artwork, or its widest legacy image when it has none.
 * @throws UpstreamUnavailableError for invalid artwork linkage, see {@link pickRelatedArtwork}.
 */
function mapArtist(
  resource: { id: string; attributes: { imageLinks?: TidalImageLink[] }; relationships?: TidalArtworkRelationships },
  name: string,
  included: TidalRelatedResource[] | undefined,
): NormalizedArtist {
  return {
    sourceService: "tidal",
    sourceId: resource.id,
    name,
    imageUrl:
      pickRelatedArtwork(resource, included, "profileArt") ?? pickLargestTidalImage(resource.attributes.imageLinks),
    webUrl: `https://tidal.com/browse/artist/${resource.id}`,
  };
}

/**
 * Resolves the first supplied artwork asset by typed relationship, then selects
 * its largest file. Included-array order is not asset priority. An absent or
 * empty optional relationship permits legacy fallback; a referenced but missing
 * or malformed file resource is an upstream failure.
 *
 * @param resource - Album/artist resource owning the artwork relationship.
 * @param included - Unordered resources from the same metadata response.
 * @param relationship - Cover artwork or the separate artist-profile role.
 * @returns An actual supplied image href, or undefined without an image.
 * @throws UpstreamUnavailableError for invalid linkage or file metadata.
 */
function pickRelatedArtwork(
  resource: { relationships?: TidalArtworkRelationships },
  included: TidalRelatedResource[] | undefined,
  relationship: keyof TidalArtworkRelationships,
): string | undefined {
  const identifiers = resource.relationships?.[relationship]?.data;
  if (identifiers == null) return undefined;
  if (!Array.isArray(identifiers)) throw new UpstreamUnavailableError("tidal", "artwork linkage is not a collection");
  for (const identifier of identifiers) {
    if (!identifier || identifier.type !== "artworks" || typeof identifier.id !== "string" || !identifier.id) {
      throw new UpstreamUnavailableError("tidal", "artwork linkage has an invalid resource identifier");
    }
    const artwork = included?.find((entry) => entry.type === "artworks" && entry.id === identifier.id);
    const files = artwork?.attributes?.files;
    if (!Array.isArray(files) || files.some((file) => !file || typeof file.href !== "string" || !file.href.trim())) {
      throw new UpstreamUnavailableError("tidal", "referenced artwork omitted its file collection");
    }
    const href = pickLargestTidalImage(files);
    if (href) return href;
  }
  return undefined;
}

function mapTrack(resource: TidalTrackResource, included?: TidalTrackResponse["included"]): NormalizedTrack {
  const attrs = resource.attributes;
  const albumId = resource.relationships?.albums?.data?.[0]?.id;
  const album = included?.find((entry) => entry.type === "albums" && entry.id === albumId);
  return {
    sourceService: "tidal",
    sourceId: resource.id,
    isrc: attrs.isrc ?? undefined,
    title: attrs.title,
    artists: extractArtistNames(resource, included),
    albumName: extractAlbumName(resource, included),
    durationMs: parseDuration(attrs.duration ?? undefined),
    isExplicit: attrs.explicit ?? undefined,
    artworkUrl:
      (album ? pickRelatedArtwork(album, included, "coverArt") : undefined) ?? pickLargestTidalImage(attrs.imageLinks),
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
    const response = await tidalFetch(
      `/tracks/${encodeURIComponent(trackId)}?countryCode=US&include=artists,albums,albums.coverArt`,
    );

    if (!response.ok) {
      throw serviceHttpError(Service.Tidal, response.status, ResourceKind.Track, trackId);
    }

    const data: TidalTrackResponse = await response.json();
    return mapTrack(data.data, data.included);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await tidalFetch(
      `/tracks?filter[isrc]=${encodeURIComponent(isrc)}&countryCode=US&include=artists,albums,albums.coverArt`,
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
    // A miss reports the highest score any query alternative reached.
    let bestConfidence = 0;
    for (const text of trackSearchTexts(query)) {
      const data = await searchCatalogue(text, "tracks");
      const tracks = data.data
        .slice(0, TIDAL_SEARCH_CANDIDATE_LIMIT)
        .map((resource) => mapTrack(resource, data.included));
      const { best, confidence } = pickBestCandidate(tracks, (track, index) =>
        scoreCatalogueTrackCandidate(query, track, index),
      );
      bestConfidence = Math.max(bestConfidence, confidence);
      const result = searchMatchResult("track", best, confidence);
      if (result.found) return result;
    }
    return searchMatchResult("track", null, bestConfidence);
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
    const response = await tidalFetch(
      `/albums/${encodeURIComponent(albumId)}?countryCode=US&include=artists,items,coverArt`,
    );

    if (!response.ok) {
      throw serviceHttpError(Service.Tidal, response.status, ResourceKind.Album, albumId);
    }

    const data: TidalAlbumResponse = await response.json();
    return mapAlbum(data.data, data.included);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const response = await tidalFetch(
      `/albums?filter[barcodeId]=${encodeURIComponent(upc)}&countryCode=US&include=artists,coverArt`,
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
    const albums = (data.data ?? [])
      .slice(0, TIDAL_SEARCH_CANDIDATE_LIMIT)
      .map((resource) => mapAlbum(resource, data.included));
    const { best, confidence } = pickBestCandidate(albums, (album) => scoreAlbumCandidate(query, album));
    return searchMatchResult("album", best, confidence);
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
    const response = await tidalFetch(`/artists/${encodeURIComponent(artistId)}?countryCode=US&include=profileArt`);

    if (!response.ok) {
      throw serviceHttpError(Service.Tidal, response.status, ResourceKind.Artist, artistId);
    }

    const data = await response.json();
    return mapArtist(data.data, data.data.attributes.name, data.included);
  },

  /**
   * Scores artist names without confusing included-resource order with rank.
   * @param query - Artist name to compare against the ranked relationship.
   * @returns The best qualifying artist and its independently supplied portrait.
   * @throws Search transport and JSON:API contract failures.
   */
  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const data = await searchCatalogue(query.name, "artists");
    const included = data.included ?? [];
    // Names come from the included resource, so a hit without one is skipped.
    const named = (data.data ?? []).slice(0, TIDAL_SEARCH_CANDIDATE_LIMIT).flatMap((item) => {
      const resource = included.find((entry) => entry.id === item.id && entry.type === "artists");
      const name = resource?.attributes?.name;
      return resource && name ? [{ id: item.id, name, resource }] : [];
    });
    const ranked = rankByArtistName(query.name, named, (hit) => hit.name);
    if (!ranked) return searchMatchResult("artist", null, 0);

    const { name, resource } = ranked.item;
    return searchMatchResult("artist", mapArtist(resource, name, data.included), ranked.confidence);
  },
} satisfies ServiceAdapter & Record<string, unknown>;
