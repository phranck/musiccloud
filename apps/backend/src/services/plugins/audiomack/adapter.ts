/**
 * @file Audiomack adapter: track + album resolves via public search API + OG scraping.
 *
 * Uses two existing consumer-facing contracts without account login:
 *
 * - Search calls `api.audiomack.com/v1/music/search` and requires `results`
 *   arrays. A search HTTP 404 is a request failure, not an empty catalog. This
 *   adapter does not invent an alternative API or obtain credentials when the
 *   configured route refuses a request.
 * - Getters read the supplied resource's public page. An explicit resource
 *   HTTP 404 is absence; other error statuses throw. Page identity comes from
 *   OG metadata rather than the search API's numeric ids.
 *
 * `audiomackPageMetadata` owns both page decoders. The observed title format is
 * `"Title by Artist: Listen on Audiomack"`; its anchored branding suffix is not
 * part of the artist. Missing OG titles remain absent metadata. Titles without
 * the by-credit pattern retain their full text and Unknown Artist fallback.
 *
 * ## No ISRC, no preview
 *
 * This adapter implements neither ISRC lookup nor preview selection.
 * `findByIsrc` returns null and supportsPreview is false. These declarations
 * describe this implementation, not every feature the provider might offer.
 *
 * ## Artist splitting
 *
 * The `artist` field is a single string that may include `", "`, `" & "`,
 * or `" feat. "` (case-insensitive). Search-row normalization owns that split;
 * page normalization removes branding without rewriting performer credits.
 * Shared confidence policy compares the resulting identity, and the resolver
 * owns acceptance, negative-cache persistence, and recording artwork policy.
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
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
import { extractOgTags } from "../_shared/og.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

const MATCH_MIN_CONFIDENCE = 0.6;

// Audiomack URLs: audiomack.com/{artist}/song/{track-slug}
const AUDIOMACK_TRACK_REGEX = /^https?:\/\/(?:www\.)?audiomack\.com\/([^/]+)\/song\/([^/?]+)/;
// Audiomack album URLs: audiomack.com/{artist}/album/{slug}
const AUDIOMACK_ALBUM_REGEX = /^https?:\/\/(?:www\.)?audiomack\.com\/([^/]+)\/album\/([^/?]+)/;

interface AudiomackSong {
  id: number;
  title: string;
  artist: string;
  url_slug: string;
  image?: string;
  image_base?: string;
  album?: string;
  duration?: number; // seconds
  genre?: string;
  music_url?: string;
  url: string; // web URL
}

interface AudiomackSearchResponse {
  results?: AudiomackSong[];
}

interface AudiomackAlbumResult {
  id: number;
  title: string;
  artist: string;
  url_slug: string;
  image?: string;
  image_base?: string;
  genre?: string;
  url: string;
}

interface AudiomackAlbumSearchResponse {
  results?: AudiomackAlbumResult[];
}

async function audiomackFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
        Accept: "application/json",
      },
    },
    timeoutMs,
  );
}

function mapSong(song: AudiomackSong): NormalizedTrack {
  // Audiomack uses "artist" as single string, may contain "feat." or ","
  const artistParts = song.artist
    .split(/[,&]|feat\./i)
    .map((a) => a.trim())
    .filter(Boolean);

  const artists = artistParts.length > 0 ? artistParts : ["Unknown Artist"];

  return {
    sourceService: "audiomack",
    sourceId: String(song.id),
    title: song.title,
    artists,
    albumName: song.album || undefined,
    durationMs: song.duration ? song.duration * 1000 : undefined,
    artworkUrl: song.image || song.image_base || undefined,
    webUrl: song.url || `https://audiomack.com/${song.url_slug}`,
  };
}

async function searchSongs(query: string): Promise<AudiomackSong[]> {
  // Audiomack public search endpoint (no OAuth needed for search)
  const searchUrl = `https://api.audiomack.com/v1/music/search?q=${encodeURIComponent(query)}&show=songs&limit=5`;
  const response = await audiomackFetch(searchUrl);
  // A search without results is an empty list, so an error status or an
  // unreadable body is a failure rather than an answer.
  if (!response.ok) {
    throw serviceHttpError(Service.AudioMack, response.status, ResourceKind.Track, query, Operation.Search);
  }
  const data = (await response.json()) as AudiomackSearchResponse;
  return requireProviderCollection(data.results, Service.AudioMack, "track search");
}

/**
 * Decodes the shared track/album OG identity without promoting page branding
 * into a performer credit. The observed `: Listen on Audiomack` suffix belongs
 * to the page, not the recording. Missing OG titles remain absent metadata;
 * callers own fetching, HTTP failures and resource identity.
 *
 * @param html - Successful public resource-page HTML.
 * @returns Page identity and optional cover, or null without an OG title.
 */
function audiomackPageMetadata(html: string): Pick<NormalizedTrack, "title" | "artists" | "artworkUrl"> | null {
  const og = extractOgTags(html);
  if (!og.title) return null;
  const pageTitle = og.title.replace(/:\s*Listen on Audiomack\s*$/i, "").trim();
  const byMatch = /^(.+?)\s+by\s+(.+)$/i.exec(pageTitle);
  return {
    title: byMatch?.[1].trim() ?? pageTitle,
    artists: [byMatch?.[2].trim() ?? "Unknown Artist"],
    artworkUrl: og.image || undefined,
  };
}

async function fetchTrackPage(artistSlug: string, trackSlug: string): Promise<NormalizedTrack | null> {
  // Fetch track page for OG tags as fallback
  const url = `https://audiomack.com/${artistSlug}/song/${trackSlug}`;
  const response = await audiomackFetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw serviceHttpError(Service.AudioMack, response.status, ResourceKind.Track, `${artistSlug}/${trackSlug}`);
  }

  const metadata = audiomackPageMetadata(await response.text());
  if (!metadata) return null;
  return {
    sourceService: "audiomack",
    sourceId: `${artistSlug}/${trackSlug}`,
    ...metadata,
    webUrl: url,
  };
}

function mapAlbumResult(album: AudiomackAlbumResult): NormalizedAlbum {
  const artistParts = album.artist
    .split(/[,&]|feat\./i)
    .map((a) => a.trim())
    .filter(Boolean);
  return {
    sourceService: "audiomack",
    sourceId: `${album.url_slug}`,
    title: album.title,
    artists: artistParts.length > 0 ? artistParts : ["Unknown Artist"],
    artworkUrl: album.image || album.image_base || undefined,
    webUrl: album.url || `https://audiomack.com/${album.url_slug}`,
  };
}

async function fetchAlbumPage(artistSlug: string, albumSlug: string): Promise<NormalizedAlbum | null> {
  const url = `https://audiomack.com/${artistSlug}/album/${albumSlug}`;
  const response = await audiomackFetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw serviceHttpError(Service.AudioMack, response.status, ResourceKind.Album, `${artistSlug}/${albumSlug}`);
  }

  const metadata = audiomackPageMetadata(await response.text());
  if (!metadata) return null;
  return {
    sourceService: "audiomack",
    sourceId: `${artistSlug}/${albumSlug}`,
    ...metadata,
    webUrl: url,
  };
}

async function searchAudiomackAlbums(query: string): Promise<AudiomackAlbumResult[]> {
  const searchUrl = `https://api.audiomack.com/v1/music/search?q=${encodeURIComponent(query)}&show=albums&limit=5`;
  const response = await audiomackFetch(searchUrl);
  if (!response.ok) {
    throw serviceHttpError(Service.AudioMack, response.status, ResourceKind.Album, query, Operation.Search);
  }
  const data = (await response.json()) as AudiomackAlbumSearchResponse;
  return requireProviderCollection(data.results, Service.AudioMack, "album search");
}

export const audiomackAdapter: ServiceAdapter = {
  id: "audiomack",
  displayName: getPlatformLabel("audiomack"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = AUDIOMACK_TRACK_REGEX.exec(url);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const parts = trackId.split("/");
    if (parts.length !== 2) {
      throw new Error(`Audiomack: Invalid track ID format: ${trackId}`);
    }
    const track = await fetchTrackPage(parts[0], parts[1]);
    if (!track) {
      throw serviceNotFoundError(Service.AudioMack, ResourceKind.Track, trackId);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const songs = await searchSongs(q);
    if (songs.length === 0) {
      log.debug("Audiomack", "Search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Audiomack", `Search returned ${songs.length} results for: ${q}`);

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      if (!song.id || !song.title) continue;

      const track = mapSong(song);
      const confidence = scoreSearchCandidate(query, track, i);

      log.debug(
        "Audiomack",
        `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      log.debug("Audiomack", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
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
    const match = AUDIOMACK_ALBUM_REGEX.exec(url);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const parts = albumId.split("/");
    if (parts.length !== 2) throw new Error(`Audiomack: Invalid album ID: ${albumId}`);
    const album = await fetchAlbumPage(parts[0], parts[1]);
    if (!album) throw serviceNotFoundError(Service.AudioMack, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const results = await searchAudiomackAlbums(q);
    if (results.length === 0) {
      log.debug("Audiomack", "Album search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Audiomack", `Album search returned ${results.length} results for: ${q}`);

    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const r of results) {
      if (!r.id || !r.title) continue;
      const album = mapAlbumResult(r);
      const confidence = scoreAlbumCandidate(query, album);
      log.debug("Audiomack", `  "${r.title}" -> confidence=${confidence.toFixed(3)}`);
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = album;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }
    return { found: true, album: bestMatch, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
