import { fetchWithTimeout } from "../../lib/infra/fetch";
import { log } from "../../lib/infra/logger";
import { calculateConfidence } from "../../lib/resolve/normalize";
import { MATCH_MIN_CONFIDENCE } from "../constants.js";
import type {
  ArtistCapabilities,
  ArtistMatchResult,
  ArtistSearchQuery,
  MatchResult,
  NormalizedArtist,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../types.js";

// NOTE: Napster Developer Portal no longer accepts new sign-ups (as of Feb 2026).
// Existing API keys still work. Contact api-team@napster.com for new key requests.
// Scraping not viable: Napster is a pure SPA with no SSR metadata.
const API_BASE = "https://api.napster.com/v2.2";

// Matches: play.napster.com/track/tra.123, web.napster.com/track/tra.123,
// app.napster.com/artist/.../album/.../track/...
const NAPSTER_TRACK_REGEX =
  /(?:https?:\/\/)?(?:play\.|web\.|app\.|www\.)?napster\.com\/(?:track\/(tra\.\d+)|.*\/track\/([^/?]+))/;

// Matches: play.napster.com/artist/art.123, web.napster.com/artist/art.123,
// app.napster.com/artist/artist-slug
const NAPSTER_ARTIST_REGEX =
  /(?:https?:\/\/)?(?:play\.|web\.|app\.|www\.)?napster\.com\/artist\/(art\.\d+|[^/?]+)(?:\/|$|\?)/;

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

function getApiKey(): string {
  const key = process.env.NAPSTER_API_KEY;
  if (!key) {
    throw new Error("NAPSTER_API_KEY must be set");
  }
  return key;
}

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
  // Split combined artist names (e.g. "A, B & C") into individual entries
  const artists = raw.artistName
    ? raw.artistName
        .split(/[,&]/)
        .map((a) => a.trim())
        .filter(Boolean)
    : ["Unknown Artist"];

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

export function _resetForTesting(): void {
  // No token state to reset (API key is static)
}

export const napsterAdapter = {
  id: "napster",
  displayName: "Napster",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: true,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return Boolean(process.env.NAPSTER_API_KEY);
  },

  detectUrl(url: string): string | null {
    const match = NAPSTER_TRACK_REGEX.exec(url);
    if (!match) return null;
    // match[1] = direct track ID (tra.xxx), match[2] = slug-based track name
    return match[1] ?? match[2] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    // If trackId is not in tra.xxx format, it's a slug - we can't look it up directly
    const endpoint = trackId.startsWith("tra.") ? `/tracks/${encodeURIComponent(trackId)}` : `/tracks/top?limit=1`; // Fallback; slug-based lookup not supported by API

    if (!trackId.startsWith("tra.")) {
      throw new Error(`Napster: slug-based track lookup not supported: ${trackId}`);
    }

    const response = await napsterFetch(endpoint);

    if (!response.ok) {
      throw new Error(`Napster getTrack failed: ${response.status}`);
    }

    const data = (await response.json()) as NapsterTracksResponse;
    const tracks = data.tracks;

    if (!tracks || tracks.length === 0) {
      throw new Error("Napster: track not found");
    }

    return mapTrack(tracks[0]);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await napsterFetch(`/tracks/isrc/${encodeURIComponent(isrc)}`);

    if (!response.ok) {
      log.debug("Napster", "ISRC lookup failed:", response.status);
      return null;
    }

    const data = (await response.json()) as NapsterTracksResponse;
    const tracks = data.tracks;

    if (!tracks || tracks.length === 0) {
      log.debug("Napster", "ISRC not found:", isrc);
      return null;
    }

    return mapTrack(tracks[0]);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    const response = await napsterFetch(`/search?query=${encodeURIComponent(q)}&type=track&per_type_limit=5`);

    if (!response.ok) {
      log.debug("Napster", "Search API failed:", response.status);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = (await response.json()) as NapsterSearchResponse;
    const items = data.search?.data?.tracks ?? [];

    if (items.length === 0) {
      log.debug("Napster", "Search returned no tracks for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Napster", `Search returned ${items.length} tracks for: ${q}`);

    const isFreeText = query.title === query.artist;
    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < items.length; i++) {
      const track = mapTrack(items[i]);
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

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const endpoint = `/artists/${encodeURIComponent(artistId)}`;
    const response = await napsterFetch(endpoint);

    if (!response.ok) {
      throw new Error(`Napster getArtist failed: ${response.status}`);
    }

    const data = (await response.json()) as NapsterArtistsResponse;
    const artists = data.artists;

    if (!artists || artists.length === 0) {
      throw new Error("Napster: artist not found");
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
      log.debug("Napster", "Artist search API failed:", response.status);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = (await response.json()) as NapsterArtistSearchResponse;
    const items = data.search?.data?.artists ?? [];

    if (items.length === 0) {
      log.debug("Napster", "Artist search returned no results for:", query.name);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Napster", `Artist search returned ${items.length} results for: ${query.name}`);

    let bestArtist: NormalizedArtist | null = null;
    let bestConfidence = 0;

    for (const item of items) {
      const confidence = calculateConfidence(
        { title: query.name, artists: [], durationMs: undefined },
        { title: item.name, artists: [], durationMs: undefined },
      );

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
