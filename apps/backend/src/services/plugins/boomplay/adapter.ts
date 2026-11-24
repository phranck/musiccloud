/**
 * @file Boomplay adapter: scraping-based track + album resolves.
 *
 * Keyless (always available). Boomplay has no public API, so the
 * adapter scrapes the web-player pages. Both tracks and albums embed
 * `application/ld+json` schema blocks (`MusicRecording` / `MusicAlbum`)
 * which is sturdier than OG-tag parsing: the schema is intended for
 * crawlers and tends to stay stable through UI refreshes.
 *
 * ## Search is N+1
 *
 * `searchTrack` has to make two trips per result because Boomplay's
 * search response page lists songs only by ID (`data-id="..."` on HTML
 * nodes). The adapter extracts up to 5 IDs, then fetches each song page
 * in parallel to pull the JSON-LD payload. This is the deliberate
 * upper bound: more than 5 starts costing noticeable latency on
 * cross-service resolves, while the first 5 cover the realistic
 * relevance cone.
 *
 * ## No ISRC
 *
 * Boomplay does not surface ISRC anywhere in its schema output.
 * `findByIsrc` returns null; cross-service resolves into Boomplay
 * always go through text search.
 *
 * ## ISO 8601 duration
 *
 * The JSON-LD `duration` field is formatted as `"PT03M45S"` (ISO 8601
 * period). `parseIsoDurationMs` handles the three components (hours,
 * minutes, seconds) and yields milliseconds; an unparseable value
 * yields `undefined` rather than zero so the downstream display can
 * distinguish "no duration data" from "zero-length track".
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { log } from "../../../lib/infra/logger";
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
import { artistNamesOrUnknown } from "../_shared/artists.js";
import {
  ENGLISH_ACCEPT_LANGUAGE,
  fetchProviderPage,
  PAGE_ACCEPT,
  type ProviderPageOptions,
} from "../_shared/browser-fetch.js";
import { bestSettledAlbum, bestSettledTrack } from "../_shared/candidates.js";
import { searchText } from "../_shared/confidence.js";
import { parseIsoDurationMs } from "../_shared/duration.js";
import { JSON_LD_ALBUM_TYPE, JSON_LD_RECORDING_TYPE, readJsonLd } from "../_shared/json-ld.js";
import { readProviderHtml } from "../_shared/provider-response.js";
import { scrapeIds } from "../_shared/scrape-ids.js";

const BOOMPLAY_SONG_REGEX = /^https?:\/\/(?:www\.)?boomplay\.com\/songs\/(\d+)/;
// Boomplay album URLs: boomplay.com/albums/{id}
const BOOMPLAY_ALBUM_REGEX = /^https?:\/\/(?:www\.)?boomplay\.com\/albums\/(\d+)/;

/** How many search hits the adapter fetches pages for, 5, as the file comment explains. */
const BOOMPLAY_SEARCH_ID_LIMIT = 5;

/** A song id on the search page, from the `data-id` attribute of a result node. */
const BOOMPLAY_SONG_ID_PATTERN = /data-id="(\d+)"/g;

/** An album id on the search page, from an `/albums/{id}` link. */
const BOOMPLAY_ALBUM_LINK_PATTERN = /\/albums\/(\d+)/g;

/** JSON-LD MusicAlbum schema as embedded in Boomplay album pages */
interface BoomplayAlbumJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  datePublished?: string;
  byArtist?: Array<{ name?: string }>;
  numTracks?: number;
}

/** JSON-LD MusicRecording schema as embedded in Boomplay song pages */
interface BoomplayJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  duration?: string; // ISO 8601: "PT03M45S"
  byArtist?: Array<{ name?: string }>;
  inAlbum?: { name?: string };
}

/** How every Boomplay page is requested: as an English browser page, within the default timeout. */
const BOOMPLAY_PAGE_REQUEST: ProviderPageOptions = { accept: PAGE_ACCEPT, acceptLanguage: ENGLISH_ACCEPT_LANGUAGE };

/**
 * Fetches a Boomplay search page.
 *
 * @param query - The search text.
 * @param kind - What the search is for, which the error names.
 * @returns The page, which lists results by id.
 * @throws When Boomplay answers with an error status, such as the 403 it gives
 *   a client it refuses. A search without results is a page without result
 *   ids, so an error status is a failure rather than an answer.
 */
async function fetchSearchPage(query: string, kind: ResourceKind): Promise<Response> {
  const response = await fetchProviderPage(
    `https://www.boomplay.com/search/default/${encodeURIComponent(query)}`,
    BOOMPLAY_PAGE_REQUEST,
  );
  if (!response.ok) throw serviceHttpError(Service.Boomplay, response.status, kind, query, Operation.Search);
  return response;
}

/**
 * Fetches a Boomplay song page and reads its `MusicRecording` block.
 *
 * @param songId - The Boomplay song id.
 * @returns The track, or `null` when the page answers 404 or has no named recording block.
 * @throws {ResolveError} for any other error status.
 * @throws {UpstreamUnavailableError} when the page is not HTML, such as a
 *   restriction page or a JSON body, so a refusal never reads as a missing song.
 */
async function fetchTrackById(songId: string): Promise<NormalizedTrack | null> {
  const url = `https://www.boomplay.com/songs/${songId}`;
  const response = await fetchProviderPage(url, BOOMPLAY_PAGE_REQUEST);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Boomplay, response.status, ResourceKind.Track, songId);

  const html = await readProviderHtml(response, Service.Boomplay, "track lookup");
  const jsonLd = readJsonLd<BoomplayJsonLd>(html, JSON_LD_RECORDING_TYPE);
  if (!jsonLd?.name) return null;

  return mapJsonLd(jsonLd, songId);
}

function mapJsonLd(data: BoomplayJsonLd, songId: string): NormalizedTrack {
  const artists = artistNamesOrUnknown(data.byArtist?.map((artist) => artist.name));

  return {
    sourceService: "boomplay",
    sourceId: songId,
    title: data.name ?? "Unknown",
    artists,
    albumName: data.inAlbum?.name,
    durationMs: data.duration ? parseIsoDurationMs(data.duration) : undefined,
    artworkUrl: data.image,
    webUrl: `https://www.boomplay.com/songs/${songId}`,
  };
}

/**
 * Reads an album page's `MusicAlbum` block.
 *
 * @param html - A Boomplay album page.
 * @returns The block, or `null` when the page has none, it is not an album
 *   block, or it carries no name.
 */
function parseAlbumJsonLd(html: string): BoomplayAlbumJsonLd | null {
  const data = readJsonLd<BoomplayAlbumJsonLd>(html, JSON_LD_ALBUM_TYPE);
  return data?.name ? data : null;
}

/**
 * Fetches a Boomplay album page and reads its `MusicAlbum` block.
 *
 * @param albumId - The Boomplay album id.
 * @returns The album, or `null` when the page answers 404 or has no named album block.
 * @throws {ResolveError} for any other error status.
 * @throws {UpstreamUnavailableError} when the page is not HTML, such as a
 *   restriction page or a JSON body, so a refusal never reads as a missing album.
 */
async function fetchAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const url = `https://www.boomplay.com/albums/${albumId}`;
  const response = await fetchProviderPage(url, BOOMPLAY_PAGE_REQUEST);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Boomplay, response.status, ResourceKind.Album, albumId);

  const html = await readProviderHtml(response, Service.Boomplay, "album lookup");
  const jsonLd = parseAlbumJsonLd(html);
  if (!jsonLd) return null;

  const artists = artistNamesOrUnknown(jsonLd.byArtist?.map((artist) => artist.name));
  return {
    sourceService: "boomplay",
    sourceId: albumId,
    title: jsonLd.name!,
    artists,
    artworkUrl: jsonLd.image,
    releaseDate: jsonLd.datePublished,
    totalTracks: jsonLd.numTracks,
    webUrl: `https://www.boomplay.com/albums/${albumId}`,
  };
}

async function searchBoomplayAlbumIds(query: string): Promise<string[]> {
  const response = await fetchSearchPage(query, ResourceKind.Album);

  const html = await readProviderHtml(response, Service.Boomplay, "album search");

  return scrapeIds(html, BOOMPLAY_ALBUM_LINK_PATTERN, BOOMPLAY_SEARCH_ID_LIMIT);
}

export const boomplayAdapter: ServiceAdapter = {
  id: "boomplay",
  displayName: getPlatformLabel("boomplay"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = BOOMPLAY_SONG_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(Service.Boomplay, ResourceKind.Track, trackId);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    // Boomplay exposes no ISRC data
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    // Step 1: Fetch search page and extract song IDs
    const response = await fetchSearchPage(q, ResourceKind.Track);
    const html = await readProviderHtml(response, Service.Boomplay, "track search");

    const songIds = scrapeIds(html, BOOMPLAY_SONG_ID_PATTERN, BOOMPLAY_SEARCH_ID_LIMIT);

    if (songIds.length === 0) {
      log.debug("Boomplay", "Search returned no song IDs for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Boomplay", `Search returned ${songIds.length} IDs for: ${q}`);

    // Step 2: Fetch each song page in parallel for JSON-LD metadata
    const trackResults = await Promise.allSettled(songIds.map((id) => fetchTrackById(id)));
    return bestSettledTrack(query, trackResults, Service.Boomplay, "Boomplay");
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = BOOMPLAY_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumById(albumId);
    if (!album) throw serviceNotFoundError(Service.Boomplay, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const albumIds = await searchBoomplayAlbumIds(q);
    if (albumIds.length === 0) {
      log.debug("Boomplay", "Album search returned no IDs for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Boomplay", `Album search returned ${albumIds.length} IDs for: ${q}`);

    const albumResults = await Promise.allSettled(albumIds.map((id) => fetchAlbumById(id)));
    return bestSettledAlbum(query, albumResults, Service.Boomplay, "Boomplay");
  },
} satisfies ServiceAdapter & Record<string, unknown>;
