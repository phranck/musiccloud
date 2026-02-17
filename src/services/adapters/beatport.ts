import { fetchWithTimeout } from "../../lib/fetch.js";
import { log } from "../../lib/logger.js";
import { calculateConfidence } from "../../lib/normalize.js";
import type { MatchResult, NormalizedTrack, SearchQuery, ServiceAdapter } from "../types.js";

const MATCH_MIN_CONFIDENCE = 0.6;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Beatport URLs: beatport.com/track/{slug}/{id}
const BEATPORT_TRACK_REGEX = /^https?:\/\/(?:www\.)?beatport\.com\/track\/[^/]+\/(\d+)/;

interface BeatportTrack {
  id: number;
  name: string;
  mix_name?: string;
  slug: string;
  isrc?: string;
  length_ms?: number;
  length?: string; // "7:22"
  bpm?: number;
  key?: { name?: string };
  genre?: { name?: string };
  sub_genre?: { name?: string };
  artists?: Array<{ name: string; slug: string }>;
  release?: { name?: string; image?: { uri?: string } };
  label?: { name?: string };
  publish_date?: string;
  image?: { uri?: string };
  preview?: { mp3?: { url?: string } };
  exclusive?: boolean;
}

async function beatportFetch(url: string, timeoutMs = 10000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
    timeoutMs,
  );
}

function parseNextData(html: string): Record<string, unknown> | null {
  const match = /__NEXT_DATA__[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractTrackFromNextData(data: Record<string, unknown>): BeatportTrack | null {
  try {
    const props = data.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const dehydratedState = pageProps?.dehydratedState as Record<string, unknown> | undefined;
    const queries = dehydratedState?.queries as Array<Record<string, unknown>> | undefined;

    if (!queries) return null;

    for (const q of queries) {
      const state = q.state as Record<string, unknown> | undefined;
      const stateData = state?.data as Record<string, unknown> | undefined;

      // Direct track data
      if (stateData && "name" in stateData && "id" in stateData && "artists" in stateData) {
        return stateData as unknown as BeatportTrack;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractSearchResultsFromNextData(data: Record<string, unknown>): BeatportTrack[] {
  try {
    const props = data.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const dehydratedState = pageProps?.dehydratedState as Record<string, unknown> | undefined;
    const queries = dehydratedState?.queries as Array<Record<string, unknown>> | undefined;

    if (!queries) return [];

    for (const q of queries) {
      const state = q.state as Record<string, unknown> | undefined;
      const stateData = state?.data as Record<string, unknown> | undefined;

      // Search results
      if (stateData && "tracks" in stateData) {
        const tracks = stateData.tracks as BeatportTrack[] | undefined;
        return tracks ?? [];
      }

      // Alternative: results array
      if (stateData && Array.isArray(stateData)) {
        return stateData.filter((item: unknown) => {
          const record = item as Record<string, unknown>;
          return record && typeof record.name === "string" && typeof record.id === "number";
        }) as unknown as BeatportTrack[];
      }
    }

    return [];
  } catch {
    return [];
  }
}

function mapTrack(track: BeatportTrack): NormalizedTrack {
  const artists = track.artists?.map((a) => a.name).filter(Boolean) ?? ["Unknown Artist"];

  // Full track name: "Name (Mix Name)"
  const title = track.mix_name && track.mix_name !== "Original Mix" ? `${track.name} (${track.mix_name})` : track.name;

  const artworkUrl = track.image?.uri ?? track.release?.image?.uri;

  // Parse length string "7:22" to ms if length_ms not available
  let durationMs = track.length_ms;
  if (!durationMs && track.length) {
    const parts = track.length.split(":");
    if (parts.length === 2) {
      durationMs = (parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)) * 1000;
    }
  }

  return {
    sourceService: "beatport",
    sourceId: String(track.id),
    title,
    artists,
    albumName: track.release?.name,
    durationMs,
    isrc: track.isrc || undefined,
    artworkUrl,
    releaseDate: track.publish_date,
    webUrl: `https://www.beatport.com/track/${track.slug}/${track.id}`,
  };
}

async function fetchTrackById(trackId: string): Promise<NormalizedTrack | null> {
  // Fetch track page and extract from __NEXT_DATA__
  const url = `https://www.beatport.com/track/x/${trackId}`;
  const response = await beatportFetch(url);
  if (!response.ok) return null;

  const html = await response.text();

  // Try __NEXT_DATA__ first
  const nextData = parseNextData(html);
  if (nextData) {
    const track = extractTrackFromNextData(nextData);
    if (track) return mapTrack(track);
  }

  // Fallback to OG tags
  const ogTitle = /<meta\s+property="og:title"\s+content="([^"]*)"[^>]*>/i.exec(html)?.[1];
  const ogImage = /<meta\s+property="og:image"\s+content="([^"]*)"[^>]*>/i.exec(html)?.[1];

  if (ogTitle) {
    // OG title: "Artist - Track (Mix) [Label] | Beatport"
    const titleMatch = /^(.+?)\s*-\s*(.+?)(?:\s*\[.*\])?\s*\|?\s*(?:Music & Downloads on\s*)?Beatport$/i.exec(ogTitle);
    if (titleMatch) {
      return {
        sourceService: "beatport",
        sourceId: trackId,
        title: titleMatch[2].trim(),
        artists: [titleMatch[1].trim()],
        artworkUrl: ogImage || undefined,
        webUrl: `https://www.beatport.com/track/x/${trackId}`,
      };
    }
  }

  return null;
}

export const beatportAdapter: ServiceAdapter = {
  id: "beatport",
  displayName: "Beatport",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed (SSR scraping)
  },

  detectUrl(url: string): string | null {
    const match = BEATPORT_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw new Error(`Beatport: Track not found: ${trackId}`);
    }
    return track;
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    // Search for ISRC via the search page
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(isrc)}`;
    const response = await beatportFetch(searchUrl);
    if (!response.ok) return null;

    const html = await response.text();
    const nextData = parseNextData(html);
    if (!nextData) return null;

    const tracks = extractSearchResultsFromNextData(nextData);
    const match = tracks.find((t) => t.isrc === isrc);
    if (!match) return null;

    return mapTrack(match);
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(q)}`;
      const response = await beatportFetch(searchUrl);
      if (!response.ok) {
        log.debug("Beatport", "Search page failed:", response.status);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const html = await response.text();
      const nextData = parseNextData(html);

      if (!nextData) {
        log.debug("Beatport", "No __NEXT_DATA__ found in search page");
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const tracks = extractSearchResultsFromNextData(nextData);
      if (tracks.length === 0) {
        log.debug("Beatport", "Search returned no tracks for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Beatport", `Search returned ${tracks.length} tracks for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < Math.min(tracks.length, 5); i++) {
        const bpTrack = tracks[i];
        if (!bpTrack.id || !bpTrack.name) continue;

        const track = mapTrack(bpTrack);
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
          "Beatport",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("Beatport", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("Beatport", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
