/**
 * @file Deezer metadata adapter for tracks, albums, and artists.
 *
 * Requests use the keyless public API at `api.deezer.com`. Identifier lookups,
 * album tracklists, and previews make it useful as an initial recording source.
 * The resolver prefers Deezer previews, but encoded expiry is still parsed by
 * `lib/preview-url.ts`; preference does not mean a signed URL cannot expire.
 *
 * ## Error shape
 *
 * Deezer signals errors by returning `200 OK` with an `{ error: { ... } }`
 * body rather than HTTP status codes. Every lookup and search reads its
 * answer through `readDeezerJson`, which treats code `800` ("no data") as
 * a miss and every other error as a failure, so a rate limit is never
 * recorded as "Deezer does not carry this track". `getTrack`, `getAlbum` and
 * `getArtist` turn that miss into the per-service not-found error, and a
 * refused request stays an `UpstreamUnavailableError`.
 *
 * ## Bounded catalogue search
 *
 * Both recording search entry points use `searchTrackItems`. A structured query
 * is followed by bounded plain-text alternatives when it produces no compatible
 * result. Video credits and social handles remain display metadata; only a
 * separate lookup term removes their suffix. A free-text input retains its
 * candidate-ranking semantics.
 *
 * Broad alternatives are constrained by the original artist, title, available
 * duration, and version in `track-search-query.ts`. A provider's ranking alone
 * cannot establish a structured recording match. Required recording fields and
 * consumed optional metadata are validated before mapping, so malformed success
 * responses cannot be remembered as clean catalogue misses.
 *
 * ## Top-track preview heuristic
 *
 * For album resolves, the "most popular track preview" is derived
 * by picking the track with the highest `rank` field. This goes
 * into `topTrackPreviewUrl` which is what the album share page's
 * inline player uses.
 *
 * ## Artwork size
 *
 * Album responses include multiple cover sizes; `cover_xl` is
 * roughly 1000x1000, `cover_big` roughly 500x500. The adapter
 * prefers `cover_xl` with `cover_big` as fallback to keep the share
 * page rendering sharp at retina resolutions.
 */
import { getPlatformLabel, ResourceKind, Service } from "@musiccloud/shared";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { CANDIDATE_MIN_CONFIDENCE, MAX_CANDIDATES } from "../../constants.js";
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
  SearchResultWithCandidates,
  ServiceAdapter,
} from "../../types.js";
import { isFreeTextSearch, scoreAlbumCandidate } from "../_shared/confidence.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
import { pickBestCandidate, searchMatchResult } from "../_shared/rank.js";
import {
  isTrackSearchFallbackMatch,
  scoreCatalogueTrackCandidate,
  trackSearchTexts,
} from "../_shared/track-search-query.js";
import { pickDeezerArtistImage } from "./artist-image.js";
import { type DeezerArtistSearchHit, rankDeezerArtistSearch } from "./artist-search.js";
import { deezerFetch, deezerGet, readDeezerJson } from "./deezer-response.js";

const DEEZER_TRACK_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/;
const DEEZER_ALBUM_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/;
const DEEZER_ARTIST_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/;

/**
 * How many hits the one-shot track and album searches ask Deezer for: `5`.
 * The candidate search asks for `MAX_CANDIDATES` instead.
 */
const DEEZER_SEARCH_LIMIT = 5;

// Minimal type for the Deezer API track response fields we use
interface DeezerTrackResponse {
  id: number;
  title: string;
  artist: { name: string };
  album?: {
    title?: string;
    cover_xl?: string;
    cover_big?: string;
    release_date?: string;
  };
  duration: number; // in seconds
  isrc?: string;
  explicit_lyrics?: boolean;
  preview?: string;
  link?: string;
}

interface DeezerSearchResponse {
  data: DeezerTrackResponse[];
  total: number;
}

interface DeezerAlbumTrack {
  id: number;
  title: string;
  isrc?: string;
  track_position: number;
  duration: number; // seconds
  rank?: number;
  preview?: string;
}

interface DeezerAlbumResponse {
  id: number;
  title: string;
  artist: { name: string };
  release_date?: string;
  nb_tracks?: number;
  cover_xl?: string;
  cover_big?: string;
  upc?: string;
  label?: string;
  link: string;
  tracks?: { data: DeezerAlbumTrack[] };
}

interface DeezerAlbumSearchResponse {
  data: DeezerAlbumResponse[];
  total: number;
}

function mapAlbum(raw: DeezerAlbumResponse): NormalizedAlbum {
  const tracks = raw.tracks?.data ?? [];
  // Pick the track with the highest rank as "most popular"
  const topTrack = tracks.reduce<DeezerAlbumTrack | undefined>(
    (best, t) => (t.rank !== undefined && (best === undefined || t.rank > (best.rank ?? 0)) ? t : best),
    undefined,
  );

  return {
    sourceService: "deezer",
    sourceId: String(raw.id),
    upc: raw.upc,
    title: raw.title,
    artists: [raw.artist.name],
    releaseDate: raw.release_date,
    totalTracks: raw.nb_tracks,
    artworkUrl: raw.cover_xl ?? raw.cover_big,
    label: raw.label,
    webUrl: raw.link ?? `https://www.deezer.com/album/${raw.id}`,
    topTrackPreviewUrl: topTrack?.preview,
    tracks: tracks.map((t) => ({
      title: t.title,
      trackNumber: t.track_position,
      durationMs: t.duration * 1000,
      isrc: t.isrc,
    })),
  };
}

/**
 * Looks one Deezer object up by its id, for `getTrack`, `getAlbum` and
 * `getArtist`.
 *
 * Only Deezer's "no data" answer means the object does not exist. Every other
 * error body, such as code `4` for the quota, is a failure, so a link Deezer
 * carries is never answered with "not found" while Deezer refuses requests.
 *
 * @param path - The lookup path below the API root, such as `/track/3135556`.
 * @param kind - What is looked up, which names the resource in the error.
 * @param id - The Deezer id being looked up, as the caller received it.
 * @returns The parsed object, not yet validated.
 * @throws {ResolveError} with the per-service HTTP code from `serviceHttpError`
 *   for an error status, or the per-service not-found code from
 *   `serviceNotFoundError` when Deezer has no such object.
 * @throws {UpstreamUnavailableError} for any other error body or a body that
 *   is not JSON.
 */
async function lookupDeezerObject<Body>(path: string, kind: ResourceKind, id: string): Promise<Body> {
  const response = await deezerFetch(path);

  if (!response.ok) {
    throw serviceHttpError(Service.Deezer, response.status, kind, id);
  }

  const data = await readDeezerJson<Body>(response, `${kind} lookup`);
  if (data === null) {
    throw serviceNotFoundError(Service.Deezer, kind, id);
  }
  return data;
}

/**
 * Builds the Deezer `/search/track` query string. Deezer accepts both a
 * free-text q (when `title === artist` we treat the input as a single
 * blob) and a structured form using `artist:"…" track:"…" album:"…"`
 * field operators. A field the query leaves out, such as the title of a
 * search for an artist alone, gets no operator, because an empty
 * `track:""` asks for a recording without a title.
 */
function buildDeezerQ(query: SearchQuery): string {
  if (isFreeTextSearch(query)) return query.title;
  return [
    query.artist.trim() && `artist:"${query.artist}"`,
    query.title.trim() && `track:"${query.title}"`,
    query.album?.trim() && `album:"${query.album}"`,
  ]
    .filter(Boolean)
    .join(" ");
}

function mapTrack(raw: DeezerTrackResponse): NormalizedTrack {
  return {
    sourceService: "deezer",
    sourceId: String(raw.id),
    isrc: raw.isrc ?? undefined,
    title: raw.title,
    artists: [raw.artist.name],
    albumName: raw.album?.title ?? undefined,
    durationMs: raw.duration * 1000,
    releaseDate: raw.album?.release_date,
    isExplicit: raw.explicit_lyrics ?? undefined,
    artworkUrl: raw.album?.cover_xl ?? raw.album?.cover_big ?? undefined,
    previewUrl: raw.preview ?? undefined,
    webUrl: raw.link ?? `https://www.deezer.com/track/${raw.id}`,
  };
}

/**
 * Validates consumed recording fields before mapping or scoring upstream data.
 *
 * @param value - Untrusted track object from direct lookup or search.
 * @throws UpstreamUnavailableError for malformed metadata instead of a clean miss.
 */
function assertDeezerRecording(value: unknown): asserts value is DeezerTrackResponse {
  if (!value || typeof value !== "object")
    throw new UpstreamUnavailableError("deezer", "track response omitted recording data");
  const record = value as Partial<DeezerTrackResponse>;
  const required =
    typeof record.id === "number" &&
    Number.isSafeInteger(record.id) &&
    record.id > 0 &&
    typeof record.title === "string" &&
    record.title.trim().length > 0 &&
    typeof record.artist?.name === "string" &&
    record.artist.name.trim().length > 0 &&
    typeof record.duration === "number" &&
    Number.isFinite(record.duration) &&
    record.duration >= 0;
  const strings = [
    record.isrc,
    record.preview,
    record.link,
    record.album?.title,
    record.album?.cover_xl,
    record.album?.cover_big,
    record.album?.release_date,
  ];
  if (
    !required ||
    strings.some((field) => field != null && typeof field !== "string") ||
    (record.explicit_lyrics != null && typeof record.explicit_lyrics !== "boolean") ||
    (record.album != null && (typeof record.album !== "object" || Array.isArray(record.album)))
  ) {
    throw new UpstreamUnavailableError("deezer", "track response contains malformed recording data");
  }
}

/**
 * Reads bounded search alternatives through one validated catalogue boundary.
 *
 * @param query - Original metadata; broader request strings never replace it.
 * @param limit - Candidate cap for the one-shot or disambiguation caller.
 * @returns Plausible recordings from the first successful alternative.
 * @throws {UpstreamUnavailableError} when the provider fails or its shape drifts.
 */
async function searchTrackItems(query: SearchQuery, limit: number): Promise<DeezerTrackResponse[]> {
  const alternatives = [...new Set([buildDeezerQ(query), ...trackSearchTexts(query)])];
  for (const text of alternatives) {
    const data = await deezerGet<DeezerSearchResponse>(
      `/search/track?q=${encodeURIComponent(text)}&limit=${limit}`,
      "track search",
    );
    if (!data) continue;
    if (!Array.isArray(data.data))
      throw new UpstreamUnavailableError("deezer", "track search omitted its recording collection");
    data.data.forEach(assertDeezerRecording);
    const items = data.data.filter((item) => isTrackSearchFallbackMatch(query, mapTrack(item)));
    if (items.length > 0) return items;
  }
  return [];
}

/**
 * Deezer provider boundary. Recording searches share one validated, bounded
 * lookup path so direct matching and interactive candidates obey the same rules.
 */
export const deezerAdapter = {
  id: "deezer",
  displayName: getPlatformLabel("deezer"),
  capabilities: {
    supportsIsrc: true,
    supportsPreview: true,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = DEEZER_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  /**
   * Fetches source metadata and validates consumed fields before normalization.
   * @param trackId - Deezer recording id from URL detection or candidate selection.
   * @returns Recording metadata with identifiers, preview, and supplied artwork.
   * @throws {ResolveError} for an error status, or when Deezer has no such recording.
   * @throws {UpstreamUnavailableError} when Deezer refused the request, such as
   *   for the quota, or answered with malformed metadata.
   */
  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const data = await lookupDeezerObject<unknown>(
      `/track/${encodeURIComponent(trackId)}`,
      ResourceKind.Track,
      trackId,
    );
    assertDeezerRecording(data);
    return mapTrack(data);
  },

  /**
   * Looks up the strongest available recording identifier before text fallback.
   * @param isrc - Recording identifier reported by a validated source.
   * @returns Validated metadata or null for the provider's explicit no-data answer.
   * @throws Upstream failures, which must not become negative catalogue entries.
   */
  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const data = await deezerGet<DeezerTrackResponse>(`/track/isrc:${encodeURIComponent(isrc)}`, "ISRC lookup");
    if (!data) return null;
    assertDeezerRecording(data);
    return mapTrack(data);
  },

  /**
   * Matches bounded catalogue alternatives against the original recording identity.
   * @param query - Free text or structured source metadata, retained unchanged.
   * @returns The best qualifying recording from the first compatible query result.
   * @throws Upstream and response-contract failures instead of a clean miss.
   */
  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const items = await searchTrackItems(query, DEEZER_SEARCH_LIMIT);
    const { best, confidence } = pickBestCandidate(items.map(mapTrack), (track, index) =>
      scoreCatalogueTrackCandidate(query, track, index),
    );
    return searchMatchResult("track", best, confidence);
  },

  /**
   * Multi-result search returning ranked candidates for the
   * disambiguation flow. Mirrors the Spotify implementation: ranks via
   * the shared `scoreCatalogueTrackCandidate`, returns up to `MAX_CANDIDATES`
   * filtered by `CANDIDATE_MIN_CONFIDENCE` so the UI never receives a
   * candidate it would render as confidently-wrong.
   *
   * Discovery follows registry order, so its first matching provider needs
   * candidates rather than silently resolving an ambiguous free-text result.
   *
   * @param query - Original user text or structured recording metadata.
   * @returns Ranked candidates under the shared thresholds without altering titles.
   */
  async searchTrackWithCandidates(query: SearchQuery): Promise<SearchResultWithCandidates> {
    const items = await searchTrackItems(query, MAX_CANDIDATES);

    if (items.length === 0) {
      return {
        bestMatch: { found: false, confidence: 0, matchMethod: "search" },
        candidates: [],
      };
    }

    const scored: Array<{ track: NormalizedTrack; confidence: number }> = items.map((raw, i) => {
      const track = mapTrack(raw);
      return { track, confidence: scoreCatalogueTrackCandidate(query, track, i) };
    });

    scored.sort((a, b) => b.confidence - a.confidence);

    // The sort is stable, so the first entry is the earliest of the highest scores.
    const best = scored[0];
    return {
      bestMatch: searchMatchResult("track", best.track, best.confidence),
      candidates: scored.filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE).slice(0, MAX_CANDIDATES),
    };
  },

  // --- Album support ---

  albumCapabilities: {
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  } satisfies AlbumCapabilities,

  detectAlbumUrl(url: string): string | null {
    const match = DEEZER_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  /**
   * Fetches an album with its tracklist, from which the top track's preview is taken.
   * @param albumId - Deezer album id from URL detection or a stored link.
   * @returns The normalized album.
   * @throws {ResolveError} for an error status, or when Deezer has no such album.
   * @throws {UpstreamUnavailableError} when Deezer refused the request, such as
   *   for the quota, or answered with a body that is not JSON.
   */
  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const data = await lookupDeezerObject<DeezerAlbumResponse>(
      `/album/${encodeURIComponent(albumId)}`,
      ResourceKind.Album,
      albumId,
    );
    return mapAlbum(data);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const data = await deezerGet<DeezerAlbumResponse>(`/album/upc:${encodeURIComponent(upc)}`, "UPC album lookup");
    return data ? mapAlbum(data) : null;
  },

  /**
   * Tries the structured album query and one plain alternative against the same identity.
   *
   * @param query - Original album metadata, including any year and track-count evidence.
   * @returns The first qualifying album, or a clean miss after both bounded alternatives.
   * @throws Provider failures, which never permit a negative catalog-cache entry.
   */
  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const alternatives = [
      ...new Set([`artist:"${query.artist}" album:"${query.title}"`, `${query.artist} ${query.title}`.trim()]),
    ];
    // A miss reports the highest score any alternative reached.
    let bestConfidence = 0;

    for (const text of alternatives) {
      const data = await deezerGet<DeezerAlbumSearchResponse>(
        `/search/album?q=${encodeURIComponent(text)}&limit=${DEEZER_SEARCH_LIMIT}`,
        "album search",
      );
      const items = data === null ? [] : requireProviderCollection(data.data, Service.Deezer, "album search");
      const { best, confidence } = pickBestCandidate(items.map(mapAlbum), (album) => scoreAlbumCandidate(query, album));
      bestConfidence = Math.max(bestConfidence, confidence);
      const result = searchMatchResult("album", best, confidence);
      if (result.found) return result;
    }
    return searchMatchResult("album", null, bestConfidence);
  },

  // --- Artist support ---

  artistCapabilities: {
    supportsArtistSearch: true,
  } satisfies ArtistCapabilities,

  detectArtistUrl(url: string): string | null {
    const match = DEEZER_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  /**
   * Fetches an artist by id. Deezer's stock silhouette counts as no picture.
   * @param artistId - Deezer artist id from URL detection.
   * @returns The normalized artist.
   * @throws {ResolveError} for an error status, or when Deezer has no such artist.
   * @throws {UpstreamUnavailableError} when Deezer refused the request, such as
   *   for the quota, or answered with a body that is not JSON.
   */
  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const data = await lookupDeezerObject<DeezerArtistSearchHit>(
      `/artist/${encodeURIComponent(artistId)}`,
      ResourceKind.Artist,
      artistId,
    );

    return {
      sourceService: "deezer",
      sourceId: String(data.id),
      name: data.name,
      // Deezer answers a stock silhouette for an artist without a picture. It
      // reads as no image, so the resolver takes another service's picture.
      imageUrl: pickDeezerArtistImage(data) ?? undefined,
      webUrl: data.link ?? `https://www.deezer.com/artist/${data.id}`,
    };
  },

  /**
   * Finds an artist by name through the shared Deezer artist ranking.
   *
   * @param query - The artist name to search for.
   * @returns The hit whose name matches at `MATCH_MIN_CONFIDENCE` or above, or
   *   a miss carrying the best confidence that was reached.
   * @throws {UpstreamUnavailableError} when Deezer did not answer.
   */
  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const best = await rankDeezerArtistSearch(query.name);
    if (best === null) return searchMatchResult("artist", null, 0);

    const { item: hit, confidence } = best;
    const artist: NormalizedArtist = {
      sourceService: "deezer",
      sourceId: String(hit.id),
      name: hit.name,
      imageUrl: pickDeezerArtistImage(hit) ?? undefined,
      webUrl: hit.link ?? `https://www.deezer.com/artist/${hit.id}`,
    };
    return searchMatchResult("artist", artist, confidence);
  },
} satisfies ServiceAdapter & Record<string, unknown>;
