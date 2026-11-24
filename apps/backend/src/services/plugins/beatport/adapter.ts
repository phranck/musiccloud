/**
 * @file Beatport adapter: track + release resolves via __NEXT_DATA__ scraping.
 *
 * Uses keyless consumer pages and their `__NEXT_DATA__` hydration payload,
 * not a guaranteed developer API. HTTP refusals remain failures. A readable
 * hydration root alone does not establish an answered search: the requested
 * tracks/releases collection and its basic row identity must be recognizable.
 * Explicit empty collections are valid; missing or malformed collections throw
 * so the resolver cannot cache a gateway/redesign response as catalog absence.
 *
 * "Album" in the rest of the app maps to Beatport's "release".
 * Release URLs are `beatport.com/release/{slug}/{id}` (not `/album/`)
 * and the adapter routes them through `albumCapabilities`.
 *
 * ## Mix-name composition
 *
 * Beatport tracks have both `name` and `mix_name`. For display, the
 * full title is `"Name (Mix Name)"` unless `mix_name` is the
 * default `"Original Mix"`, in which case only `name` is used.
 * This keeps club edits distinguishable while avoiding noisy
 * "(Original Mix)" suffixes on bread-and-butter releases.
 *
 * ## Duration from `length` string fallback
 *
 * Modern responses carry `length_ms` (milliseconds). Some older
 * entries only have `length` as a `"mm:ss"` string. The adapter
 * parses the string when `length_ms` is absent.
 *
 * ## ISRC lookup through the site search
 *
 * `findByIsrc` uses the same site-search contract and accepts only a returned
 * row whose ISRC matches exactly. Release UPC metadata is retained, but this
 * adapter implements no UPC lookup.
 *
 * ## OG-title fallback parsing
 *
 * If `__NEXT_DATA__` parsing fails (e.g. Beatport redesigns its
 * internals), `fetchTrackById` drops to OG-title parsing. The title
 * format is `"Artist - Track (Mix) [Label] | Beatport"` which the
 * regex strips down to artist + track. This path has no ISRC or
 * duration data but at least yields a valid track row.
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../../types.js";
import { artistNamesOrUnknown } from "../_shared/artists.js";
import {
  ENGLISH_ACCEPT_LANGUAGE,
  fetchProviderPage,
  PAGE_ACCEPT,
  type ProviderPageOptions,
} from "../_shared/browser-fetch.js";
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { parseClockDurationMs } from "../_shared/duration.js";
import { extractOgTags } from "../_shared/og.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
import {
  logCandidateScore,
  pickBestCandidate,
  pickBestTrack,
  searchMatchResult,
  trackScoreLogger,
  usableTracks,
} from "../_shared/rank.js";

/** How many search hits a Beatport track or release search scores: the first `5`. */
const BEATPORT_SEARCH_LIMIT = 5;

/** Writes the per-track score debug line of a Beatport search. */
const logBeatportTrackScore = trackScoreLogger("Beatport");

// Beatport URLs: beatport.com/track/{slug}/{id}
const BEATPORT_TRACK_REGEX = /^https?:\/\/(?:www\.)?beatport\.com\/track\/[^/]+\/(\d+)/;
// Beatport release (album) URLs: beatport.com/release/{slug}/{id}
const BEATPORT_ALBUM_REGEX = /^https?:\/\/(?:www\.)?beatport\.com\/release\/[^/]+\/(\d+)/;

interface BeatportRelease {
  id: number;
  name: string;
  slug: string;
  artists?: Array<{ name: string; slug: string }>;
  label?: { name?: string };
  image?: { uri?: string };
  publish_date?: string;
  upc?: string;
  track_count?: number;
  catalog_number?: string;
}

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

/** How long one Beatport page may take, 10 s. */
const BEATPORT_REQUEST_TIMEOUT_MS = 10000;

/** How every Beatport page is requested: as an English browser page, within {@link BEATPORT_REQUEST_TIMEOUT_MS}. */
const BEATPORT_PAGE_REQUEST: ProviderPageOptions = {
  accept: PAGE_ACCEPT,
  acceptLanguage: ENGLISH_ACCEPT_LANGUAGE,
  timeoutMs: BEATPORT_REQUEST_TIMEOUT_MS,
};

function parseNextData(html: string): Record<string, unknown> | null {
  const match = /__NEXT_DATA__[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(html);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Fetches a Beatport search page and reads its `__NEXT_DATA__` blob.
 *
 * @param url - The search page.
 * @param kind - What the search is for, which the error names.
 * @param query - The search text, which the error names.
 * @param operation - Whether this is a text search or an ISRC lookup.
 * @returns The blob, whose results may be empty.
 * @throws When Beatport answers with an error status, such as the 403 it
 *   gives a client it refuses, or with a page carrying no blob it can read.
 *   A search without results is a page whose results are empty, so either
 *   is a failure rather than an answer.
 */
async function fetchSearchData(
  url: string,
  kind: ResourceKind,
  query: string,
  operation: Operation,
): Promise<Record<string, unknown>> {
  const response = await fetchProviderPage(url, BEATPORT_PAGE_REQUEST);
  if (!response.ok) throw serviceHttpError(Service.Beatport, response.status, kind, query, operation);
  const nextData = parseNextData(await response.text());
  if (!nextData) {
    throw new UpstreamUnavailableError("beatport", `${operation} page for "${query}" carried no __NEXT_DATA__`);
  }
  return nextData;
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

/**
 * Reads the requested hydrated search collection without converting parser
 * failures into negative catalog evidence. Retains direct arrays, nested data
 * arrays, and the existing direct track-result-array variant.
 *
 * @param data - Parsed __NEXT_DATA__, not proof that a search has answered.
 * @param category - Tracks for text/ISRC lookup or releases for album search.
 * @returns Reported rows, including an explicitly empty collection.
 * @throws When hydration, the collection, or its required id/name is malformed.
 */
function extractSearchCollection<T extends { id: number; name: string }>(
  data: Record<string, unknown>,
  category: "tracks" | "releases",
): T[] {
  const props = data.props as Record<string, unknown> | undefined;
  const pageProps = props?.pageProps as Record<string, unknown> | undefined;
  const hydration = pageProps?.dehydratedState as Record<string, unknown> | undefined;
  const queries = requireProviderCollection(
    hydration?.queries as Array<{ state?: { data?: Record<string, unknown> | unknown[] } }> | undefined,
    Service.Beatport,
    `${category} search hydration`,
  );
  for (const query of queries) {
    const state = query.state?.data;
    let reported: unknown;
    if (category === "tracks" && Array.isArray(state)) reported = state;
    else if (state && !Array.isArray(state) && category in state) reported = state[category];
    else continue;
    const collection = Array.isArray(reported) ? reported : (reported as { data?: unknown[] } | null)?.data;
    const rows = requireProviderCollection(collection, Service.Beatport, `${category} search results`);
    if (
      rows.some((item) => {
        const row = item as { id?: unknown; name?: unknown } | null;
        return !row || typeof row.id !== "number" || !row.id || typeof row.name !== "string" || !row.name.trim();
      })
    ) {
      throw new UpstreamUnavailableError("beatport", `${category} search returned invalid row identity`);
    }
    return rows as T[];
  }
  throw new UpstreamUnavailableError("beatport", `${category} search hydration omitted its result collection`);
}

function mapTrack(track: BeatportTrack): NormalizedTrack {
  const artists = artistNamesOrUnknown(track.artists?.map((artist) => artist.name));

  // Full track name: "Name (Mix Name)"
  const title = track.mix_name && track.mix_name !== "Original Mix" ? `${track.name} (${track.mix_name})` : track.name;

  const artworkUrl = track.image?.uri ?? track.release?.image?.uri;

  // Parse length string "7:22" to ms if length_ms not available
  let durationMs = track.length_ms;
  if (!durationMs && track.length) durationMs = parseClockDurationMs(track.length) ?? durationMs;

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
  const response = await fetchProviderPage(url, BEATPORT_PAGE_REQUEST);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Beatport, response.status, ResourceKind.Track, trackId);

  const html = await response.text();

  // Try __NEXT_DATA__ first
  const nextData = parseNextData(html);
  if (nextData) {
    const track = extractTrackFromNextData(nextData);
    if (track) return mapTrack(track);
  }

  // Fallback to OG tags
  const og = extractOgTags(html);

  if (og.title) {
    // OG title: "Artist - Track (Mix) [Label] | Beatport"
    const titleMatch = /^(.+?)\s*-\s*(.+?)(?:\s*\[.*\])?\s*\|?\s*(?:Music & Downloads on\s*)?Beatport$/i.exec(og.title);
    if (titleMatch) {
      return {
        sourceService: "beatport",
        sourceId: trackId,
        title: titleMatch[2].trim(),
        artists: [titleMatch[1].trim()],
        artworkUrl: og.image || undefined,
        webUrl: `https://www.beatport.com/track/x/${trackId}`,
      };
    }
  }

  return null;
}

function extractReleaseFromNextData(data: Record<string, unknown>): BeatportRelease | null {
  try {
    const props = data.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const dehydratedState = pageProps?.dehydratedState as Record<string, unknown> | undefined;
    const queries = dehydratedState?.queries as Array<Record<string, unknown>> | undefined;
    if (!queries) return null;

    for (const q of queries) {
      const state = q.state as Record<string, unknown> | undefined;
      const stateData = state?.data as Record<string, unknown> | undefined;
      if (stateData && "name" in stateData && "id" in stateData && !("artists" in stateData)) {
        // Release data (no "artists" at top level, but has "artists" nested differently)
        if ("publish_date" in stateData || "upc" in stateData || "track_count" in stateData) {
          return stateData as unknown as BeatportRelease;
        }
      }
      // Also check if the data has a "release" field (track detail page)
      if (stateData && "release" in stateData) {
        return (stateData as Record<string, unknown>).release as BeatportRelease;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function mapRelease(release: BeatportRelease): NormalizedAlbum {
  const artists = artistNamesOrUnknown(release.artists?.map((artist) => artist.name));
  return {
    sourceService: "beatport",
    sourceId: String(release.id),
    upc: release.upc,
    title: release.name,
    artists,
    label: release.label?.name,
    artworkUrl: release.image?.uri,
    releaseDate: release.publish_date,
    totalTracks: release.track_count,
    webUrl: `https://www.beatport.com/release/${release.slug}/${release.id}`,
  };
}

async function fetchReleaseById(releaseId: string): Promise<NormalizedAlbum | null> {
  const url = `https://www.beatport.com/release/x/${releaseId}`;
  const response = await fetchProviderPage(url, BEATPORT_PAGE_REQUEST);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Beatport, response.status, ResourceKind.Album, releaseId);

  const html = await response.text();
  const nextData = parseNextData(html);
  if (!nextData) return null;

  const release = extractReleaseFromNextData(nextData);
  if (!release?.name) return null;
  return mapRelease(release);
}

export const beatportAdapter: ServiceAdapter = {
  id: "beatport",
  displayName: getPlatformLabel("beatport"),
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = BEATPORT_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(Service.Beatport, ResourceKind.Track, trackId);
    }
    return track;
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const nextData = await fetchSearchData(
      `https://www.beatport.com/search?q=${encodeURIComponent(isrc)}`,
      ResourceKind.Track,
      isrc,
      Operation.IsrcLookup,
    );
    const match = extractSearchCollection<BeatportTrack>(nextData, "tracks").find((t) => t.isrc === isrc);
    return match ? mapTrack(match) : null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);
    const nextData = await fetchSearchData(
      `https://www.beatport.com/search?q=${encodeURIComponent(q)}`,
      ResourceKind.Track,
      q,
      Operation.Search,
    );

    const tracks = extractSearchCollection<BeatportTrack>(nextData, "tracks");
    if (tracks.length === 0) {
      log.debug("Beatport", "Search returned no tracks for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Beatport", `Search returned ${tracks.length} tracks for: ${q}`);

    const { best, confidence } = pickBestTrack(
      usableTracks(tracks.slice(0, BEATPORT_SEARCH_LIMIT), (bpTrack) => Boolean(bpTrack.id && bpTrack.name), mapTrack),
      (track, index) => scoreSearchCandidate(query, track, index),
      logBeatportTrackScore,
    );

    const match = searchMatchResult("track", best, confidence);
    if (!match.found) {
      log.debug("Beatport", `Best confidence ${confidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
    }
    return match;
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = BEATPORT_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchReleaseById(albumId);
    if (!album) throw serviceNotFoundError(Service.Beatport, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const nextData = await fetchSearchData(
      `https://www.beatport.com/search/releases?q=${encodeURIComponent(q)}`,
      ResourceKind.Album,
      q,
      Operation.Search,
    );

    const releases = extractSearchCollection<BeatportRelease>(nextData, "releases");
    if (releases.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

    const albums = releases
      .slice(0, BEATPORT_SEARCH_LIMIT)
      .filter((release) => release.id && release.name)
      .map(mapRelease);
    const { best, confidence } = pickBestCandidate(
      albums,
      (album) => scoreAlbumCandidate(query, album),
      (album, _index, albumConfidence) => logCandidateScore("Beatport", `"${album.title}"`, albumConfidence),
    );
    return searchMatchResult("album", best, confidence);
  },
} satisfies ServiceAdapter & Record<string, unknown>;
