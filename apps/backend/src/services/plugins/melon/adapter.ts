/**
 * @file Melon (Korean) adapter: scraping-based track + album resolves.
 *
 * Keyless (always available). Same playbook as the Boomplay adapter:
 * the melon.com web pages embed `application/ld+json` for
 * MusicRecording / MusicAlbum, and the adapter prefers that over the
 * weaker OG-tag fallback because the schema survives UI refreshes.
 *
 * ## Search via `data-song-no`
 *
 * Melon's search page embeds song IDs as `data-song-no="..."` HTML
 * attributes. The adapter regex-extracts up to 5 IDs, then fetches
 * each song page in parallel to get the structured payload. Same
 * N+1 pattern and 5-item cap as Boomplay; same rationale.
 *
 * ## `byArtist` can be object or array
 *
 * Melon's JSON-LD block inconsistently emits `byArtist` either as a
 * single object (`{ name: "Artist" }`) or an array of objects for
 * multi-artist tracks. The parser branches on `Array.isArray` and
 * normalises both into the `string[]` shape that
 * `NormalizedTrack.artists` expects.
 *
 * ## No ISRC
 *
 * Melon's public pages do not publish ISRC. `findByIsrc` returns
 * null; cross-service resolves into Melon always go through text
 * search.
 *
 * ## Accept-Language
 *
 * `MELON_PAGE_REQUEST` sends `en-US,en;q=0.9,ko;q=0.8`. Without this,
 * Melon returns Korean-only pages that still parse (OG fallback
 * handles Unicode fine) but produce downstream noise when logs mix
 * scripts. The preference hint does not change the schema content.
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
import { parseIsoDurationMs } from "../_shared/duration.js";
import { JSON_LD_ALBUM_TYPE, JSON_LD_RECORDING_TYPE, readJsonLd } from "../_shared/json-ld.js";
import { extractOgTags } from "../_shared/og.js";
import { readProviderHtml } from "../_shared/provider-response.js";
import { scrapeIds } from "../_shared/scrape-ids.js";

// Melon URLs: melon.com/song/detail.htm?songId={id}
const MELON_TRACK_REGEX = /^https?:\/\/(?:www\.)?melon\.com\/song\/detail\.htm\?songId=(\d+)/;
// Melon album URLs: melon.com/album/detail.htm?albumId={id}
const MELON_ALBUM_REGEX = /^https?:\/\/(?:www\.)?melon\.com\/album\/detail\.htm\?albumId=(\d+)/;

/** How many search hits the adapter fetches pages for, 5. */
const MELON_SEARCH_ID_LIMIT = 5;

/** A song id on the song search page, from its `data-song-no` attribute. */
const MELON_SONG_ID_PATTERN = /data-song-no="(\d+)"/g;

/** An album id on the album search page, from its `data-album-no` attribute. */
const MELON_ALBUM_ID_PATTERN = /data-album-no=["'](\d+)["']/g;

/**
 * An album id from an `albumId=` link, read only when the album search page
 * has no `data-album-no` attribute at all.
 */
const MELON_ALBUM_LINK_PATTERN = /albumId=(\d+)/g;

interface MelonAlbumJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  datePublished?: string;
  byArtist?: { name?: string } | Array<{ name?: string }>;
  numTracks?: number;
}

interface MelonJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  duration?: string; // ISO 8601
  byArtist?: { name?: string } | Array<{ name?: string }>;
  inAlbum?: { name?: string };
}

/**
 * Reads Melon's published title/artist boundary without changing recording-title credits.
 * @param html - The same recording or album page whose schema is being consumed.
 * @returns OG metadata with the final artist suffix separated, or the legacy unknown-artist fallback.
 */
function melonOpenGraph(html: string): { title?: string; image?: string; artists: string[] } {
  const og = extractOgTags(html);
  if (!og.title) return { ...og, artists: ["Unknown Artist"] };
  const separator = og.title.lastIndexOf(" - ");
  return separator > 0
    ? { ...og, title: og.title.slice(0, separator).trim(), artists: splitArtistNames(og.title.slice(separator + 3)) }
    : { ...og, artists: ["Unknown Artist"] };
}

/**
 * Keeps explicit schema credits and completes their absence from the same page's OG metadata.
 * @param data - Optional single-artist or multi-artist schema field.
 * @param html - Current page, not a separately fetched or inferred artist identity.
 * @returns Reported performer names, preserving schema precedence over OG fallback.
 */
function melonArtistNames(data: MelonJsonLd["byArtist"], html: string): string[] {
  const artists = (Array.isArray(data) ? data : data ? [data] : []).flatMap((artist) =>
    artist.name ? [artist.name] : [],
  );
  return artists.length > 0 ? artists : melonOpenGraph(html).artists;
}

/** How every Melon page is requested: as a browser page in English or Korean, within the default timeout. */
const MELON_PAGE_REQUEST: ProviderPageOptions = { accept: PAGE_ACCEPT, acceptLanguage: ENGLISH_KOREAN_ACCEPT_LANGUAGE };

async function fetchTrackById(songId: string): Promise<NormalizedTrack | null> {
  const url = `https://www.melon.com/song/detail.htm?songId=${songId}`;
  const response = await fetchProviderPage(url, MELON_PAGE_REQUEST);
  // Melon answers a song it does not have with 200 and a page without
  // metadata. A 404 means the same; any other error status is a failure.
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Melon, response.status, ResourceKind.Track, songId);

  const html = await response.text();

  // Try JSON-LD first
  const jsonLd = readJsonLd<MelonJsonLd>(html, JSON_LD_RECORDING_TYPE);
  if (jsonLd?.name) {
    const artists = melonArtistNames(jsonLd.byArtist, html);

    return {
      sourceService: "melon",
      sourceId: songId,
      title: jsonLd.name,
      artists,
      albumName: jsonLd.inAlbum?.name,
      durationMs: jsonLd.duration ? parseIsoDurationMs(jsonLd.duration) : undefined,
      artworkUrl: jsonLd.image,
      webUrl: `https://www.melon.com/song/detail.htm?songId=${songId}`,
    };
  }

  // Fallback to OG tags
  const og = melonOpenGraph(html);
  if (og.title) {
    return {
      sourceService: "melon",
      sourceId: songId,
      title: og.title,
      artists: og.artists,
      artworkUrl: og.image,
      webUrl: `https://www.melon.com/song/detail.htm?songId=${songId}`,
    };
  }

  return null;
}

async function searchForSongIds(query: string): Promise<string[]> {
  const searchUrl = `https://www.melon.com/search/song/index.htm?q=${encodeURIComponent(query)}`;
  const response = await fetchProviderPage(searchUrl, MELON_PAGE_REQUEST);
  // A search without results answers 200 with no song ids.
  if (!response.ok) {
    throw serviceHttpError(Service.Melon, response.status, ResourceKind.Track, query, Operation.Search);
  }

  const html = await readProviderHtml(response, Service.Melon, "track search");

  return scrapeIds(html, MELON_SONG_ID_PATTERN, MELON_SEARCH_ID_LIMIT);
}

/**
 * Reads an album page's `MusicAlbum` block.
 *
 * @param html - A Melon album page.
 * @returns The block, or `null` when the page has none, it is not an album
 *   block, or it carries no name.
 */
function parseMelonAlbumJsonLd(html: string): MelonAlbumJsonLd | null {
  const data = readJsonLd<MelonAlbumJsonLd>(html, JSON_LD_ALBUM_TYPE);
  return data?.name ? data : null;
}

async function fetchAlbumById(albumId: string): Promise<NormalizedAlbum | null> {
  const url = `https://www.melon.com/album/detail.htm?albumId=${albumId}`;
  const response = await fetchProviderPage(url, MELON_PAGE_REQUEST);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Melon, response.status, ResourceKind.Album, albumId);

  const html = await response.text();

  // Try JSON-LD first
  const jsonLd = parseMelonAlbumJsonLd(html);
  if (jsonLd) {
    const artists = melonArtistNames(jsonLd.byArtist, html);

    return {
      sourceService: "melon",
      sourceId: albumId,
      title: jsonLd.name!,
      artists,
      artworkUrl: jsonLd.image,
      releaseDate: jsonLd.datePublished,
      totalTracks: jsonLd.numTracks,
      webUrl: `https://www.melon.com/album/detail.htm?albumId=${albumId}`,
    };
  }

  // Fallback to OG tags
  const og = melonOpenGraph(html);
  if (og.title) {
    return {
      sourceService: "melon",
      sourceId: albumId,
      title: og.title,
      artists: og.artists,
      artworkUrl: og.image,
      webUrl: `https://www.melon.com/album/detail.htm?albumId=${albumId}`,
    };
  }

  return null;
}

async function searchMelonAlbumIds(query: string): Promise<string[]> {
  const searchUrl = `https://www.melon.com/search/album/index.htm?q=${encodeURIComponent(query)}`;
  const response = await fetchProviderPage(searchUrl, MELON_PAGE_REQUEST);
  if (!response.ok) {
    throw serviceHttpError(Service.Melon, response.status, ResourceKind.Album, query, Operation.Search);
  }

  const html = await readProviderHtml(response, Service.Melon, "album search");
  const albumIds = scrapeIds(html, MELON_ALBUM_ID_PATTERN, MELON_SEARCH_ID_LIMIT);
  return albumIds.length > 0 ? albumIds : scrapeIds(html, MELON_ALBUM_LINK_PATTERN, MELON_SEARCH_ID_LIMIT);
}

export const melonAdapter: ServiceAdapter = {
  id: "melon",
  displayName: getPlatformLabel("melon"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = MELON_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackById(trackId);
    if (!track) {
      throw serviceNotFoundError(Service.Melon, ResourceKind.Track, trackId);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const songIds = await searchForSongIds(q);
    if (songIds.length === 0) {
      log.debug("Melon", "Search returned no song IDs for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Melon", `Search returned ${songIds.length} IDs for: ${q}`);

    // Fetch track pages in parallel
    const trackResults = await Promise.allSettled(songIds.map((id) => fetchTrackById(id)));
    return bestSettledTrack(query, trackResults, Service.Melon, "Melon");
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = MELON_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumById(albumId);
    if (!album) throw serviceNotFoundError(Service.Melon, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const albumIds = await searchMelonAlbumIds(q);
    if (albumIds.length === 0) {
      log.debug("Melon", "Album search returned no IDs for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Melon", `Album search returned ${albumIds.length} IDs for: ${q}`);

    const albumResults = await Promise.allSettled(albumIds.map((id) => fetchAlbumById(id)));
    return bestSettledAlbum(query, albumResults, Service.Melon, "Melon");
  },
} satisfies ServiceAdapter & Record<string, unknown>;
