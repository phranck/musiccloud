import { fetchWithTimeout } from "../../lib/infra/fetch";
import { log } from "../../lib/infra/logger";
import { calculateAlbumConfidence, calculateConfidence } from "../../lib/resolve/normalize";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  AlbumTrackEntry,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../types.js";

const MATCH_MIN_CONFIDENCE = 0.6;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Bandcamp URLs: {artist}.bandcamp.com/track/{slug}
const BANDCAMP_TRACK_REGEX = /^https?:\/\/([a-z0-9-]+)\.bandcamp\.com\/track\/([a-z0-9-]+)/;
// Bandcamp album URLs: {artist}.bandcamp.com/album/{slug}
const BANDCAMP_ALBUM_REGEX = /^https?:\/\/([a-z0-9-]+)\.bandcamp\.com\/album\/([a-z0-9-]+)/;

interface BandcampAlbumJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  datePublished?: string;
  byArtist?: { name?: string };
  numTracks?: number;
  track?: {
    itemListElement?: Array<{
      position: number;
      item?: { "@type"?: string; name?: string; duration?: string };
    }>;
  };
}

interface BandcampJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  duration?: string; // ISO 8601: "P00H03M45S"
  datePublished?: string;
  byArtist?: { name?: string };
  inAlbum?: { name?: string; albumRelease?: Array<{ "@type"?: string }> };
  recordingOf?: { name?: string };
}

function parseDuration(iso: string): number | undefined {
  const match = /^P(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return undefined;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

async function bandcampFetch(url: string, timeoutMs = 8000): Promise<Response> {
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

function parseJsonLd(html: string): BandcampJsonLd | null {
  const match = /application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;

  try {
    const data = JSON.parse(match[1]) as BandcampJsonLd;
    if (data["@type"] !== "MusicRecording") return null;
    return data;
  } catch {
    return null;
  }
}

function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const regex = /<meta\s+property="og:(\w+)"\s+content="([^"]*)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    tags[m[1]] = m[2];
  }
  return tags;
}

async function fetchTrackByUrl(trackUrl: string): Promise<NormalizedTrack | null> {
  const response = await bandcampFetch(trackUrl);
  if (!response.ok) return null;

  const html = await response.text();

  // Try JSON-LD first
  const jsonLd = parseJsonLd(html);
  if (jsonLd?.name) {
    const artist = jsonLd.byArtist?.name ?? "Unknown Artist";
    return {
      sourceService: "bandcamp",
      sourceId: trackUrl,
      title: jsonLd.name,
      artists: [artist],
      albumName: jsonLd.inAlbum?.name,
      durationMs: jsonLd.duration ? parseDuration(jsonLd.duration) : undefined,
      artworkUrl: jsonLd.image,
      releaseDate: jsonLd.datePublished,
      webUrl: jsonLd.url ?? trackUrl,
    };
  }

  // Fallback to OG tags
  const og = extractOgTags(html);
  if (og.title) {
    // OG title format: "Track, by Artist"
    const parts = og.title.split(", by ");
    const title = parts[0] ?? og.title;
    const artist = parts[1] ?? "Unknown Artist";

    return {
      sourceService: "bandcamp",
      sourceId: trackUrl,
      title,
      artists: [artist],
      artworkUrl: og.image,
      webUrl: og.url ?? trackUrl,
    };
  }

  return null;
}

async function searchBandcamp(query: string): Promise<Array<{ url: string; name: string; artist: string }>> {
  const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=t`;
  const response = await bandcampFetch(searchUrl);
  if (!response.ok) return [];

  const html = await response.text();
  const results: Array<{ url: string; name: string; artist: string }> = [];

  // Extract search results: <div class="result-info"> blocks
  const resultBlocks = html.matchAll(/<div class="result-info">([\s\S]*?)<\/div>\s*<\/li>/g);
  for (const block of resultBlocks) {
    const content = block[1];
    if (!content) continue;

    // Extract URL
    const urlMatch = /href="(https?:\/\/[a-z0-9-]+\.bandcamp\.com\/track\/[^"?]+)/.exec(content);
    if (!urlMatch) continue;

    // Extract track name
    const nameMatch = /<div class="heading">\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/.exec(content);
    // Extract artist
    const artistMatch = /by\s+([\s\S]*?)\s*</.exec(content);

    results.push({
      url: urlMatch[1],
      name: nameMatch?.[1]?.trim() ?? "",
      artist: artistMatch?.[1]?.trim() ?? "",
    });

    if (results.length >= 5) break;
  }

  return results;
}

function parseAlbumJsonLd(html: string): BandcampAlbumJsonLd | null {
  const match = /application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;
  try {
    const data = JSON.parse(match[1]) as BandcampAlbumJsonLd;
    if (data["@type"] !== "MusicAlbum" || !data.name) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchAlbumByUrl(albumUrl: string): Promise<NormalizedAlbum | null> {
  const response = await bandcampFetch(albumUrl);
  if (!response.ok) return null;
  const html = await response.text();
  const jsonLd = parseAlbumJsonLd(html);
  if (!jsonLd) return null;

  const artist = jsonLd.byArtist?.name ?? "Unknown Artist";
  const tracks: AlbumTrackEntry[] = [];
  for (const item of jsonLd.track?.itemListElement ?? []) {
    if (item.item?.name) {
      tracks.push({
        title: item.item.name,
        trackNumber: item.position,
        durationMs: item.item.duration ? parseDuration(item.item.duration) : undefined,
      });
    }
  }

  return {
    sourceService: "bandcamp",
    sourceId: albumUrl.split("?")[0],
    title: jsonLd.name!,
    artists: [artist],
    releaseDate: jsonLd.datePublished,
    totalTracks: jsonLd.numTracks ?? (tracks.length > 0 ? tracks.length : undefined),
    artworkUrl: jsonLd.image,
    webUrl: jsonLd.url ?? albumUrl,
    tracks: tracks.length > 0 ? tracks : undefined,
  };
}

async function searchBandcampAlbums(query: string): Promise<Array<{ url: string; name: string; artist: string }>> {
  const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=a`;
  const response = await bandcampFetch(searchUrl);
  if (!response.ok) return [];

  const html = await response.text();
  const results: Array<{ url: string; name: string; artist: string }> = [];
  const resultBlocks = html.matchAll(/<div class="result-info">([\s\S]*?)<\/div>\s*<\/li>/g);
  for (const block of resultBlocks) {
    const content = block[1];
    if (!content) continue;
    const urlMatch = /href="(https?:\/\/[a-z0-9-]+\.bandcamp\.com\/album\/[^"?]+)/.exec(content);
    if (!urlMatch) continue;
    const nameMatch = /<div class="heading">\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/.exec(content);
    const artistMatch = /by\s+([\s\S]*?)\s*</.exec(content);
    results.push({
      url: urlMatch[1],
      name: nameMatch?.[1]?.trim() ?? "",
      artist: artistMatch?.[1]?.trim() ?? "",
    });
    if (results.length >= 5) break;
  }
  return results;
}

export const bandcampAdapter: ServiceAdapter = {
  id: "bandcamp",
  displayName: "Bandcamp",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed
  },

  detectUrl(url: string): string | null {
    const match = BANDCAMP_TRACK_REGEX.exec(url);
    if (!match) return null;
    // Return the full URL as the ID since Bandcamp uses subdomain-based URLs
    return url.split("?")[0];
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackByUrl(trackId);
    if (!track) {
      throw new Error(`Bandcamp: Track not found: ${trackId}`);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const results = await searchBandcamp(q);
      if (results.length === 0) {
        log.debug("Bandcamp", "Search returned no results for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Bandcamp", `Search returned ${results.length} results for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      // Fetch track pages in parallel for full metadata
      const trackResults = await Promise.allSettled(results.map((r) => fetchTrackByUrl(r.url)));

      for (let i = 0; i < trackResults.length; i++) {
        const result = trackResults[i];
        if (result.status !== "fulfilled" || !result.value) continue;

        const track = result.value;
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
          "Bandcamp",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("Bandcamp", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("Bandcamp", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  },

  detectAlbumUrl(url: string): string | null {
    const match = BANDCAMP_ALBUM_REGEX.exec(url);
    return match ? url.split("?")[0] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumByUrl(albumId);
    if (!album) throw new Error(`Bandcamp: Album not found: ${albumId}`);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const results = await searchBandcampAlbums(q);
      if (results.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

      const albumResults = await Promise.allSettled(results.map((r) => fetchAlbumByUrl(r.url)));
      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const result of albumResults) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const album = result.value;
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], totalTracks: query.totalTracks, releaseDate: query.year },
          {
            title: album.title,
            artists: album.artists,
            totalTracks: album.totalTracks,
            releaseDate: album.releaseDate,
          },
        );
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
      log.debug("Bandcamp", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
