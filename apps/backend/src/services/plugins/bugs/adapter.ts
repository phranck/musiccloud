/**
 * @file Bugs! (Korean) adapter: HTML-scraping track + album resolves.
 *
 * Keyless (always available). Bugs! publishes no external API, so the
 * adapter scrapes the user-facing pages at `music.bugs.co.kr`:
 *
 * - Track/album lookup: fetch the page, parse `og:title` and `og:image`.
 *   The `og:title` is formatted as `"Name / Artist"`; we split on that.
 * - Text search: fetch `/search/track?q=...` (or `/search/album`),
 *   regex the returned HTML for `/track/{id}` (or `/album/{id}`) hrefs,
 *   then fetch each page to get the structured metadata.
 *
 * The User-Agent is a full desktop Chrome string because Bugs! returns
 * different (or blocked) content for missing/bot UAs. The Accept-Language
 * favours English + Korean; leaving it at the default would often get
 * Korean-only pages that the OG-parse below can still handle but that
 * produce worse downstream search behaviour.
 *
 * ## No ISRC
 *
 * Bugs!'s public pages do not expose ISRC. `findByIsrc` returns null,
 * so cross-service resolves into Bugs! always go through text search.
 *
 * ## Scraping fragility
 *
 * Any change to the Bugs! page template (OG-title format, HTML of the
 * search results) can break this adapter. Log messages on each step
 * make failures debuggable: look for `Search returned 0 IDs` or
 * `confidence below threshold` to tell fetch-failure from
 * parse-failure.
 */
import { RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { calculateAlbumConfidence } from "../../../lib/resolve/normalize";
import { serviceNotFoundError } from "../../../lib/resolve/service-errors";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../../types.js";
import { splitArtistNames } from "../_shared/artists.js";
import { scoreSearchCandidate } from "../_shared/confidence.js";
import { extractOgTags } from "../_shared/og.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

const MATCH_MIN_CONFIDENCE = 0.6;

// Bugs! URLs: music.bugs.co.kr/track/{trackId}
const BUGS_TRACK_REGEX = /^https?:\/\/music\.bugs\.co\.kr\/track\/(\d+)/;
// Bugs! album URLs: music.bugs.co.kr/album/{albumId}
const BUGS_ALBUM_REGEX = /^https?:\/\/music\.bugs\.co\.kr\/album\/(\d+)/;

async function bugsFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
      },
    },
    timeoutMs,
  );
}

async function fetchTrackById(trackId: string): Promise<NormalizedTrack | null> {
  const url = `https://music.bugs.co.kr/track/${trackId}`;
  const response = await bugsFetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const og = extractOgTags(html);

  if (!og.title) return null;

  // Bugs! OG title format: "Song / Artist" or "Song"
  let title: string;
  let artist: string;

  if (og.title.includes(" / ")) {
    const parts = og.title.split(" / ");
    title = parts[0].trim();
    artist = parts.slice(1).join(" / ").trim();
  } else {
    title = og.title;
    artist = "Unknown Artist";
  }

  const artists = splitArtistNames(artist);

  return {
    sourceService: "bugs",
    sourceId: trackId,
    title,
    artists,
    artworkUrl: og.image,
    webUrl: `https://music.bugs.co.kr/track/${trackId}`,
  };
}

async function searchForTrackIds(query: string): Promise<string[]> {
  const searchUrl = `https://music.bugs.co.kr/search/track?q=${encodeURIComponent(query)}`;
  const response = await bugsFetch(searchUrl);
  if (!response.ok) return [];

  const html = await response.text();

  // Extract track IDs from href="/track/{id}" patterns
  const trackIds: string[] = [];
  const seen = new Set<string>();
  const idMatches = html.matchAll(/\/track\/(\d+)/g);
  for (const m of idMatches) {
    if (m[1] && !seen.has(m[1])) {
      seen.add(m[1]);
      trackIds.push(m[1]);
    }
    if (trackIds.length >= 5) break;
  }

  return trackIds;
}

async function fetchAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const url = `https://music.bugs.co.kr/album/${albumId}`;
  const response = await bugsFetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const og = extractOgTags(html);

  if (!og.title) return null;

  // Bugs! album OG title format: "AlbumName / Artist" or "AlbumName"
  let title: string;
  let artists: string[];

  if (og.title.includes(" / ")) {
    const parts = og.title.split(" / ");
    title = parts[0].trim();
    artists = splitArtistNames(parts.slice(1).join(" / ").trim());
  } else {
    title = og.title;
    artists = ["Unknown Artist"];
  }

  return {
    sourceService: "bugs",
    sourceId: albumId,
    title,
    artists,
    artworkUrl: og.image,
    webUrl: `https://music.bugs.co.kr/album/${albumId}`,
  };
}

async function searchBugsAlbumIds(query: string): Promise<string[]> {
  const searchUrl = `https://music.bugs.co.kr/search/album?q=${encodeURIComponent(query)}`;
  const response = await bugsFetch(searchUrl);
  if (!response.ok) return [];

  const html = await response.text();
  const albumIds: string[] = [];
  const seen = new Set<string>();
  const idMatches = html.matchAll(/\/album\/(\d+)/g);
  for (const m of idMatches) {
    if (m[1] && !seen.has(m[1])) {
      seen.add(m[1]);
      albumIds.push(m[1]);
    }
    if (albumIds.length >= 5) break;
  }
  return albumIds;
}

export const bugsAdapter: ServiceAdapter = {
  id: "bugs",
  displayName: "Bugs!",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true; // No credentials needed
  },

  detectUrl(url: string): string | null {
    const match = BUGS_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(SERVICE.BUGS, RESOURCE_KIND.TRACK, trackId);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const trackIds = await searchForTrackIds(q);
      if (trackIds.length === 0) {
        log.debug("Bugs!", "Search returned no track IDs for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Bugs!", `Search returned ${trackIds.length} IDs for: ${q}`);

      // Fetch track pages in parallel
      const trackResults = await Promise.allSettled(trackIds.map((id) => fetchTrackById(id)));

      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < trackResults.length; i++) {
        const result = trackResults[i];
        if (result.status !== "fulfilled" || !result.value) continue;

        const track = result.value;
        const confidence = scoreSearchCandidate(query, track, i);

        log.debug(
          "Bugs!",
          `  [${i}] "${track.title}" by ${track.artists.join(", ")} -> confidence=${confidence.toFixed(3)}`,
        );

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = track;
        }
      }

      if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
        log.debug("Bugs!", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
        return { found: false, confidence: bestConfidence, matchMethod: "search" };
      }

      return {
        found: true,
        track: bestMatch,
        confidence: bestConfidence,
        matchMethod: "search",
      };
    } catch (error) {
      log.debug("Bugs!", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = BUGS_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumById(albumId);
    if (!album) throw serviceNotFoundError(SERVICE.BUGS, RESOURCE_KIND.ALBUM, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    try {
      const albumIds = await searchBugsAlbumIds(q);
      if (albumIds.length === 0) {
        log.debug("Bugs!", "Album search returned no IDs for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Bugs!", `Album search returned ${albumIds.length} IDs for: ${q}`);

      const albumResults = await Promise.allSettled(albumIds.map((id) => fetchAlbumById(id)));
      let bestMatch: NormalizedAlbum | null = null;
      let bestConfidence = 0;

      for (const result of albumResults) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const album = result.value;
        const confidence = calculateAlbumConfidence(
          { title: query.title, artists: [query.artist], releaseDate: query.year },
          { title: album.title, artists: album.artists, releaseDate: album.releaseDate },
        );
        log.debug("Bugs!", `  "${album.title}" -> confidence=${confidence.toFixed(3)}`);
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
      log.debug("Bugs!", "Album search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
  },
} satisfies ServiceAdapter & Record<string, unknown>;
