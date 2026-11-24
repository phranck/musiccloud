/**
 * @file Napster adapter: track + artist resolves against the Napster v2.2 API.
 *
 * Credentialed: requires `NAPSTER_API_KEY`.
 *
 * ## No new API keys available
 *
 * The Napster Developer Portal stopped accepting new sign-ups
 * (last confirmed Feb 2026). Existing keys still work. A new key
 * requires writing to `api-team@napster.com` directly. Scraping is
 * not a viable backup: the Napster web app is a pure SPA with no
 * server-rendered OG metadata, so the `scrapeTrackFromPage` fallback
 * in `resolver.ts` returns nothing useful.
 *
 * ## URL shapes: direct ID vs slug
 *
 * Napster URLs come in two forms:
 *
 * - `play.napster.com/track/tra.{digits}` - direct, resolvable track ID.
 * - `app.napster.com/artist/.../album/.../track/my-track-slug` - slug URL
 *   from the legacy app layout, without the `tra.` prefix.
 *
 * `detectUrl` accepts both but `getTrack` can only look up the `tra.`
 * form. Napster's API has no slug-to-ID endpoint, so a slug URL is
 * reported as not found (`MC-API-7404`) without a request, and the
 * resolver answers it with 404. The `albumCapabilities`/artist branches stick to
 * the `art.{digits}` convention for the same reason.
 *
 * ## No album support
 *
 * Tracks carry `albumName` and `albumId`, and artwork is derived from
 * `albumId`, but the adapter does not implement `albumCapabilities`.
 * Napster's album surface was not wired up because the service's
 * catalog gap on albums relative to tracks did not justify the work.
 *
 * ## Artwork via URL template, not API field
 *
 * Track responses do not include an artwork URL. Instead, the image
 * server exposes a predictable URL
 * (`imageserver/v2/albums/{albumId}/images/500x500.jpg`) that we
 * synthesise in `artworkUrl()` from the album ID. The same pattern
 * holds for artist images.
 *
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
import {
  serviceConfigurationMissingError,
  serviceHttpError,
  serviceNotFoundError,
} from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  ArtistCapabilities,
  ArtistMatchResult,
  ArtistSearchQuery,
  MatchResult,
  NormalizedArtist,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../../types.js";
import { splitArtistNames } from "../_shared/artists.js";
import { scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { requireProviderCollection } from "../_shared/provider-response.js";

const API_BASE = "https://api.napster.com/v2.2";

// Matches: play.napster.com/track/tra.123, web.napster.com/track/tra.123,
// app.napster.com/artist/.../album/.../track/...
const NAPSTER_TRACK_REGEX =
  /(?:https?:\/\/)?(?:play\.|web\.|app\.|www\.)?napster\.com\/(?:track\/(tra\.\d+)|.*\/track\/([^/?]+))/;

// Matches: play.napster.com/artist/art.123, web.napster.com/artist/art.123,
// app.napster.com/artist/artist-slug. The link ends at the artist segment, because a
// deeper legacy link such as /artist/{a}/album/{b}/track/{c} is a track link.
const NAPSTER_ARTIST_REGEX =
  /(?:https?:\/\/)?(?:play\.|web\.|app\.|www\.)?napster\.com\/artist\/(art\.\d+|[^/?#]+)\/?(?:[?#].*)?$/;

interface NapsterTrackResponse {
  type: string;
  id: string; // "tra.262370664"
  name: string;
  artistName: string;
  albumName: string;
  albumId: string;
  isrc?: string;
  playbackSeconds: number;
  isExplicit: boolean;
  previewURL?: string;
  shortcut: string; // "artist/album/track" slug
}

interface NapsterSearchResponse {
  search: {
    data: {
      tracks: NapsterTrackResponse[];
    };
  };
  meta: {
    totalCount: number;
  };
}

interface NapsterTracksResponse {
  tracks: NapsterTrackResponse[];
}

interface NapsterArtistResponse {
  type: string;
  id: string; // "art.12345"
  name: string;
  shortcut: string;
  blurbs: string[];
  albumGroups: Record<string, string[]>;
}

interface NapsterArtistsResponse {
  artists: NapsterArtistResponse[];
}

interface NapsterArtistSearchResponse {
  search: {
    data: {
      artists: NapsterArtistResponse[];
    };
  };
  meta: {
    totalCount: number;
  };
}

/** The environment variable that holds the Napster API key. Without it every request fails with `MC-CFG-7001`. */
const NAPSTER_API_KEY_VARIABLE = "NAPSTER_API_KEY";

/** The prefix of every Napster track ID the API can look up, as in `tra.262370664`. */
const NAPSTER_TRACK_ID_PREFIX = "tra.";

/** Why a legacy slug link cannot be resolved, carried in the not-found message. */
const SLUG_LOOKUP_UNSUPPORTED_DETAIL = "slug links have no API lookup";

/**
 * Reads the Napster API key from the environment.
 *
 * @returns The key from `NAPSTER_API_KEY`.
 * @throws A configuration `ResolveError` (`MC-CFG-7001`) when the variable is not set.
 */
function getApiKey(): string {
  const key = process.env[NAPSTER_API_KEY_VARIABLE];
  if (!key) {
    throw serviceConfigurationMissingError(Service.Napster, NAPSTER_API_KEY_VARIABLE);
  }
  return key;
}

/**
 * Sends one authenticated request to the Napster v2.2 API.
 *
 * @param endpoint - The path below `API_BASE`, with or without a query string.
 * @returns The raw response, which the caller checks for `ok`.
 * @throws A configuration `ResolveError` when `NAPSTER_API_KEY` is not set.
 */
async function napsterFetch(endpoint: string): Promise<Response> {
  const apiKey = getApiKey();
  const separator = endpoint.includes("?") ? "&" : "?";
  return fetchWithTimeout(`${API_BASE}${endpoint}${separator}apikey=${apiKey}`, {}, 5000);
}

function artworkUrl(albumId: string): string {
  return `https://api.napster.com/imageserver/v2/albums/${albumId}/images/500x500.jpg`;
}

function artistImageUrl(artistId: string): string {
  return `https://api.napster.com/imageserver/v2/artists/${artistId}/images/500x500.jpg`;
}

function mapTrack(raw: NapsterTrackResponse): NormalizedTrack {
  const artists = splitArtistNames(raw.artistName);

  return {
    sourceService: "napster",
    sourceId: raw.id,
    isrc: raw.isrc,
    title: raw.name,
    artists,
    albumName: raw.albumName,
    durationMs: raw.playbackSeconds * 1000,
    isExplicit: raw.isExplicit,
    artworkUrl: raw.albumId ? artworkUrl(raw.albumId) : undefined,
    previewUrl: raw.previewURL ?? undefined,
    webUrl: `https://play.napster.com/track/${raw.id}`,
  };
}

export const napsterAdapter = {
  id: "napster",
  displayName: getPlatformLabel("napster"),
  capabilities: {
    supportsIsrc: true,
    supportsPreview: true,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = NAPSTER_TRACK_REGEX.exec(url);
    if (!match) return null;
    // match[1] = direct track ID (tra.xxx), match[2] = slug-based track name
    return match[1] ?? match[2] ?? null;
  },

  /**
   * Looks up one track by its Napster ID.
   *
   * @param trackId - What `detectUrl` returned: a `tra.` ID, or the slug of a
   *   legacy `app.napster.com` link.
   * @returns The normalized track.
   * @throws Napster's not-found `ResolveError` (`MC-API-7404`) for a slug,
   *   which the API cannot look up, and for an empty track list; a
   *   `serviceHttpError` for any error status; a configuration error when the
   *   key is missing.
   */
  async getTrack(trackId: string): Promise<NormalizedTrack> {
    if (!trackId.startsWith(NAPSTER_TRACK_ID_PREFIX)) {
      throw serviceNotFoundError(Service.Napster, ResourceKind.Track, trackId, SLUG_LOOKUP_UNSUPPORTED_DETAIL);
    }

    const response = await napsterFetch(`/tracks/${encodeURIComponent(trackId)}`);

    if (!response.ok) {
      throw serviceHttpError(Service.Napster, response.status, ResourceKind.Track, trackId);
    }

    const data = (await response.json()) as NapsterTracksResponse;
    const tracks = data.tracks;

    if (!tracks || tracks.length === 0) {
      throw serviceNotFoundError(Service.Napster, ResourceKind.Track, trackId);
    }

    return mapTrack(tracks[0]);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await napsterFetch(`/tracks/isrc/${encodeURIComponent(isrc)}`);

    // An ISRC Napster does not have is an empty list or a 404, both answers.
    // Any other error status is a failure.
    if (response.status === 404) return null;
    if (!response.ok) {
      throw serviceHttpError(Service.Napster, response.status, ResourceKind.Track, isrc, Operation.IsrcLookup);
    }

    const data = (await response.json()) as NapsterTracksResponse;
    const tracks = requireProviderCollection(data.tracks, Service.Napster, "ISRC lookup");

    if (tracks.length === 0) {
      log.debug("Napster", "ISRC not found:", isrc);
      return null;
    }

    return mapTrack(tracks[0]);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const response = await napsterFetch(`/search?query=${encodeURIComponent(q)}&type=track&per_type_limit=5`);

    if (!response.ok) {
      throw serviceHttpError(Service.Napster, response.status, ResourceKind.Track, q, Operation.Search);
    }

    const data = (await response.json()) as NapsterSearchResponse;
    const items = requireProviderCollection(data.search?.data?.tracks, Service.Napster, "track search");

    if (items.length === 0) {
      log.debug("Napster", "Search returned no tracks for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Napster", `Search returned ${items.length} tracks for: ${q}`);

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < items.length; i++) {
      const track = mapTrack(items[i]);
      const confidence = scoreSearchCandidate(query, track, i);

      log.debug(
        "Napster",
        `  [${i}] "${track.title}" by ${track.artists.join(", ")} → confidence=${confidence.toFixed(3)}`,
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      log.debug("Napster", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return {
      found: true,
      track: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },
  // --- Artist support ---

  artistCapabilities: {
    supportsArtistSearch: true,
  } satisfies ArtistCapabilities,

  detectArtistUrl(url: string): string | null {
    const match = NAPSTER_ARTIST_REGEX.exec(url);
    return match ? match[1] : null;
  },

  /**
   * Looks up one artist by its Napster ID.
   *
   * @param artistId - What `detectArtistUrl` returned, usually an `art.` ID.
   * @returns The normalized artist, with the image URL derived from the ID.
   * @throws Napster's not-found `ResolveError` (`MC-API-7404`) for an empty
   *   artist list; a `serviceHttpError` for any error status; a configuration
   *   error when the key is missing.
   */
  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const endpoint = `/artists/${encodeURIComponent(artistId)}`;
    const response = await napsterFetch(endpoint);

    if (!response.ok) {
      throw serviceHttpError(Service.Napster, response.status, ResourceKind.Artist, artistId);
    }

    const data = (await response.json()) as NapsterArtistsResponse;
    const artists = data.artists;

    if (!artists || artists.length === 0) {
      throw serviceNotFoundError(Service.Napster, ResourceKind.Artist, artistId);
    }

    const artist = artists[0];
    return {
      sourceService: "napster",
      sourceId: artist.id,
      name: artist.name,
      imageUrl: artistImageUrl(artist.id),
      genres: undefined,
      webUrl: `https://play.napster.com/artist/${artist.id}`,
    };
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const response = await napsterFetch(`/search?query=${encodeURIComponent(query.name)}&type=artist&per_type_limit=5`);

    if (!response.ok) {
      throw serviceHttpError(Service.Napster, response.status, ResourceKind.Artist, query.name, Operation.Search);
    }

    const data = (await response.json()) as NapsterArtistSearchResponse;
    const items = requireProviderCollection(data.search?.data?.artists, Service.Napster, "artist search");

    if (items.length === 0) {
      log.debug("Napster", "Artist search returned no results for:", query.name);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Napster", `Artist search returned ${items.length} results for: ${query.name}`);

    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const confidence = calculateArtistNameConfidence(query.name, item.name);

      log.debug("Napster", `  Artist "${item.name}" → confidence=${confidence.toFixed(3)}`);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestArtist = {
          sourceService: "napster",
          sourceId: item.id,
          name: item.name,
          imageUrl: artistImageUrl(item.id),
          genres: undefined,
          webUrl: `https://play.napster.com/artist/${item.id}`,
        };
      }
    }

    if (!bestArtist || bestConfidence < 0.6) {
      log.debug("Napster", `Best artist confidence ${bestConfidence.toFixed(3)} below threshold 0.6`);
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
