/**
 * @file NetEase Cloud Music (Chinese) adapter: API client against the
 *       internal `music.163.com/api/*` endpoints.
 *
 * Uses the consumer `/api/*` surface with no configured account. Requests
 * supply the web-player Referer. Registry configuration availability is not
 * proof that a request is permitted; provider refusals still throw.
 *
 * ## URL format includes a hash fragment
 *
 * NetEase URLs can have two shapes:
 * - `music.163.com/song?id=123` (clean form)
 * - `music.163.com/#/song?id=123` (hash-router form from the SPA)
 *
 * Both reach the same page. The URL regexes accept either via the
 * optional `#/` group so that pasted SPA URLs still resolve.
 *
 * ## Form-encoded POST for search
 *
 * `search` uses `Content-Type: application/x-www-form-urlencoded`
 * with a `URLSearchParams` body (not JSON). This matches what the web
 * player sends; the endpoint ignores JSON bodies.
 *
 * ## Search type parameter
 *
 * The `/api/search/get` endpoint handles multiple result types via a
 * `type` parameter: `1` = tracks, `10` = albums, `100` = artists. Each
 * type yields a differently-shaped `result` object, which is why the
 * callers of `search` each read a different list from it.
 *
 * ## The answer's `code`
 *
 * NetEase answers HTTP 200 for every request it understands and says in the
 * body's `code` whether the call ran. `code` 200 is an answer: a search
 * without matches carries an empty list (or only a `songCount` of 0 for
 * tracks), and a song id it does not have answers `songs: []`. `code` 404 is
 * its answer for an album or artist id it does not have. Any other code is a
 * refusal, such as the -462 its risk control answers to album lookups. A
 * refusal, an error status and a body that is not JSON throw, because the
 * resolver remembers a returned miss for a month and skips the service for
 * that long.
 *
 * ## No ISRC, no preview
 *
 * This adapter implements neither identifier lookup nor preview selection.
 * findByIsrc returns null; cross-service matching uses bounded text search.
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { calculateArtistNameConfidence } from "../../../lib/resolve/normalize";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import type {
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
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { safeNumericProviderCode } from "../_shared/provider-response.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

const MATCH_MIN_CONFIDENCE = 0.6;

// NetEase Cloud Music URLs: music.163.com/song?id={songId} or music.163.com/#/song?id={songId}
const NETEASE_TRACK_REGEX = /^https?:\/\/music\.163\.com\/(?:#\/)?song\?id=(\d+)/;
// NetEase album URLs: music.163.com/album?id={id} or music.163.com/#/album?id={id}
const NETEASE_ALBUM_REGEX = /^https?:\/\/music\.163\.com\/(?:#\/)?album\?id=(\d+)/;
// NetEase artist URLs: music.163.com/artist?id={id} or music.163.com/#/artist?id={id}
const NETEASE_ARTIST_REGEX = /^https?:\/\/music\.163\.com\/(?:#\/)?artist\?id=(\d+)/;

interface NetEaseSong {
  id: number;
  name: string;
  artists?: Array<{ id: number; name: string }>;
  album?: { id: number; name: string; picUrl?: string };
  duration?: number; // milliseconds
}

interface NetEaseSearchResponse {
  result?: {
    songs?: NetEaseSong[];
    songCount?: number;
  };
  code?: number;
}

interface NetEaseAlbum {
  id: number;
  name: string;
  picUrl?: string;
  artist?: { name: string };
  artists?: Array<{ id: number; name: string }>;
  publishTime?: number; // epoch ms
  company?: string;
  size?: number; // track count
  description?: string;
}

interface NetEaseAlbumDetailResponse {
  album?: NetEaseAlbum;
  songs?: Array<{ id: number; name: string; dt?: number; ar?: Array<{ name: string }> }>;
  code?: number;
}

interface NetEaseAlbumSearchResponse {
  result?: {
    albums?: NetEaseAlbum[];
    albumCount?: number;
  };
  code?: number;
}

/** `/api/song/detail` describes a song with the same fields a search does. */
interface NetEaseDetailResponse {
  songs?: NetEaseSong[];
  code?: number;
}

/** The `code` every NetEase answer carries in its body. */
interface NetEaseEnvelope {
  code?: number;
}

/** The `code` of an answer to a call that ran. */
const CODE_OK = 200;

/** The `code` of an album or artist lookup for an id NetEase does not have. */
const CODE_NOT_FOUND = 404;

/** The `type` values of `/api/search/get`. */
const SearchType = { Song: "1", Album: "10", Artist: "100" } as const;

/** Each search kind owns its result list and explicit omitted-list zero marker. */
const SEARCH_RESULT_FIELDS = {
  [SearchType.Song]: { list: "songs", count: "songCount" },
  [SearchType.Album]: { list: "albums", count: "albumCount" },
  [SearchType.Artist]: { list: "artists", count: "artistCount" },
} as const;

async function neteaseFetch(url: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://music.163.com/",
        "User-Agent": SCRAPER_USER_AGENT,
        ...init?.headers,
      },
    },
    timeoutMs,
  );
}

/**
 * Reads the body of a NetEase answer and checks that the call ran.
 *
 * @param response - An answer with a success status.
 * @param what - What was asked, for the error message.
 * @returns The body, or null where NetEase says it has no such resource
 *   (`code` 404).
 * @throws {UpstreamUnavailableError} When the body is not a JSON object or its
 *   `code` is neither 200 nor 404, because each of those is a failure rather
 *   than an answer.
 */
async function readAnswer<T extends NetEaseEnvelope>(response: Response, what: string): Promise<T | null> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new UpstreamUnavailableError("netease", `${what} answered a body that is not JSON`, cause);
  }
  if (typeof body !== "object" || body === null) {
    throw new UpstreamUnavailableError("netease", `${what} answered a body that is not an object`);
  }

  const answer = body as T;
  if (answer.code === CODE_NOT_FOUND) return null;
  if (answer.code !== CODE_OK) {
    const code = safeNumericProviderCode(answer.code);
    throw new UpstreamUnavailableError("netease", `${what} answered code ${code}`);
  }
  return answer;
}

/**
 * Runs `/api/search/get` for one result type.
 *
 * @param type - Which results to search for, see {@link SearchType}.
 * @param kind - What the search is for, which an error names.
 * @param query - The search text.
 * @returns The answer's `result` object. A search without matches is a
 *   `result` with an empty list or a count of 0.
 * @throws When the request fails, answers with an error status, carries a
 *   body that is not JSON or has no `result`, or answers with a `code` other
 *   than 200.
 */
async function search<Result>(
  type: (typeof SearchType)[keyof typeof SearchType],
  kind: ResourceKind,
  query: string,
): Promise<Result> {
  const params = new URLSearchParams({ s: query, type, offset: "0", limit: "5" });
  const response = await neteaseFetch("https://music.163.com/api/search/get", {
    method: "POST",
    body: params.toString(),
  });
  if (!response.ok) throw serviceHttpError(Service.NetEase, response.status, kind, query, Operation.Search);

  const answer = await readAnswer<NetEaseEnvelope & { result?: Result }>(response, `${kind} search for "${query}"`);
  if (!answer?.result) {
    throw new UpstreamUnavailableError("netease", `${kind} search for "${query}" answered no result`);
  }
  const contract = SEARCH_RESULT_FIELDS[type];
  const result = answer.result as Record<string, unknown>;
  const list = result[contract.list];
  const explicitEmpty = list === undefined && result[contract.count] === 0;
  if (!Array.isArray(list) && !explicitEmpty) {
    throw new UpstreamUnavailableError("netease", `${kind} search answered without its result collection`);
  }
  return answer.result;
}

function mapSong(song: NetEaseSong): NormalizedTrack {
  const artists = song.artists?.map((a) => a.name).filter(Boolean) ?? ["Unknown Artist"];

  return {
    sourceService: "netease",
    sourceId: String(song.id),
    title: song.name,
    artists,
    albumName: song.album?.name,
    durationMs: song.duration,
    artworkUrl: song.album?.picUrl,
    webUrl: `https://music.163.com/song?id=${song.id}`,
  };
}

async function getTrackById(songId: string): Promise<NormalizedTrack | null> {
  const url = `https://music.163.com/api/song/detail?ids=[${songId}]&id=${songId}`;

  const response = await neteaseFetch(url);
  if (!response.ok) throw serviceHttpError(Service.NetEase, response.status, ResourceKind.Track, songId);

  // A song id NetEase does not have answers code 200 with an empty `songs` list.
  const answer = await readAnswer<NetEaseDetailResponse>(response, `track ${songId}`);
  const song = answer?.songs?.[0];
  return song ? mapSong(song) : null;
}

async function searchSongs(query: string): Promise<NetEaseSong[]> {
  const result = await search<NonNullable<NetEaseSearchResponse["result"]>>(SearchType.Song, ResourceKind.Track, query);
  return result.songs ?? [];
}

function mapNetEaseAlbum(album: NetEaseAlbum, songCount?: number): NormalizedAlbum {
  const artists =
    album.artists?.map((a) => a.name).filter(Boolean) ??
    (album.artist?.name ? [album.artist.name] : ["Unknown Artist"]);
  const releaseDate = album.publishTime ? new Date(album.publishTime).toISOString().slice(0, 10) : undefined;

  return {
    sourceService: "netease",
    sourceId: String(album.id),
    title: album.name,
    artists,
    artworkUrl: album.picUrl,
    releaseDate,
    totalTracks: songCount ?? album.size,
    label: album.company,
    webUrl: `https://music.163.com/album?id=${album.id}`,
  };
}

async function getAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const response = await neteaseFetch(`https://music.163.com/api/album/${albumId}`);
  if (!response.ok) throw serviceHttpError(Service.NetEase, response.status, ResourceKind.Album, albumId);

  const answer = await readAnswer<NetEaseAlbumDetailResponse>(response, `album ${albumId}`);
  if (!answer?.album) return null;
  return mapNetEaseAlbum(answer.album, answer.songs?.length);
}

interface NetEaseArtist {
  id: number;
  name: string;
  picUrl?: string;
  img1v1Url?: string;
  alias?: string[];
}

interface NetEaseArtistDetailResponse {
  artist?: NetEaseArtist;
  code?: number;
}

interface NetEaseArtistSearchResponse {
  result?: {
    artists?: NetEaseArtist[];
    artistCount?: number;
  };
  code?: number;
}

function mapNetEaseArtist(artist: NetEaseArtist): NormalizedArtist {
  return {
    sourceService: "netease",
    sourceId: String(artist.id),
    name: artist.name,
    imageUrl: artist.picUrl ?? artist.img1v1Url,
    webUrl: `https://music.163.com/artist?id=${artist.id}`,
  };
}

async function getArtistById(artistId: string): Promise<NormalizedArtist | null> {
  const response = await neteaseFetch(`https://music.163.com/api/artist/${artistId}`);
  if (!response.ok) throw serviceHttpError(Service.NetEase, response.status, ResourceKind.Artist, artistId);

  const answer = await readAnswer<NetEaseArtistDetailResponse>(response, `artist ${artistId}`);
  if (!answer?.artist) return null;
  return mapNetEaseArtist(answer.artist);
}

async function searchNetEaseArtists(query: string): Promise<NetEaseArtist[]> {
  const result = await search<NonNullable<NetEaseArtistSearchResponse["result"]>>(
    SearchType.Artist,
    ResourceKind.Artist,
    query,
  );
  return result.artists ?? [];
}

async function searchNetEaseAlbums(query: string): Promise<NetEaseAlbum[]> {
  const result = await search<NonNullable<NetEaseAlbumSearchResponse["result"]>>(
    SearchType.Album,
    ResourceKind.Album,
    query,
  );
  return result.albums ?? [];
}

export const neteaseAdapter: ServiceAdapter = {
  id: "netease",
  displayName: getPlatformLabel("netease"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = NETEASE_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await getTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(Service.NetEase, ResourceKind.Track, trackId);
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
      log.debug("NetEase", "Search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("NetEase", `Search returned ${songs.length} results for: ${q}`);

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      if (!song.id || !song.name) continue;

      const track = mapSong(song);
      const confidence = scoreSearchCandidate(query, track, i);

      log.debug(
        "NetEase",
        `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      log.debug("NetEase", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
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
    const match = NETEASE_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await getAlbumById(albumId);
    if (!album) throw serviceNotFoundError(Service.NetEase, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const results = await searchNetEaseAlbums(q);
    if (results.length === 0) {
      log.debug("NetEase", "Album search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("NetEase", `Album search returned ${results.length} results for: ${q}`);

    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const raw of results) {
      if (!raw.id || !raw.name) continue;
      const album = mapNetEaseAlbum(raw);
      const confidence = scoreAlbumCandidate(query, album);
      log.debug("NetEase", `  "${raw.name}" -> confidence=${confidence.toFixed(3)}`);
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

  // --- Artist support ---

  artistCapabilities: {
    supportsArtistSearch: true,
  } satisfies ArtistCapabilities,

  detectArtistUrl(url: string): string | null {
    const match = NETEASE_ARTIST_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const artist = await getArtistById(artistId);
    if (!artist) throw serviceNotFoundError(Service.NetEase, ResourceKind.Artist, artistId);
    return artist;
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const results = await searchNetEaseArtists(query.name);
    if (results.length === 0) {
      log.debug("NetEase", "Artist search returned no results for:", query.name);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("NetEase", `Artist search returned ${results.length} results for: ${query.name}`);

    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const raw of results) {
      if (!raw.id || !raw.name) continue;

      const confidence = calculateArtistNameConfidence(query.name, raw.name);

      log.debug("NetEase", `  "${raw.name}" -> confidence=${confidence.toFixed(3)}`);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestArtist = mapNetEaseArtist(raw);
      }
    }

    if (!bestArtist || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
