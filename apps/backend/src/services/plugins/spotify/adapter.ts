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
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE, MAX_CANDIDATES, SPOTIFY_SEARCH_LIMIT_MAX } from "../../constants.js";
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
import { artistSearchNames } from "../_shared/artists.js";
import { isFreeTextSearch, scoreAlbumCandidate, scoreSearchCandidate } from "../_shared/confidence.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
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

function pushUnique(values: string[], value: string | undefined): void {
  const normalized = value?.trim();
  if (normalized && !values.some((v) => v.toLowerCase() === normalized.toLowerCase())) values.push(normalized);
}

/**
 * Expands explicit collaboration credits without changing the original query.
 *
 * @param query - Known artist metadata or its primary artist fallback.
 * @returns Ordered, case-insensitively distinct full credits and component names.
 */
function buildArtistSearchTerms(query: SearchQuery): string[] {
  const artists: string[] = [];
  for (const artist of query.artists?.length ? query.artists : [query.artist]) {
    for (const part of artistSearchNames(artist)) pushUnique(artists, part);
  }
  pushUnique(artists, query.artist);
  return artists;
}

function buildSpotifyTrackSearchQueries(query: SearchQuery): string[] {
  if (isFreeTextSearch(query)) return [query.title];

  const variants: string[] = [];
  for (const artist of buildArtistSearchTerms(query)) {
    const scoped = [`track:${query.title}`, `artist:${artist}`];
    if (query.album) scoped.push(`album:${query.album}`);
    pushUnique(variants, scoped.join(" "));
    pushUnique(variants, `track:${query.title} artist:${artist}`);
    pushUnique(variants, `${query.title} ${artist}`);
  }
  pushUnique(variants, query.album ? `${query.title} ${query.album}` : query.title);
  return variants.slice(0, 6);
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

    // Score each result and pick the best match
    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;
    let index = 0;

    for (const item of itemsById.values()) {
      const track = mapTrack(item);
      const confidence = scoreSearchCandidate(query, track, index);
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
      index++;
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      // A failed alternative may contain the recording; it cannot become a cached miss.
      if (lastFailedStatus) {
        throw serviceHttpError(Service.Spotify, lastFailedStatus, ResourceKind.Track, query.title, Operation.Search);
      }
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    if (lastFailedStatus) {
      log.deviation(
        {
          component: "Spotify",
          adapterId: Service.Spotify,
          errorCode: "MC-API-0004",
          operation: "track_search_alternatives",
          outcome: "positive_partial_queries",
          status: lastFailedStatus,
        },
        serviceHttpError(Service.Spotify, lastFailedStatus, ResourceKind.Track, query.title, Operation.Search),
      );
    }
    return {
      found: true,
      track: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
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
    let q: string;

    if (isFreeText) {
      q = encodeURIComponent(query.title);
    } else {
      const parts: string[] = [];
      parts.push(`track:${query.title}`);
      parts.push(`artist:${query.artist}`);
      if (query.album) {
        parts.push(`album:${query.album}`);
      }
      q = encodeURIComponent(parts.join(" "));
    }

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
        throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Track, query.title, Operation.Search);
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
    const bestMatch: MatchResult =
      best.confidence >= MATCH_MIN_CONFIDENCE
        ? { found: true, track: best.track, confidence: best.confidence, matchMethod: "search" }
        : { found: false, confidence: best.confidence, matchMethod: "search" };

    if (lastFailedStatus) {
      const error = serviceHttpError(
        Service.Spotify,
        lastFailedStatus,
        ResourceKind.Track,
        query.title,
        Operation.Search,
      );
      if (!bestMatch.found) throw error;
      log.deviation(
        {
          component: "Spotify",
          adapterId: Service.Spotify,
          errorCode: "MC-API-0004",
          operation: "track_candidate_pagination",
          outcome: "positive_partial_candidates",
        },
        error,
      );
    }
    return {
      bestMatch,
      candidates: scored.filter((c) => c.confidence >= 0.4),
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
    const match = SPOTIFY_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const response = await spotifyFetch(`/artists/${encodeURIComponent(artistId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Spotify, response.status, ResourceKind.Artist, artistId);
    }

    const data = await response.json();

    return {
      sourceService: "spotify",
      sourceId: data.id,
      name: data.name,
      imageUrl: data.images?.[0]?.url,
      genres: data.genres?.slice(0, 5),
      webUrl: data.external_urls?.spotify ?? `https://open.spotify.com/artist/${data.id}`,
    };
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
          sourceService: "spotify",
          sourceId: item.id,
          name: item.name,
          imageUrl: item.images?.[0]?.url,
          genres: item.genres?.slice(0, 5),
          webUrl: item.external_urls?.spotify ?? `https://open.spotify.com/artist/${item.id}`,
        };
      }
    }

    if (!bestArtist || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
