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
 * body rather than HTTP status codes. The lookups and searches read their
 * answers through `deezerGet`, which treats code `800` ("no data") as
 * a miss and every other error as a failure, so a rate limit is never
 * recorded as "Deezer does not carry this track". `getTrack`, `getAlbum` and
 * `getArtist` keep `isDeezerError` and report the object as not found.
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
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { CANDIDATE_MIN_CONFIDENCE, MATCH_MIN_CONFIDENCE, MAX_CANDIDATES } from "../../constants.js";
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
import {
  isTrackSearchFallbackMatch,
  scoreCatalogueTrackCandidate,
  trackSearchTexts,
} from "../_shared/track-search-query.js";
import { pickDeezerArtistImage } from "./artist-image.js";
import { deezerFetch, deezerGet } from "./deezer-response.js";

const DEEZER_TRACK_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/;
const DEEZER_ALBUM_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/;
const DEEZER_ARTIST_REGEX = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/;

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

interface DeezerArtistSearchResponse {
  data?: Array<{
    id: number;
    name: string;
    picture_xl?: string;
    picture_big?: string;
    picture_medium?: string;
    link?: string;
  }>;
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

interface DeezerErrorResponse {
  error: { type: string; message: string; code: number };
}

function isDeezerError(data: unknown): data is DeezerErrorResponse {
  return typeof data === "object" && data !== null && "error" in data;
}

/**
 * Builds the Deezer `/search/track` query string. Deezer accepts both a
 * free-text q (when `title === artist` we treat the input as a single
 * blob) and a structured form using `artist:"…" track:"…" album:"…"`
 * field operators. `album:` is appended only when the resolver provided
 * one, mirroring the optional shape of `SearchQuery`.
 */
function buildDeezerQ(query: SearchQuery): string {
  if (isFreeTextSearch(query)) return query.title;
  const base = `artist:"${query.artist}" track:"${query.title}"`;
  return query.album ? `${base} album:"${query.album}"` : base;
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
   * @throws Provider or malformed-response errors rather than accepting corrupt metadata.
   */
  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await deezerFetch(`/track/${encodeURIComponent(trackId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Deezer, response.status, ResourceKind.Track, trackId);
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      throw serviceNotFoundError(Service.Deezer, ResourceKind.Track, trackId, data.error.message);
    }

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
    const items = await searchTrackItems(query, 5);

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < items.length; i++) {
      const track = mapTrack(items[i]);
      const confidence = scoreCatalogueTrackCandidate(query, track, i);
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

    const best = scored[0];
    const bestMatch: MatchResult =
      best.confidence >= MATCH_MIN_CONFIDENCE
        ? { found: true, track: best.track, confidence: best.confidence, matchMethod: "search" }
        : { found: false, confidence: best.confidence, matchMethod: "search" };

    return {
      bestMatch,
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

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const response = await deezerFetch(`/album/${encodeURIComponent(albumId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Deezer, response.status, ResourceKind.Album, albumId);
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      throw serviceNotFoundError(
        Service.Deezer,
        ResourceKind.Album,
        albumId,
        (data as DeezerErrorResponse).error.message,
      );
    }

    return mapAlbum(data as DeezerAlbumResponse);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const data = await deezerGet<DeezerAlbumResponse>(`/album/upc:${encodeURIComponent(upc)}`, "UPC album lookup");
    return data ? mapAlbum(data) : null;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `artist:"${query.artist}" album:"${query.title}"`;
    const data = await deezerGet<DeezerAlbumSearchResponse>(
      `/search/album?q=${encodeURIComponent(q)}&limit=5`,
      "album search",
    );
    const items = data?.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestAlbum: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const album = mapAlbum(item);
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
    const match = DEEZER_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const response = await deezerFetch(`/artist/${encodeURIComponent(artistId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Deezer, response.status, ResourceKind.Artist, artistId);
    }

    const data = await response.json();

    if (isDeezerError(data)) {
      throw serviceNotFoundError(Service.Deezer, ResourceKind.Artist, artistId, data.error.message);
    }

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

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const data = await deezerGet<DeezerArtistSearchResponse>(
      `/search/artist?q=${encodeURIComponent(query.name)}&limit=5`,
      "artist search",
    );
    const items = data?.data ?? [];

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
          sourceService: "deezer",
          sourceId: String(item.id),
          name: item.name,
          imageUrl: pickDeezerArtistImage(item) ?? undefined,
          webUrl: item.link ?? `https://www.deezer.com/artist/${item.id}`,
        };
      }
    }

    if (!bestArtist || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
