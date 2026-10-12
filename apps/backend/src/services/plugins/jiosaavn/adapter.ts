/**
 * @file JioSaavn (Indian) adapter: API client against the public `api.php`.
 *
 * Keyless (always available). JioSaavn's web and mobile clients talk
 * to a public `jiosaavn.com/api.php` endpoint with a `__call` query
 * parameter selecting the operation (`search.getResults`,
 * `content.getAlbumDetails`, etc.). The adapter calls the same
 * surface directly.
 *
 * ## What counts as an answer
 *
 * A search without matches answers `{ "total": 0, "results": [] }`. A
 * lookup by id answers `[]`, an empty body, or an object without the id
 * and title for an id JioSaavn does not know. A call it refuses answers
 * `{ "error": { "code", "msg" } }` with HTTP 200, and maintenance windows,
 * rate limiting and geo blocks answer an HTML page. Both of those throw,
 * as does every error status and every other body that is not JSON,
 * because the resolver remembers a returned miss for a month and skips the
 * service for that long.
 *
 * ## Variable response shape: `{ songs: [...] }` or direct object
 *
 * `webapi.get` returns either a `{ songs: [...] }` wrapper or a direct
 * song object, depending on the token shape. `getTrackById` handles
 * both branches.
 *
 * ## Image URL upscaling
 *
 * JioSaavn image URLs embed size as `150x150` or `50x50` in the path.
 * The adapter rewrites these to `500x500` for higher-resolution
 * artwork in the share page render. There is no metadata endpoint
 * that returns the larger size directly.
 *
 * ## Duration as stringified seconds
 *
 * `more_info.duration` is a string like `"241"` (seconds), not a
 * number. Every code path parses with `parseInt(..., 10)` and
 * multiplies by 1000.
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
  AlbumTrackEntry,
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

const MATCH_MIN_CONFIDENCE = 0.6;

// JioSaavn URLs: jiosaavn.com/song/{slug}/{id}
const JIOSAAVN_TRACK_REGEX = /^https?:\/\/(?:www\.)?jiosaavn\.com\/song\/[^/]+\/([A-Za-z0-9_-]+)/;
// JioSaavn album URLs: jiosaavn.com/album/{slug}/{id}
const JIOSAAVN_ALBUM_REGEX = /^https?:\/\/(?:www\.)?jiosaavn\.com\/album\/[^/]+\/([A-Za-z0-9_-]+)/;
// JioSaavn artist URLs: jiosaavn.com/artist/{slug}/{id}
const JIOSAAVN_ARTIST_REGEX = /^https?:\/\/(?:www\.)?jiosaavn\.com\/artist\/[^/]+\/([A-Za-z0-9_-]+)/;

interface JioSaavnAlbum {
  // getAlbumById asks without api_version=4, which answers albumid, name, a
  // comma-separated primary_artists string and the full release_date. id and
  // more_info belong to the api_version=4 shape, which has only the year.
  id?: string;
  albumid?: string;
  title?: string;
  name?: string;
  primary_artists?: string;
  release_date?: string;
  perma_url: string;
  image: string;
  year?: string;
  list_count?: string; // number of songs as string
  more_info?: {
    artistMap?: {
      primary_artists?: Array<{ name: string; id: string }>;
    };
    label_url?: string;
    label?: string;
    upc?: string;
    release_date?: string;
    song_count?: string;
  };
  songs?: JioSaavnSong[];
}

interface JioSaavnAlbumSearchResult {
  id: string;
  title: string;
  year?: string;
  perma_url: string;
  image: string;
  music?: string; // artist name
}

interface JioSaavnSong {
  id: string;
  title?: string;
  song?: string; // the title as the album endpoint sends it
  duration?: string; // seconds as string, as the album endpoint sends it
  perma_url: string;
  image: string;
  year?: string;
  language?: string;
  more_info?: {
    duration?: string; // seconds as string
    album?: string;
    album_id?: string;
    album_url?: string;
    label?: string;
    artistMap?: {
      primary_artists?: Array<{ name: string; id: string }>;
      featured_artists?: Array<{ name: string; id: string }>;
      artists?: Array<{ name: string; id: string; role: string }>;
    };
    explicit_content?: string; // "0" or "1"
  };
  explicit_content?: string;
}

async function jiosaavnFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "application/json",
      },
    },
    timeoutMs,
  );
}

/**
 * Reads the body of a JioSaavn answer.
 *
 * @param response - An answer with a success status.
 * @param what - What was asked, for the error message.
 * @returns The parsed body, or null where the body is empty or JSON `null`,
 *   which is how a lookup answers for an id JioSaavn does not know.
 * @throws {UpstreamUnavailableError} When the body is not a JSON object (an
 *   HTML page during maintenance, rate limiting or a geo block is the usual
 *   case) or is an `{ error }` object, because each of those is a failure
 *   rather than an answer.
 */
async function readAnswer<T>(response: Response, what: string): Promise<T | null> {
  const text = await response.text();
  if (text.trim() === "") return null;

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (cause) {
    throw new UpstreamUnavailableError("jiosaavn", `${what} answered a body that is not JSON`, cause);
  }
  if (body === null) return null;
  if (typeof body !== "object") {
    throw new UpstreamUnavailableError("jiosaavn", `${what} answered a body that is not an object`);
  }
  if ("error" in body) {
    throw new UpstreamUnavailableError("jiosaavn", `${what} answered an error: ${JSON.stringify(body.error)}`);
  }
  return body as T;
}

/**
 * Runs one of JioSaavn's `search.get*Results` calls.
 *
 * @param call - The `__call` value, which decides what is searched for.
 * @param kind - What the search is for, which an error names.
 * @param query - The search text.
 * @returns The answer's `results`. A search without matches is an empty list.
 * @throws When the request fails, answers with an error status, carries a
 *   body that readAnswer rejects, or has no `results` list.
 */
async function search<Result>(call: string, kind: ResourceKind, query: string): Promise<Result[]> {
  const url = `https://www.jiosaavn.com/api.php?__call=${call}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=5&q=${encodeURIComponent(query)}`;

  const response = await jiosaavnFetch(url);
  if (!response.ok) throw serviceHttpError(Service.JioSaavn, response.status, kind, query, Operation.Search);

  const what = `${kind} search for "${query}"`;
  const answer = await readAnswer<{ results?: Result[] }>(response, what);
  if (!answer || !Array.isArray(answer.results)) {
    throw new UpstreamUnavailableError("jiosaavn", `${what} answered no results list`);
  }
  return answer.results;
}

function mapSongToTrack(song: JioSaavnSong): NormalizedTrack {
  const artists: string[] = [];

  // Extract primary artists
  if (song.more_info?.artistMap?.primary_artists) {
    for (const a of song.more_info.artistMap.primary_artists) {
      if (a.name) artists.push(a.name);
    }
  }

  if (artists.length === 0) {
    artists.push("Unknown Artist");
  }

  // Get best quality image (replace 150x150 with 500x500)
  const artworkUrl = song.image?.replace(/150x150|50x50/, "500x500");

  const durationSec = song.more_info?.duration ? parseInt(song.more_info.duration, 10) : undefined;
  const isExplicit = song.more_info?.explicit_content === "1" || song.explicit_content === "1";

  return {
    sourceService: "jiosaavn",
    sourceId: song.id,
    title: song.title ?? song.song ?? "",
    artists,
    albumName: song.more_info?.album,
    durationMs: durationSec ? durationSec * 1000 : undefined,
    artworkUrl,
    isExplicit: isExplicit || undefined,
    webUrl: song.perma_url,
  };
}

async function getTrackById(songId: string): Promise<NormalizedTrack | null> {
  const url = `https://www.jiosaavn.com/api.php?__call=webapi.get&token=${encodeURIComponent(songId)}&type=song&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0`;

  const response = await jiosaavnFetch(url);
  if (!response.ok) throw serviceHttpError(Service.JioSaavn, response.status, ResourceKind.Track, songId);

  // A token JioSaavn does not know answers an empty list.
  const data = await readAnswer<{ songs?: JioSaavnSong[] } | JioSaavnSong>(response, `track ${songId}`);
  if (!data) return null;

  // API can return { songs: [...] } or a direct song object
  const song = "songs" in data && Array.isArray(data.songs) ? data.songs[0] : (data as JioSaavnSong);
  if (!song?.id || !song?.title) return null;

  return mapSongToTrack(song);
}

async function searchSongs(query: string): Promise<JioSaavnSong[]> {
  return search<JioSaavnSong>("search.getResults", ResourceKind.Track, query);
}

function primaryArtistNames(album: JioSaavnAlbum): string[] {
  const structured = (album.more_info?.artistMap?.primary_artists ?? []).map((artist) => artist.name).filter(Boolean);
  if (structured.length > 0) return structured;
  return (album.primary_artists ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function mapAlbumToNormalized(album: JioSaavnAlbum & { id: string; title: string }): NormalizedAlbum {
  const artists = primaryArtistNames(album);
  if (artists.length === 0) artists.push("Unknown Artist");

  const songCount = album.more_info?.song_count
    ? parseInt(album.more_info.song_count, 10)
    : album.list_count
      ? parseInt(album.list_count, 10)
      : undefined;

  const tracks: AlbumTrackEntry[] = (album.songs ?? []).flatMap((song, index) => {
    const title = song.title ?? song.song;
    if (!title) return [];
    const duration = song.more_info?.duration ?? song.duration;
    const durationSec = duration ? parseInt(duration, 10) : undefined;
    return [{ title, trackNumber: index + 1, durationMs: durationSec ? durationSec * 1000 : undefined }];
  });

  return {
    sourceService: "jiosaavn",
    sourceId: album.id,
    upc: album.more_info?.upc,
    title: album.title,
    artists,
    releaseDate: album.more_info?.release_date ?? album.release_date ?? album.year,
    totalTracks: songCount ?? (tracks.length > 0 ? tracks.length : undefined),
    artworkUrl: album.image?.replace(/150x150|50x50/, "500x500"),
    label: album.more_info?.label,
    webUrl: album.perma_url,
    tracks: tracks.length > 0 ? tracks : undefined,
  };
}

async function getAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const url = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&albumid=${encodeURIComponent(albumId)}&_format=json&_marker=0&ctx=web6dot0`;
  const response = await jiosaavnFetch(url);
  if (!response.ok) throw serviceHttpError(Service.JioSaavn, response.status, ResourceKind.Album, albumId);

  const data = await readAnswer<JioSaavnAlbum>(response, `album ${albumId}`);
  if (!data) return null;
  const id = data.id ?? data.albumid;
  const title = data.title ?? data.name;
  if (!id || !title) return null;
  return mapAlbumToNormalized({ ...data, id, title });
}

async function searchAlbums(query: string): Promise<JioSaavnAlbumSearchResult[]> {
  return search<JioSaavnAlbumSearchResult>("search.getAlbumResults", ResourceKind.Album, query);
}

interface JioSaavnArtist {
  artistId: string;
  name: string;
  image: string;
  perma_url: string;
}

interface JioSaavnArtistSearchResult {
  id: string;
  name: string;
  image: string;
  perma_url: string;
  description?: string;
}

async function getArtistById(artistId: string): Promise<NormalizedArtist | null> {
  const url = `https://www.jiosaavn.com/api.php?__call=webapi.get&token=${encodeURIComponent(artistId)}&type=artist&n_song=0&n_album=0&_format=json&_marker=0&ctx=web6dot0`;
  const response = await jiosaavnFetch(url);
  if (!response.ok) throw serviceHttpError(Service.JioSaavn, response.status, ResourceKind.Artist, artistId);

  // A token JioSaavn does not know answers an empty body or an artist without `artistId`.
  const data = await readAnswer<JioSaavnArtist>(response, `artist ${artistId}`);
  if (!data?.artistId || !data?.name) return null;

  return {
    sourceService: "jiosaavn",
    sourceId: data.artistId,
    name: data.name,
    imageUrl: data.image?.replace(/150x150|50x50/, "500x500"),
    webUrl: data.perma_url ?? `https://www.jiosaavn.com/artist/-/${data.artistId}`,
  };
}

async function searchArtists(query: string): Promise<JioSaavnArtistSearchResult[]> {
  return search<JioSaavnArtistSearchResult>("search.getArtistResults", ResourceKind.Artist, query);
}

export const jiosaavnAdapter: ServiceAdapter = {
  id: "jiosaavn",
  displayName: getPlatformLabel("jiosaavn"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = JIOSAAVN_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await getTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(Service.JioSaavn, ResourceKind.Track, trackId);
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
      log.debug("JioSaavn", "Search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("JioSaavn", `Search returned ${songs.length} results for: ${q}`);

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      if (!song.id || !song.title) continue;

      const track = mapSongToTrack(song);
      const confidence = scoreSearchCandidate(query, track, i);

      log.debug(
        "JioSaavn",
        `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      log.debug("JioSaavn", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
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
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  },

  detectAlbumUrl(url: string): string | null {
    const match = JIOSAAVN_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await getAlbumById(albumId);
    if (!album) throw serviceNotFoundError(Service.JioSaavn, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const results = await searchAlbums(q);
    if (results.length === 0) {
      log.debug("JioSaavn", "Album search returned no results for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("JioSaavn", `Album search returned ${results.length} results for: ${q}`);

    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (const r of results) {
      const artists = r.music ? [r.music] : ["Unknown Artist"];
      const confidence = scoreAlbumCandidate(query, { title: r.title, artists, releaseDate: r.year });
      log.debug("JioSaavn", `  "${r.title}" -> confidence=${confidence.toFixed(3)}`);
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        if (bestConfidence > 0.4) {
          const full = await getAlbumById(r.id);
          if (full) bestMatch = full;
        }
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
    const match = JIOSAAVN_ARTIST_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const artist = await getArtistById(artistId);
    if (!artist) {
      throw serviceNotFoundError(Service.JioSaavn, ResourceKind.Artist, artistId);
    }
    return artist;
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const results = await searchArtists(query.name);
    if (results.length === 0) {
      log.debug("JioSaavn", "Artist search returned no results for:", query.name);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("JioSaavn", `Artist search returned ${results.length} results for: ${query.name}`);

    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of results) {
      const confidence = calculateArtistNameConfidence(query.name, item.name);

      log.debug("JioSaavn", `  "${item.name}" -> confidence=${confidence.toFixed(3)}`);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestArtist = {
          sourceService: "jiosaavn",
          sourceId: item.id,
          name: item.name,
          imageUrl: item.image?.replace(/150x150|50x50/, "500x500"),
          webUrl: item.perma_url ?? `https://www.jiosaavn.com/artist/-/${item.id}`,
        };
      }
    }

    if (!bestArtist || bestConfidence < MATCH_MIN_CONFIDENCE) {
      log.debug(
        "JioSaavn",
        `Best artist confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`,
      );
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return { found: true, artist: bestArtist, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;
