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
 *    text and multiple plausible matches exist. Spotify's search
 *    relevance is the best of the credentialed services, so it is
 *    tried first in that flow.
 * 2. **Artwork provider.** When a source track lacks `artworkUrl`
 *    but has an ISRC, the resolver falls back to Spotify's
 *    `findByIsrc` to pull its artwork. Spotify serves consistent
 *    high-resolution images.
 * 3. **Genre provider.** The artist resolver uses Spotify's
 *    `getArtist` specifically for the `genres` field, which almost
 *    no other service exposes reliably.
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
 * Both search methods branch on `query.title === query.artist` (the
 * resolver's free-text signal). Structured queries use Spotify's
 * field syntax (`track:X artist:Y album:Z`) which scopes the search
 * to those fields; free-text queries pass the raw string, trusting
 * Spotify's relevance ranking.
 *
 * ## Preview URL expiry
 *
 * Spotify preview URLs expire after roughly 30 to 60 days. The
 * resolver deliberately overwrites them with Deezer previews when
 * available (see `resolver.ts`). The `previewUrl` field is still
 * populated here so that Spotify-only tracks have a working preview
 * for that 30-60d window.
 *
 * ## `intl-<locale>` URL prefix
 *
 * Spotify URLs can include an optional `intl-de` / `intl-fr` segment
 * inserted by the web player in localized regions. The regexes allow
 * both the base and the intl-prefixed forms.
 */
import { OPERATION, RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { TokenManager } from "../../../lib/infra/token-manager";
import { calculateAlbumConfidence } from "../../../lib/resolve/normalize";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE, SPOTIFY_SEARCH_LIMIT_MAX } from "../../constants.js";
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
  SearchResultWithCandidates,
  ServiceAdapter,
} from "../../types.js";
import { scoreSearchCandidate } from "../_shared/confidence.js";
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
  preview_url: string | null;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
}

const capabilities: AdapterCapabilities = {
  supportsIsrc: true,
  supportsPreview: true,
  supportsArtwork: true,
};

export const spotifyAdapter = {
  id: "spotify",
  displayName: "Spotify",
  capabilities,

  isAvailable(): boolean {
    return tokenManager.isConfigured();
  },

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
          sourceService: SERVICE.SPOTIFY,
          sourceId: trackId,
          title: embed.title,
          artists: embed.artists,
          webUrl: `https://open.spotify.com/track/${trackId}`,
        };
      }
    }

    if (!response.ok) {
      throw serviceHttpError(SERVICE.SPOTIFY, response.status, RESOURCE_KIND.TRACK, trackId);
    }

    const data: SpotifyTrackResponse = await response.json();
    return mapTrack(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const query = encodeURIComponent(`isrc:${isrc}`);
    const response = await spotifyFetch(`/search?type=track&q=${query}&limit=1`);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.SPOTIFY, response.status, RESOURCE_KIND.TRACK, isrc, OPERATION.ISRC_LOOKUP);
    }

    const data = await response.json();
    const items = data.tracks?.items;

    if (!items || items.length === 0) return null;

    return mapTrack(items[0]);
  },

  async searchTrack(query: { title: string; artist: string; album?: string }): Promise<MatchResult> {
    const isFreeText = query.title === query.artist;
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

    const response = await spotifyFetch(`/search?type=track&q=${q}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const items: SpotifyTrackResponse[] = data.tracks?.items ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    // Score each result and pick the best match
    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < items.length; i++) {
      const track = mapTrack(items[i]);
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

  async searchTrackWithCandidates(query: {
    title: string;
    artist: string;
    album?: string;
  }): Promise<SearchResultWithCandidates> {
    log.debug("Spotify", "searchTrackWithCandidates called with:", query);
    const isFreeText = query.title === query.artist;
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

    const response = await spotifyFetch(`/search?type=track&q=${q}&limit=${SPOTIFY_SEARCH_LIMIT_MAX}`);

    log.debug("Spotify", "API response status:", response.status, response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Spotify", "Search failed:", response.status, errorText);
      return {
        bestMatch: { found: false, confidence: 0, matchMethod: "search" },
        candidates: [],
      };
    }

    const data = await response.json();
    const items: SpotifyTrackResponse[] = data.tracks?.items ?? [];

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
      throw serviceHttpError(SERVICE.SPOTIFY, response.status, RESOURCE_KIND.ALBUM, albumId);
    }

    const data: SpotifyAlbumResponse = await response.json();
    return mapAlbum(data);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const response = await spotifyFetch(`/search?type=album&q=${encodeURIComponent(`upc:${upc}`)}&limit=1`);

    if (!response.ok) {
      log.debug("Spotify", "UPC album lookup failed:", response.status);
      return null;
    }

    const data: SpotifyAlbumSearchResponse = await response.json();
    const items = data.albums?.items ?? [];
    if (items.length === 0) return null;

    return mapAlbum(items[0]);
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `album:${query.title} artist:${query.artist}`;
    const response = await spotifyFetch(`/search?type=album&q=${encodeURIComponent(q)}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data: SpotifyAlbumSearchResponse = await response.json();
    const items = data.albums?.items ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    let bestAlbum: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const album = mapAlbum(item);
      const confidence = calculateAlbumConfidence(
        { title: query.title, artists: [query.artist], releaseDate: query.year, totalTracks: query.totalTracks },
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
    const match = SPOTIFY_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const response = await spotifyFetch(`/artists/${encodeURIComponent(artistId)}`);

    if (!response.ok) {
      throw serviceHttpError(SERVICE.SPOTIFY, response.status, RESOURCE_KIND.ARTIST, artistId);
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
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = await response.json();
    const items = data.artists?.items ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const queryNameLower = query.name.toLowerCase().trim();
    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const nameLower = item.name.toLowerCase().trim();

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
