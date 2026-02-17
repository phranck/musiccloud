import { fetchWithTimeout } from "../../lib/fetch.js";
import { log } from "../../lib/logger.js";
import { calculateConfidence } from "../../lib/normalize.js";
import type { MatchResult, NormalizedTrack, SearchQuery, ServiceAdapter } from "../types.js";

const MATCH_MIN_CONFIDENCE = 0.6;

// JioSaavn URLs: jiosaavn.com/song/{slug}/{id}
const JIOSAAVN_TRACK_REGEX = /^https?:\/\/(?:www\.)?jiosaavn\.com\/song\/[^/]+\/([A-Za-z0-9_-]+)/;

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
      throw new Error(`JioSaavn: Track not found: ${trackId}`);
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
} satisfies ServiceAdapter & Record<string, unknown>;
