/**
 * @file Audius adapter: track + album resolves against the public Audius API.
 *
 * Keyless service (always available). The `app_name` query parameter
 * is not auth but identification required by the API for usage
 * tracking; omitting it yields 403.
 *
 * ## URL shapes: the second path segment tells albums from tracks
 *
 * Audius gives a track the permalink `/{handle}/{slug}`, an album
 * `/{handle}/album/{slug}` and a playlist `/{handle}/playlist/{slug}`.
 * `detectAlbumUrl` claims only the album shape and `detectUrl` rejects
 * the album and playlist shapes, so exactly one detector claims a link.
 * `classifyMusicUrl` in `plugins/registry.ts` depends on that, because it
 * routes a link by the first detector that claims it. `fetchAlbumById`
 * still checks `is_album`, because a numeric playlist id carries no shape
 * that says whether it is an album.
 *
 * ## Two ID shapes reach the adapter
 *
 * `detectUrl` returns a path-style ID (`handle/slug`) extracted from
 * the user-facing URL, but the resolver sometimes passes direct
 * numeric track IDs (e.g. for cross-service lookups via external ID).
 * Each getter branches on whether the ID contains a `/` and dispatches
 * to `/resolve?url=...` for paths or `/tracks/{id}` / `/playlists/{id}`
 * for numeric IDs.
 *
 * ## No ISRC
 *
 * Audius is a decentralized platform; uploaders rarely supply ISRC
 * metadata, so `findByIsrc` returns null unconditionally. The cross-
 * service resolver falls back to text search for Audius.
 *
 * ## Confidence scoring
 *
 * Uses `scoreSearchCandidate` from `_shared/confidence.ts`, which handles
 * both the structured and the free-text query branches uniformly across
 * every adapter. See that file for the scoring rationale.
 */
import { getPlatformLabel, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../../types.js";
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";

const API_BASE = "https://api.audius.co/v1";
const APP_NAME = "music_cloud";

// audius.co/{handle}/{slug}, where the slug segment is not `album` or `playlist`.
const AUDIUS_TRACK_REGEX = /(?:https?:\/\/)?audius\.co\/([^/]+\/(?!(?:album|playlist)(?:[/?#\s]|$))[^/?\s]+)/;
// audius.co/{handle}/album/{slug}. The id keeps the `album` segment, because the
// resolve endpoint needs the whole permalink.
const AUDIUS_ALBUM_REGEX = /(?:https?:\/\/)?audius\.co\/([^/]+\/album\/[^/?\s]+)/;

interface AudiusTrackResponse {
  id: string;
  title: string;
  duration: number; // seconds
  genre?: string;
  mood?: string;
  release_date?: string;
  permalink: string;
  slug: string;
  artwork?: {
    "150x150"?: string;
    "480x480"?: string;
    "1000x1000"?: string;
  };
  user: {
    id: string;
    handle: string;
    name: string;
  };
}

interface AudiusSearchResponse {
  data: AudiusTrackResponse[];
}

interface AudiusTrackDetailResponse {
  data: AudiusTrackResponse;
}

interface AudiusPlaylistResponse {
  id: string;
  playlist_name: string;
  is_album: boolean;
  permalink: string;
  playlist_image_multihash?: string;
  artwork?: { "150x150"?: string; "480x480"?: string; "1000x1000"?: string };
  user: { id: string; handle: string; name: string };
  playlist_contents?: {
    track_ids?: Array<{ track: string; time: number }>;
  };
  track_count?: number;
}

/** Audius answers a single playlist, an album included, as a list of one. */
interface AudiusPlaylistDetailResponse {
  data?: AudiusPlaylistResponse[];
}

interface AudiusPlaylistSearchResponse {
  data: AudiusPlaylistResponse[];
}

async function audiusFetch(endpoint: string): Promise<Response> {
  const separator = endpoint.includes("?") ? "&" : "?";
  return fetchWithTimeout(`${API_BASE}${endpoint}${separator}app_name=${APP_NAME}`, {}, 5000);
}

function mapTrack(raw: AudiusTrackResponse): NormalizedTrack {
  return {
    sourceService: "audius",
    sourceId: raw.id,
    title: raw.title,
    artists: [raw.user.name],
    durationMs: raw.duration * 1000,
    releaseDate: raw.release_date ?? undefined,
    artworkUrl: raw.artwork?.["1000x1000"] ?? raw.artwork?.["480x480"],
    webUrl: `https://audius.co${raw.permalink}`,
  };
}

function mapPlaylist(raw: AudiusPlaylistResponse): NormalizedAlbum {
  const artUrl = raw.artwork?.["1000x1000"] ?? raw.artwork?.["480x480"];
  return {
    sourceService: "audius",
    sourceId: raw.id,
    title: raw.playlist_name,
    artists: [raw.user.name],
    artworkUrl: artUrl,
    totalTracks: raw.track_count,
    webUrl: `https://audius.co${raw.permalink}`,
  };
}

async function fetchAlbumById(playlistId: string): Promise<NormalizedAlbum | null> {
  // A path-style id comes from an album link and goes through the resolve
  // endpoint; anything else is a playlist id.
  const endpoint = playlistId.includes("/")
    ? `/resolve?url=https://audius.co/${encodeURIComponent(playlistId)}`
    : `/playlists/${encodeURIComponent(playlistId)}`;
  const response = await audiusFetch(endpoint);
  if (!response.ok) return null;
  const data = (await response.json()) as AudiusPlaylistDetailResponse;
  const playlist = data.data?.[0];
  if (!playlist?.is_album) return null;
  return mapPlaylist(playlist);
}

async function searchAudiusAlbums(query: string): Promise<NormalizedAlbum[]> {
  const response = await audiusFetch(`/playlists/search?query=${encodeURIComponent(query)}&limit=10`);
  if (!response.ok) return [];
  const data = (await response.json()) as AudiusPlaylistSearchResponse;
  return (data.data ?? [])
    .filter((p) => p.is_album)
    .slice(0, 5)
    .map(mapPlaylist);
}

export const audiusAdapter = {
  id: "audius",
  displayName: getPlatformLabel("audius"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = AUDIUS_TRACK_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    // See file header: path-style IDs use the resolve endpoint, numeric
    // IDs use the direct tracks endpoint.
    if (trackId.includes("/")) {
      const response = await audiusFetch(`/resolve?url=https://audius.co/${encodeURIComponent(trackId)}`);

      if (!response.ok) {
        throw new Error(`Audius resolve failed: ${response.status}`);
      }

      const data = (await response.json()) as AudiusTrackDetailResponse;
      return mapTrack(data.data);
    }

    // Direct track ID lookup
    const response = await audiusFetch(`/tracks/${encodeURIComponent(trackId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Audius, response.status, ResourceKind.Track, trackId);
    }

    const data = (await response.json()) as AudiusTrackDetailResponse;
    return mapTrack(data.data);
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    // Audius tracks rarely have ISRC metadata
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const response = await audiusFetch(`/tracks/search?query=${encodeURIComponent(q)}&limit=5`);

    if (!response.ok) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = (await response.json()) as AudiusSearchResponse;
    const items = data.data ?? [];

    if (items.length === 0) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

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

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = AUDIUS_ALBUM_REGEX.exec(url);
    return match ? match[1] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumById(albumId);
    if (!album) throw serviceNotFoundError(Service.Audius, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const albums = await searchAudiusAlbums(q);
      if (albums.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const album of albums) {
        const confidence = scoreAlbumCandidate(query, album);
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = album;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }
      return { found: true, album: bestMatch, confidence: bestConfidence, matchMethod: "search" };
    } catch (error) {
      log.debug("Audius", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
