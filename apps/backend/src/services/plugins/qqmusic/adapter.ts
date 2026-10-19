/**
 * @file QQ Music (Chinese) adapter: track + album resolves via the internal API.
 *
 * Uses the consumer `u.y.qq.com/cgi-bin/musicu.fcg` JSON-RPC surface with
 * DoSearchForQQMusicDesktop and a web-player Referer. No account is configured;
 * configuration availability does not prove a request will be permitted.
 *
 * ## One endpoint, two search types via `search_type`
 *
 * Track search uses `search_type: 0`, album search uses `search_type: 8`.
 * getTrackByMid and getAlbumByMid reuse that search surface with the requested
 * mid and retain only an exact returned mid. A failed mid lookup throws rather
 * than proving that the catalog lacks the resource. Required nested collections
 * are validated; refusal diagnostics retain only finite numeric provider codes.
 *
 * ## Artwork URL template
 *
 * QQ Music embeds album art on a predictable CDN path:
 * `y.qq.com/music/photo_new/T002R<size>x<size>M000<album_mid>.jpg`.
 * The adapter synthesizes URLs at 300x300 for tracks and 500x500 for
 * album cards (the latter higher because the album share page renders
 * the artwork bigger). API responses do not include an image URL, so
 * this template is the only source.
 *
 * ## No ISRC, no preview
 *
 * This adapter maps neither field. findByIsrc returns null; cross-service
 * resolution uses text search. These are implementation limits, not proof of
 * every capability of QQ Music's consumer API.
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
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
import {
  requireProviderCollection,
  requireProviderObject,
  safeNumericProviderCode,
} from "../_shared/provider-response.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

const MATCH_MIN_CONFIDENCE = 0.6;

// QQ Music URLs: y.qq.com/n/ryqq/songDetail/{mid}
const QQMUSIC_TRACK_REGEX = /^https?:\/\/y\.qq\.com\/n\/ryqq\/songDetail\/([A-Za-z0-9]+)/;
// QQ Music album URLs: y.qq.com/n/ryqq/albumDetail/{mid}
const QQMUSIC_ALBUM_REGEX = /^https?:\/\/y\.qq\.com\/n\/ryqq\/albumDetail\/([A-Za-z0-9]+)/;

interface QQMusicSong {
  mid: string;
  name: string;
  singer: Array<{ mid: string; name: string }>;
  album: { mid: string; name: string };
  interval: number; // duration in seconds
}

interface QQMusicAlbum {
  mid: string;
  name: string;
  singer: Array<{ mid: string; name: string }>;
  publicTime?: string; // "YYYY-MM-DD"
  upc?: string;
  genre?: string;
  total?: number; // track count
  desc?: string;
}

/** What the search module answers, songs or albums depending on `search_type`. */
interface QQMusicSearchBody {
  song?: { list?: QQMusicSong[] };
  album?: { list?: QQMusicAlbum[] };
}

/** The search module's name, which is also its key in the request and the answer. */
const SEARCH_MODULE = "music.search.SearchCgiService";

/** The `search_type` values of the desktop search. */
const SearchType = { Song: 0, Album: 8 } as const;

/**
 * QQ Music's answer. It answers HTTP 200 for every request it understands and
 * says in `code` whether the call ran: 0 on the envelope and on the module for
 * an answer, such as 500001 on the envelope for a request it refused.
 */
interface QQMusicSearchEnvelope {
  code?: number;
  [SEARCH_MODULE]?: { code?: number; data?: { body?: QQMusicSearchBody } };
}

async function qqmusicFetch(url: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        Referer: "https://y.qq.com/",
        "User-Agent": SCRAPER_USER_AGENT,
        ...init?.headers,
      },
    },
    timeoutMs,
  );
}

/**
 * Runs the desktop client's search, which also stands in for a lookup by id.
 *
 * @param query - The search text, or a song or album mid.
 * @param searchType - Songs or albums, see {@link SearchType}.
 * @param perPage - How many results to ask for.
 * @param kind - What the search is for, which an error names.
 * @returns The module's body. A search without results is a body with an
 *   empty list.
 * @throws When the request fails, answers with an error status, carries a
 *   body that is not JSON, or answers with a `code` other than 0, because
 *   each of those is a failure rather than an answer.
 */
async function search(
  query: string,
  searchType: (typeof SearchType)[keyof typeof SearchType],
  perPage: number,
  kind: ResourceKind,
): Promise<QQMusicSearchBody> {
  const response = await qqmusicFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      [SEARCH_MODULE]: {
        method: "DoSearchForQQMusicDesktop",
        module: SEARCH_MODULE,
        param: { num_per_page: perPage, page_num: 1, query, search_type: searchType },
      },
    }),
  });
  if (!response.ok) throw serviceHttpError(Service.QQMusic, response.status, kind, query, Operation.Search);

  const envelope = (await response.json()) as QQMusicSearchEnvelope;
  const answer = envelope[SEARCH_MODULE];
  if (envelope.code !== 0 || answer?.code !== 0) {
    throw new UpstreamUnavailableError(
      "qqmusic",
      `search answered code ${safeNumericProviderCode(envelope.code)}, module code ${safeNumericProviderCode(answer?.code)}`,
    );
  }
  const body = requireProviderObject(answer.data?.body, Service.QQMusic, `${kind} search`);
  if (searchType === SearchType.Song) requireProviderCollection(body.song?.list, Service.QQMusic, "track search");
  else requireProviderCollection(body.album?.list, Service.QQMusic, "album search");
  return body;
}

function mapSong(song: QQMusicSong): NormalizedTrack {
  const artists = song.singer?.map((s) => s.name).filter(Boolean) ?? ["Unknown Artist"];

  // QQ Music album art: https://y.qq.com/music/photo_new/T002R300x300M000{album_mid}.jpg
  const artworkUrl = song.album?.mid
    ? `https://y.qq.com/music/photo_new/T002R300x300M000${song.album.mid}.jpg`
    : undefined;

  return {
    sourceService: "qqmusic",
    sourceId: song.mid,
    title: song.name,
    artists,
    albumName: song.album?.name,
    durationMs: song.interval ? song.interval * 1000 : undefined,
    artworkUrl,
    webUrl: `https://y.qq.com/n/ryqq/songDetail/${song.mid}`,
  };
}

async function searchSongs(query: string): Promise<QQMusicSong[]> {
  return (await search(query, SearchType.Song, 5, ResourceKind.Track)).song?.list ?? [];
}

async function getTrackByMid(mid: string): Promise<NormalizedTrack | null> {
  // Use search to find track by mid (no direct detail API without auth)
  const songs = (await search(mid, SearchType.Song, 1, ResourceKind.Track)).song?.list ?? [];
  const song = songs.find((s) => s.mid === mid);
  return song ? mapSong(song) : null;
}

function mapQQAlbum(album: QQMusicAlbum): NormalizedAlbum {
  const artists = album.singer?.map((s) => s.name).filter(Boolean) ?? ["Unknown Artist"];
  // QQ Music album art: T002R500x500M000{album_mid}.jpg
  const artworkUrl = album.mid ? `https://y.qq.com/music/photo_new/T002R500x500M000${album.mid}.jpg` : undefined;

  return {
    sourceService: "qqmusic",
    sourceId: album.mid,
    upc: album.upc,
    title: album.name,
    artists,
    artworkUrl,
    releaseDate: album.publicTime,
    totalTracks: album.total,
    webUrl: `https://y.qq.com/n/ryqq/albumDetail/${album.mid}`,
  };
}

async function searchQQMusicAlbums(query: string): Promise<QQMusicAlbum[]> {
  return (await search(query, SearchType.Album, 5, ResourceKind.Album)).album?.list ?? [];
}

async function getAlbumByMid(albumMid: string): Promise<NormalizedAlbum | null> {
  // Use search with album mid to get album details
  const albums = (await search(albumMid, SearchType.Album, 1, ResourceKind.Album)).album?.list ?? [];
  const album = albums.find((a) => a.mid === albumMid);
  return album ? mapQQAlbum(album) : null;
}

export const qqmusicAdapter: ServiceAdapter = {
  id: "qqmusic",
  displayName: getPlatformLabel("qqmusic"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = QQMUSIC_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await getTrackByMid(trackId);
    if (!track) {
      throw serviceNotFoundError(Service.QQMusic, ResourceKind.Track, trackId);
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
      log.debug("QQ Music", "Search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("QQ Music", `Search returned ${songs.length} results for: ${q}`);

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      if (!song.mid || !song.name) continue;

      const track = mapSong(song);
      const confidence = scoreSearchCandidate(query, track, i);

      log.debug(
        "QQ Music",
        `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      log.debug("QQ Music", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
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
    const match = QQMUSIC_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await getAlbumByMid(albumId);
    if (!album) throw serviceNotFoundError(Service.QQMusic, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const results = await searchQQMusicAlbums(q);
    if (results.length === 0) {
      log.debug("QQ Music", "Album search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("QQ Music", `Album search returned ${results.length} results for: ${q}`);

    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const raw of results) {
      if (!raw.mid || !raw.name) continue;
      const album = mapQQAlbum(raw);
      const confidence = scoreAlbumCandidate(query, album);
      log.debug("QQ Music", `  "${raw.name}" -> confidence=${confidence.toFixed(3)}`);
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
