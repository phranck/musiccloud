/**
 * @file Spotify adapter: track + album + artist resolves against the Web API.
 *
 * Credentialed: requires `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`
 * from the Spotify Developer Dashboard. Token lifecycle goes through
 * the shared `TokenManager` (OAuth 2.0 client credentials flow).
 *
 * Spotify plays three distinct roles in the resolve pipeline:
 *
 * 1. **Disambiguation source.** The text-search variant with
 *    candidates (`searchTrackWithCandidates`) is implemented here and
 *    used by the POST resolve endpoint when the user enters free
 *    text and multiple plausible matches exist. The registry owns
 *    discovery order; this adapter does not assume it is the first source.
 *    Structured candidate ranking uses the shared recording-identity policy.
 * 2. **Artwork provider.** Catalog metadata can supply a missing recording
 *    cover. `services/recording-artwork.ts` owns persistence, while the shared
 *    artwork policy decides which observations may supply that cover.
 * 3. **Genre provider.** `getArtist` forwards optional genres as enrichment.
 *    Callers tolerate their absence rather than treating this provider as
 *    a guaranteed source of that field.
 *
 * ## Two search methods
 *
 * `searchTrack` (one-shot match) and `searchTrackWithCandidates`
 * (disambiguation) coexist because the cross-service resolve
 * (resolver.ts) calls `searchTrack` with structured queries and does
 * not need candidates, while the POST route calls
 * `searchTrackWithCandidates` for free-text input so it can surface
 * a picker UI.
 *
 * ## Structured vs free-text query syntax
 *
 * Both search methods branch on `isFreeTextSearch(query)` (the
 * resolver's free-text signal). Structured queries use Spotify's
 * field syntax (`track:X artist:Y album:Z`) which scopes the search
 * to those fields; free-text queries pass the raw string, trusting
 * Spotify's relevance ranking.
 *
 * ## Preview URL expiry
 *
 * The optional preview field is forwarded when Spotify reports it; metadata
 * alone does not prove that the clip remains playable. Expiry parsing and
 * response-level preference belong to `lib/preview-url.ts`, which the resolver
 * uses when selecting usable provider observations.
 *
 * ## `intl-<locale>` URL prefix
 *
 * Spotify URLs can include an optional `intl-de` / `intl-fr` segment
 * inserted by the web player in localized regions. The regexes allow
 * both the base and the intl-prefixed forms.
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { TokenManager } from "../../../lib/infra/token-manager";
import type { ResolveError } from "../../../lib/resolve/errors";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
import { CANDIDATE_MIN_CONFIDENCE, MAX_CANDIDATES, SPOTIFY_SEARCH_LIMIT_MAX } from "../../constants.js";
import type {
  AdapterCapabilities,
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
import { artistSearchNames, uniqueArtistNames } from "../_shared/artists.js";
import { isFreeTextSearch, scoreAlbumCandidate, scoreSearchCandidate } from "../_shared/confidence.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
import { pickBestCandidate, rankByArtistName, searchMatchResult } from "../_shared/rank.js";
import { fetchSpotifyOEmbed } from "./oembed.js";

const SPOTIFY_TRACK_REGEX = /(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:intl-\w+\/)?track\/([a-zA-Z0-9]+)/;
const SPOTIFY_URI_REGEX = /spotify:track:([a-zA-Z0-9]+)/;
const SPOTIFY_ALBUM_REGEX = /(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:intl-\w+\/)?album\/([a-zA-Z0-9]+)/;
const SPOTIFY_ARTIST_REGEX = /(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:intl-\w+\/)?artist\/([a-zA-Z0-9]+)/;

const API_BASE = "https://api.spotify.com/v1";

const tokenManager = new TokenManager({
  serviceName: "Spotify",
  tokenUrl: "https://accounts.spotify.com/api/token",
  clientIdEnv: "SPOTIFY_CLIENT_ID",
  clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
});

async function spotifyFetch(endpoint: string): Promise<Response> {
  const token = await tokenManager.getAccessToken();
  return fetchWithTimeout(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
}

function mapTrack(raw: SpotifyTrackResponse): NormalizedTrack {
  return {
    sourceService: "spotify",
    sourceId: raw.id,
    isrc: raw.external_ids?.isrc,
    title: raw.name,
    artists: raw.artists.map((a: { name: string }) => a.name),
    albumName: raw.album?.name,
    durationMs: raw.duration_ms,
    releaseDate: raw.album?.release_date,
    isExplicit: raw.explicit,
    artworkUrl: raw.album?.images?.[0]?.url,
    previewUrl: raw.preview_url ?? undefined,
    webUrl: raw.external_urls?.spotify ?? `https://open.spotify.com/track/${raw.id}`,
  };
}

// Minimal types for the Spotify API album response fields we use
interface SpotifyAlbumTrack {
  id: string;
  name: string;
  track_number: number;
  duration_ms: number;
  external_ids?: { isrc?: string };
}

interface SpotifyAlbumResponse {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  release_date?: string;
  total_tracks?: number;
  images?: Array<{ url: string; width: number; height: number }>;
  external_ids?: { upc?: string };
  label?: string;
  external_urls?: { spotify?: string };
  tracks?: { items: SpotifyAlbumTrack[] };
}

interface SpotifyAlbumSearchResponse {
  albums?: { items: SpotifyAlbumResponse[] };
}

function mapAlbum(raw: SpotifyAlbumResponse): NormalizedAlbum {
  return {
    sourceService: "spotify",
    sourceId: raw.id,
    upc: raw.external_ids?.upc,
    title: raw.name,
    artists: raw.artists.map((a) => a.name),
    releaseDate: raw.release_date,
    totalTracks: raw.total_tracks,
    artworkUrl: raw.images?.[0]?.url,
    label: raw.label,
    webUrl: raw.external_urls?.spotify ?? `https://open.spotify.com/album/${raw.id}`,
    tracks: raw.tracks?.items.map((t) => ({
      title: t.name,
      trackNumber: t.track_number,
      durationMs: t.duration_ms,
      isrc: t.external_ids?.isrc,
    })),
  };
}

// Minimal type for the Spotify API track response fields we use
interface SpotifyTrackResponse {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album?: {
    name: string;
    release_date?: string;
    images?: Array<{ url: string; width: number; height: number }>;
  };
  duration_ms: number;
  explicit: boolean;
  preview_url?: string | null;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
}

/** Public artist fields consumed by direct retrieval and search normalization. */
interface SpotifyArtistResponse {
  id: string;
  name: string;
  images?: Array<{ url: string }>;
  genres?: string[];
  external_urls?: { spotify?: string };
}

const capabilities: AdapterCapabilities = {
  supportsIsrc: true,
  supportsPreview: true,
  supportsArtwork: true,
};

/** How many query alternatives the one-shot track search tries at most: `6`. */
const SPOTIFY_TRACK_SEARCH_VARIANT_LIMIT = 6;

/** How many of an artist's genres the adapter forwards: the first `5` Spotify lists. */
const SPOTIFY_ARTIST_GENRE_LIMIT = 5;

/**
 * Maps a Spotify artist to the shared artist shape, for both lookup and search.
 *
 * @param raw - An artist object from `/artists/{id}` or an artist search page.
 * @returns The artist with its first image, at most
 *   {@link SPOTIFY_ARTIST_GENRE_LIMIT} genres, and its Spotify page, which falls
 *   back to the canonical artist URL when Spotify sends none.
 */
function mapArtist(raw: SpotifyArtistResponse): NormalizedArtist {
  return {
    sourceService: "spotify",
    sourceId: raw.id,
    name: raw.name,
    imageUrl: raw.images?.[0]?.url,
    genres: raw.genres?.slice(0, SPOTIFY_ARTIST_GENRE_LIMIT),
    webUrl: raw.external_urls?.spotify ?? `https://open.spotify.com/artist/${raw.id}`,
  };
}

/**
 * Expands explicit collaboration credits without changing the original query.
 *
 * @param query - Known artist metadata or its primary artist fallback.
 * @returns Ordered, case-insensitively distinct full credits and component names.
 */
function buildArtistSearchTerms(query: SearchQuery): string[] {
  const credits = query.artists?.length ? query.artists : [query.artist];
  return uniqueArtistNames([...credits.flatMap(artistSearchNames), query.artist]);
}

/**
 * Joins Spotify field filters for the fields a search names.
 *
 * A field left out, such as the title of a search for an artist alone, gets no
 * filter, because an empty `track:` asks for something nobody typed.
 *
 * @param title - Track title, or an empty string when the search names none.
 * @param artist - Artist name, or an empty string when the search names none.
 * @param album - Optional album title.
 * @returns The `track:`, `artist:` and `album:` filters that have a value, in that order.
 */
function spotifyFieldFilters(title: string, artist: string, album?: string): string {
  return [title.trim() && `track:${title}`, artist.trim() && `artist:${artist}`, album?.trim() && `album:${album}`]
    .filter(Boolean)
    .join(" ");
}

/**
 * Builds the bounded query alternatives the one-shot track search tries in turn.
 *
 * @param query - Free text, or structured metadata that may leave out the title or the artist.
 * @returns The free text alone, or up to {@link SPOTIFY_TRACK_SEARCH_VARIANT_LIMIT}
 *   trimmed, case-insensitively distinct filtered and plain variants across the
 *   artist credits, without empty filters.
 */
function buildSpotifyTrackSearchQueries(query: SearchQuery): string[] {
  if (isFreeTextSearch(query)) return [query.title];

  const variants = buildArtistSearchTerms(query).flatMap((artist) => [
    spotifyFieldFilters(query.title, artist, query.album),
    spotifyFieldFilters(query.title, artist),
    `${query.title} ${artist}`,
  ]);
  variants.push(query.album ? `${query.title} ${query.album}` : query.title);
  return uniqueArtistNames(variants).slice(0, SPOTIFY_TRACK_SEARCH_VARIANT_LIMIT);
}

/** Error code a partial track search logs when it still finds a positive match: `MC-API-0004`. */
const SPOTIFY_PARTIAL_SEARCH_ERROR_CODE = "MC-API-0004";

/**
 * Builds the service error for a failed track search request.
 *
 * @param status - HTTP status of the failed Spotify search request.
 * @param title - Searched title, which the error reports as the resource id.
 * @returns The `ResolveError` that `serviceHttpError` maps for a Spotify track search.
 */
function spotifyTrackSearchError(status: number, title: string): ResolveError {
  return serviceHttpError(Service.Spotify, status, ResourceKind.Track, title, Operation.Search);
}

/**
 * Logs a track search that found a positive match although some requests failed.
 *
 * @param operation - Search phase that lost requests, such as `track_search_alternatives`.
 * @param outcome - What the search returned despite the loss, such as `positive_partial_queries`.
 * @param error - The service error of the last failed request, logged as the cause.
 * @param status - HTTP status of the last failed request; the record has no `status` field when it is `undefined`, which is the default.
 */
function logPartialTrackSearch(operation: string, outcome: string, error: ResolveError, status?: number): void {
  log.deviation(
    {
      component: "Spotify",
      adapterId: Service.Spotify,
      errorCode: SPOTIFY_PARTIAL_SEARCH_ERROR_CODE,
      operation,
      outcome,
      ...(status === undefined ? {} : { status }),
    },
    error,
  );
}

export const spotifyAdapter = {
  id: "spotify",
  displayName: getPlatformLabel("spotify"),
  capabilities,

  detectUrl(url: string): string | null {
    const trackMatch = SPOTIFY_TRACK_REGEX.exec(url);
    if (trackMatch) return trackMatch[1];

    const uriMatch = SPOTIFY_URI_REGEX.exec(url);
    if (uriMatch) return uriMatch[1];

    return null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await spotifyFetch(`/tracks/${encodeURIComponent(trackId)}`);

    // Track-by-ID can return 404 when the track is not available in the API
    // region (Feb-2026 change: `linked_from` was permanently removed). Fall
    // through to the keyless oEmbed endpoint so the resolver can still cross-
    // service-search via Title+Artist. Any other non-OK status is a real
    // error and propagates as before.
    if (response.status === 404) {
      const embed = await fetchSpotifyOEmbed(`https://open.spotify.com/track/${trackId}`);
      if (embed) {
        return {
          sourceService: Service.Spotify,
          sourceId: trackId,
          title: embed.title,
          artists: embed.artists,
          webUrl: `https://open.spotify.com/track/${trackId}`,
        };
      }
    }

    if (!response.ok) {
      throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Track, trackId);
    }

    const data: SpotifyTrackResponse = await response.json();
    return mapTrack(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const query = encodeURIComponent(`isrc:${isrc}`);
    const response = await spotifyFetch(`/search?type=track&q=${query}&limit=1`);

    if (!response.ok) {
      throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Track, isrc, Operation.IsrcLookup);
    }

    const data = await response.json();
    const items = requireProviderCollection<SpotifyTrackResponse>(data.tracks?.items, Service.Spotify, "ISRC lookup");

    if (items.length === 0) return null;

    return mapTrack(items[0]);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const itemsById = new Map<string, SpotifyTrackResponse>();
    let lastFailedStatus = 0;

    for (const searchQuery of buildSpotifyTrackSearchQueries(query)) {
      const q = encodeURIComponent(searchQuery);
      const response = await spotifyFetch(`/search?type=track&q=${q}&limit=5`);

      if (!response.ok) {
        lastFailedStatus = response.status;
        continue;
      }
      const data = await response.json();
      const items = requireProviderCollection<SpotifyTrackResponse>(
        data.tracks?.items,
        Service.Spotify,
        "track search",
      );
      for (const item of items) {
        if (!itemsById.has(item.id)) itemsById.set(item.id, item);
      }
    }

    const { best, confidence } = pickBestCandidate(Array.from(itemsById.values(), mapTrack), (track, index) =>
      scoreSearchCandidate(query, track, index),
    );
    const result = searchMatchResult("track", best, confidence);

    if (lastFailedStatus) {
      const error = spotifyTrackSearchError(lastFailedStatus, query.title);
      // A failed alternative may contain the recording; it cannot become a cached miss.
      if (!result.found) throw error;
      logPartialTrackSearch("track_search_alternatives", "positive_partial_queries", error, lastFailedStatus);
    }
    return result;
  },

  /**
   * Ranks bounded provider pages under the same identity rules as plain search.
   * @param query - Free text or known recording metadata, including artist and duration evidence.
   * @returns Ranked candidates; a partial page sequence requires a qualifying positive match.
   * @throws Provider failures when incomplete pages would otherwise become negative evidence.
   */
  async searchTrackWithCandidates(query: SearchQuery): Promise<SearchResultWithCandidates> {
    log.debug("Spotify", "searchTrackWithCandidates called with:", query);
    const isFreeText = isFreeTextSearch(query);
    const q = encodeURIComponent(
      isFreeText ? query.title : spotifyFieldFilters(query.title, query.artist, query.album),
    );

    log.debug("Spotify", "Search query string:", q);

    const items: SpotifyTrackResponse[] = [];
    let lastFailedStatus = 0;
    for (let offset = 0; offset < MAX_CANDIDATES; offset += SPOTIFY_SEARCH_LIMIT_MAX) {
      const limit = Math.min(SPOTIFY_SEARCH_LIMIT_MAX, MAX_CANDIDATES - offset);
      const response = await spotifyFetch(`/search?type=track&q=${q}&limit=${limit}&offset=${offset}`);

      log.debug("Spotify", "API response status:", response.status, response.ok, "offset:", offset);

      if (!response.ok) {
        lastFailedStatus = response.status;
        if (items.length > 0) break;
        throw spotifyTrackSearchError(response.status, query.title);
      }

      const data = await response.json();
      const pageItems = requireProviderCollection<SpotifyTrackResponse>(
        data.tracks?.items,
        Service.Spotify,
        "candidate search",
      );
      items.push(...pageItems);
      if (pageItems.length < limit) break;
    }

    if (items.length === 0) {
      return {
        bestMatch: { found: false, confidence: 0, matchMethod: "search" },
        candidates: [],
      };
    }

    const scored: Array<{ track: NormalizedTrack; confidence: number }> = [];

    for (let i = 0; i < items.length; i++) {
      const track = mapTrack(items[i]);
      const confidence = scoreSearchCandidate(query, track, i);
      scored.push({ track, confidence });
    }

    scored.sort((a, b) => b.confidence - a.confidence);

    const best = scored[0];
    const bestMatch = searchMatchResult("track", best.track, best.confidence);

    if (lastFailedStatus) {
      const error = spotifyTrackSearchError(lastFailedStatus, query.title);
      if (!bestMatch.found) throw error;
      logPartialTrackSearch("track_candidate_pagination", "positive_partial_candidates", error);
    }
    return {
      bestMatch,
      candidates: scored.filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE),
    };
  },
  // --- Album support ---

  albumCapabilities: {
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  } satisfies AlbumCapabilities,

  detectAlbumUrl(url: string): string | null {
    const match = SPOTIFY_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const response = await spotifyFetch(`/albums/${encodeURIComponent(albumId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Album, albumId);
    }

    const data: SpotifyAlbumResponse = await response.json();
    return mapAlbum(data);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const response = await spotifyFetch(`/search?type=album&q=${encodeURIComponent(`upc:${upc}`)}&limit=1`);

    if (!response.ok) {
      throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Album, upc, Operation.UpcLookup);
    }

    const data: SpotifyAlbumSearchResponse = await response.json();
    const items = requireProviderCollection(data.albums?.items, Service.Spotify, "UPC lookup");
    if (items.length === 0) return null;

    return mapAlbum(items[0]);
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `album:${query.title} artist:${query.artist}`;
    const response = await spotifyFetch(`/search?type=album&q=${encodeURIComponent(q)}&limit=5`);

    if (!response.ok) {
      throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Album, query.title, Operation.Search);
    }

    const data: SpotifyAlbumSearchResponse = await response.json();
    const items = requireProviderCollection(data.albums?.items, Service.Spotify, "album search");

    const { best, confidence } = pickBestCandidate(items.map(mapAlbum), (album) => scoreAlbumCandidate(query, album));
    return searchMatchResult("album", best, confidence);
  },

  // --- Artist support ---

  artistCapabilities: {
    supportsArtistSearch: true,
  } satisfies ArtistCapabilities,

  detectArtistUrl(url: string): string | null {
    const match = SPOTIFY_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const response = await spotifyFetch(`/artists/${encodeURIComponent(artistId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Artist, artistId);
    }

    const data: SpotifyArtistResponse = await response.json();
    return mapArtist(data);
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const response = await spotifyFetch(`/search?type=artist&q=${encodeURIComponent(query.name)}&limit=5`);

    if (!response.ok) {
      throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Artist, query.name, Operation.Search);
    }

    const data = await response.json();
    const items = requireProviderCollection<SpotifyArtistResponse>(
      data.artists?.items,
      Service.Spotify,
      "artist search",
    );

    const ranked = rankByArtistName(query.name, items, (item) => item.name);
    return searchMatchResult("artist", ranked && mapArtist(ranked.item), ranked?.confidence ?? 0);
  },
} satisfies ServiceAdapter & Record<string, unknown>;
