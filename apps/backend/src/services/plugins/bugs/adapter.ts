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
import { splitArtistNames } from "../_shared/artists.js";
import {
  ENGLISH_KOREAN_ACCEPT_LANGUAGE,
  fetchProviderPage,
  PAGE_ACCEPT,
  type ProviderPageOptions,
} from "../_shared/browser-fetch.js";
import { bestSettledAlbum, bestSettledTrack } from "../_shared/candidates.js";
import { searchText } from "../_shared/confidence.js";
import { extractOgTags } from "../_shared/og.js";
import { readProviderHtml } from "../_shared/provider-response.js";
import { scrapeIds } from "../_shared/scrape-ids.js";

// Bugs! URLs: music.bugs.co.kr/track/{trackId}
const BUGS_TRACK_REGEX = /^https?:\/\/music\.bugs\.co\.kr\/track\/(\d+)/;
// Bugs! album URLs: music.bugs.co.kr/album/{albumId}
const BUGS_ALBUM_REGEX = /^https?:\/\/music\.bugs\.co\.kr\/album\/(\d+)/;

/** How many search hits the adapter fetches pages for, 5. */
const BUGS_SEARCH_ID_LIMIT = 5;

/** A track id on the track search page, from a `/track/{id}` link. */
const BUGS_TRACK_LINK_PATTERN = /\/track\/(\d+)/g;

/** An album id on the album search page, from an `/album/{id}` link. */
const BUGS_ALBUM_LINK_PATTERN = /\/album\/(\d+)/g;

/** How every Bugs! page is requested: as a browser page in English or Korean, within the default timeout. */
const BUGS_PAGE_REQUEST: ProviderPageOptions = { accept: PAGE_ACCEPT, acceptLanguage: ENGLISH_KOREAN_ACCEPT_LANGUAGE };

async function fetchTrackById(trackId: string): Promise<NormalizedTrack | null> {
  const url = `https://music.bugs.co.kr/track/${trackId}`;
  const response = await fetchProviderPage(url, BUGS_PAGE_REQUEST);
  // A track Bugs! does not have redirects to a page answering 404, which is an
  // answer. Any other error status is a failure.
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Bugs, response.status, ResourceKind.Track, trackId);

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
  const response = await fetchProviderPage(searchUrl, BUGS_PAGE_REQUEST);
  // A search without results answers 200 with no track links, so an error
  // status is a failure rather than an answer.
  if (!response.ok) {
    throw serviceHttpError(Service.Bugs, response.status, ResourceKind.Track, query, Operation.Search);
  }

  const html = await readProviderHtml(response, Service.Bugs, "track search");

  return scrapeIds(html, BUGS_TRACK_LINK_PATTERN, BUGS_SEARCH_ID_LIMIT);
}

async function fetchAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const url = `https://music.bugs.co.kr/album/${albumId}`;
  const response = await fetchProviderPage(url, BUGS_PAGE_REQUEST);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Bugs, response.status, ResourceKind.Album, albumId);

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
  const response = await fetchProviderPage(searchUrl, BUGS_PAGE_REQUEST);
  if (!response.ok) {
    throw serviceHttpError(Service.Bugs, response.status, ResourceKind.Album, query, Operation.Search);
  }

  const html = await readProviderHtml(response, Service.Bugs, "album search");
  return scrapeIds(html, BUGS_ALBUM_LINK_PATTERN, BUGS_SEARCH_ID_LIMIT);
}

export const bugsAdapter: ServiceAdapter = {
  id: "bugs",
  displayName: getPlatformLabel("bugs"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = BUGS_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(Service.Bugs, ResourceKind.Track, trackId);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const trackIds = await searchForTrackIds(q);
    if (trackIds.length === 0) {
      log.debug("Bugs!", "Search returned no track IDs for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Bugs!", `Search returned ${trackIds.length} IDs for: ${q}`);

    // Fetch track pages in parallel
    const trackResults = await Promise.allSettled(trackIds.map((id) => fetchTrackById(id)));
    return bestSettledTrack(query, trackResults, Service.Bugs, "Bugs!");
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
    if (!album) throw serviceNotFoundError(Service.Bugs, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const albumIds = await searchBugsAlbumIds(q);
    if (albumIds.length === 0) {
      log.debug("Bugs!", "Album search returned no IDs for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Bugs!", `Album search returned ${albumIds.length} IDs for: ${q}`);

    const albumResults = await Promise.allSettled(albumIds.map((id) => fetchAlbumById(id)));
    return bestSettledAlbum(query, albumResults, Service.Bugs, "Bugs!");
  },
} satisfies ServiceAdapter & Record<string, unknown>;
