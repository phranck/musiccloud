import { RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../lib/infra/fetch";
import { log } from "../../lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "../../lib/resolve/normalize";
import { serviceNotFoundError } from "../../lib/resolve/service-errors";
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
} from "../types.js";

const MATCH_MIN_CONFIDENCE = 0.6;

// JioSaavn URLs: jiosaavn.com/song/{slug}/{id}
const JIOSAAVN_TRACK_REGEX = /^https?:\/\/(?:www\.)?jiosaavn\.com\/song\/[^/]+\/([A-Za-z0-9_-]+)/;
// JioSaavn album URLs: jiosaavn.com/album/{slug}/{id}
const JIOSAAVN_ALBUM_REGEX = /^https?:\/\/(?:www\.)?jiosaavn\.com\/album\/[^/]+\/([A-Za-z0-9_-]+)/;
// JioSaavn artist URLs: jiosaavn.com/artist/{slug}/{id}
const JIOSAAVN_ARTIST_REGEX = /^https?:\/\/(?:www\.)?jiosaavn\.com\/artist\/[^/]+\/([A-Za-z0-9_-]+)/;

interface JioSaavnAlbum {
  id: string;
  title: string;
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
  title: string;
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
    title: song.title,
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
  if (!response.ok) return null;

  const text = await response.text();
  // JioSaavn sometimes returns HTML instead of JSON
  if (text.startsWith("<!")) return null;

  try {
    const data = JSON.parse(text) as { songs?: JioSaavnSong[] } | JioSaavnSong;

    // API can return { songs: [...] } or a direct song object
    const song = "songs" in data && Array.isArray(data.songs) ? data.songs[0] : (data as JioSaavnSong);
    if (!song?.id || !song?.title) return null;

    return mapSongToTrack(song);
  } catch {
    return null;
  }
}

async function searchSongs(query: string): Promise<JioSaavnSong[]> {
  const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=5&q=${encodeURIComponent(query)}`;

  const response = await jiosaavnFetch(url);
  if (!response.ok) return [];

  const text = await response.text();
  if (text.startsWith("<!")) return [];

  try {
    const data = JSON.parse(text) as { results?: JioSaavnSong[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

function mapAlbumToNormalized(album: JioSaavnAlbum): NormalizedAlbum {
  const artists: string[] = [];
  if (album.more_info?.artistMap?.primary_artists) {
    for (const a of album.more_info.artistMap.primary_artists) {
      if (a.name) artists.push(a.name);
    }
  }
  if (artists.length === 0) artists.push("Unknown Artist");

  const songCount = album.more_info?.song_count
    ? parseInt(album.more_info.song_count, 10)
    : album.list_count
      ? parseInt(album.list_count, 10)
      : undefined;

  const tracks: AlbumTrackEntry[] = (album.songs ?? []).map((s, i) => {
    const durationSec = s.more_info?.duration ? parseInt(s.more_info.duration, 10) : undefined;
    return {
      title: s.title,
      trackNumber: i + 1,
      durationMs: durationSec ? durationSec * 1000 : undefined,
    };
  });

  return {
    sourceService: "jiosaavn",
    sourceId: album.id,
    upc: album.more_info?.upc,
    title: album.title,
    artists,
    releaseDate: album.more_info?.release_date ?? album.year,
    totalTracks: songCount,
    artworkUrl: album.image?.replace(/150x150|50x50/, "500x500"),
    label: album.more_info?.label,
    webUrl: album.perma_url,
    tracks: tracks.length > 0 ? tracks : undefined,
  };
}

async function getAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const url = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&albumid=${encodeURIComponent(albumId)}&_format=json&_marker=0&ctx=web6dot0`;
  const response = await jiosaavnFetch(url);
  if (!response.ok) return null;

  const text = await response.text();
  if (text.startsWith("<!")) return null;

  try {
    const data = JSON.parse(text) as JioSaavnAlbum;
    if (!data?.id || !data?.title) return null;
    return mapAlbumToNormalized(data);
  } catch {
    return null;
  }
}

async function searchAlbums(query: string): Promise<JioSaavnAlbumSearchResult[]> {
  const url = `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=5&q=${encodeURIComponent(query)}`;
  const response = await jiosaavnFetch(url);
  if (!response.ok) return [];

  const text = await response.text();
  if (text.startsWith("<!")) return [];

  try {
    const data = JSON.parse(text) as { results?: JioSaavnAlbumSearchResult[] };
    return data.results ?? [];
  } catch {
    return [];
  }
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
  if (!response.ok) return null;

  const text = await response.text();
  if (text.startsWith("<!")) return null;

  try {
    const data = JSON.parse(text) as JioSaavnArtist;
    if (!data?.artistId || !data?.name) return null;

    return {
      sourceService: "jiosaavn",
      sourceId: data.artistId,
      name: data.name,
      imageUrl: data.image?.replace(/150x150|50x50/, "500x500"),
      webUrl: data.perma_url ?? `https://www.jiosaavn.com/artist/-/${data.artistId}`,
    };
  } catch {
    return null;
  }
}

async function searchArtists(query: string): Promise<JioSaavnArtistSearchResult[]> {
  const url = `https://www.jiosaavn.com/api.php?__call=search.getArtistResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=5&q=${encodeURIComponent(query)}`;
  const response = await jiosaavnFetch(url);
  if (!response.ok) return [];

  const text = await response.text();
  if (text.startsWith("<!")) return [];

  try {
    const data = JSON.parse(text) as { results?: JioSaavnArtistSearchResult[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

export const jiosaavnAdapter: ServiceAdapter = {
  id: "jiosaavn",
  displayName: "JioSaavn",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed
  },

  detectUrl(url: string): string | null {
    const match = JIOSAAVN_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await getTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(SERVICE.JIOSAAVN, RESOURCE_KIND.TRACK, trackId);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const songs = await searchSongs(q);
      if (songs.length === 0) {
        log.debug("JioSaavn", "Search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("JioSaavn", `Search returned ${songs.length} results for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        if (!song.id || !song.title) continue;

        const track = mapSongToTrack(song);
        let confidence: number;

        if (isFreeText) {
          confidence = Math.max(0.4, 0.85 - i * 0.05);
        } else {
          confidence = calculateConfidence(
            { title: query.title, artists: [query.artist], durationMs: undefined },
            { title: track.title, artists: track.artists, durationMs: track.durationMs },
          );
        }

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
    } catch (error) {
      log.debug("JioSaavn", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
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
    if (!album) throw serviceNotFoundError(SERVICE.JIOSAAVN, RESOURCE_KIND.ALBUM, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
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
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], releaseDate: query.year },
          { title: r.title, artists, releaseDate: r.year },
        );
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
    } catch (error) {
      log.debug("JioSaavn", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
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
      throw serviceNotFoundError(SERVICE.JIOSAAVN, RESOURCE_KIND.ARTIST, artistId);
    }
    return artist;
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    try {
      const results = await searchArtists(query.name);
      if (results.length === 0) {
        log.debug("JioSaavn", "Artist search returned no results for:", query.name);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("JioSaavn", `Artist search returned ${results.length} results for: ${query.name}`);

      let bestArtist: NormalizedArtist | null = null;
      let bestConfidence = 0;

      for (const item of results) {
        const confidence = calculateConfidence(
          { title: query.name, artists: [], durationMs: undefined },
          { title: item.name, artists: [], durationMs: undefined },
        );

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
    } catch (error) {
      log.debug("JioSaavn", "Artist search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
