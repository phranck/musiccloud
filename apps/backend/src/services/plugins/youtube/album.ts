/**
 * @file YouTube album discovery and detail validation.
 *
 * The official Data API reads known album playlists but does not discover
 * every YouTube Music album through playlist search. Discovery therefore
 * reads first-party search and album pages with US metadata, decodes their
 * hydration as data, and accepts only OLAK5uy_ playlist ids. The Data API
 * supplies the official item count used for edition matching. No youtubei
 * endpoint, browser cookie, or JavaScript evaluation is involved.
 *
 * Only a recognized search document with no compatible album is a miss.
 * HTTP failures, consent or gateway pages, malformed hydration, missing
 * album details, and invalid item counts throw so negative cache entries
 * cannot turn an incomplete provider answer into a month-long absence.
 */
import { Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { calculateArtistNameConfidence, stringSimilarity } from "../../../lib/resolve/normalize";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type { AlbumMatchResult, AlbumSearchQuery, NormalizedAlbum } from "../../types.js";
import { artistIdentityNames } from "../_shared/artists.js";
import { isFreeTextSearch, scoreAlbumCandidate, searchText } from "../_shared/confidence.js";
import { readProviderHtml, requireProviderCollection } from "../_shared/provider-response.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";
import { youtubeFetch } from "./api.js";

const ALBUM_ID_PATTERN = /^OLAK5uy_[a-zA-Z0-9_-]+$/;
const MIN_ALBUM_ARTIST_CONFIDENCE = 0.9;
const PRIMARY_ARTIST_NAME_COUNT = 2;
const HYDRATION_ENTRY_PATTERN =
  /initialData\.push\(\{path: '((?:\\.|[^'])*)', params: JSON\.parse\('((?:\\.|[^'])*)'\), data: '((?:\\.|[^'])*)'\}\);/g;

type JsonObject = Record<string, unknown>;

interface TextRun {
  text?: string;
  navigationEndpoint?: {
    browseEndpoint?: {
      browseEndpointContextSupportedConfigs?: {
        browseEndpointContextMusicConfig?: { pageType?: string };
      };
    };
  };
}

interface YouTubeText {
  simpleText?: string;
  runs?: TextRun[];
}

interface Renderer {
  title?: YouTubeText;
  subtitle?: YouTubeText;
  straplineTextOne?: YouTubeText;
  flexColumns?: Array<{
    musicResponsiveListItemFlexColumnRenderer?: { text?: YouTubeText };
  }>;
}

interface AlbumCandidate {
  sourceId: string;
  title: string;
  artists: string[];
  releaseDate?: string;
  totalTracks?: number;
}

interface PlaylistResource {
  id?: string;
  contentDetails?: { itemCount?: number };
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function visitObjects(value: unknown, visit: (object: JsonObject) => void): void {
  if (!isObject(value)) return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) visitObjects(item, visit);
    } else {
      visitObjects(child, visit);
    }
  }
}

function decodeHydrationString(value: string, path: "search" | "browse"): string {
  try {
    return JSON.parse(`"${value.replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1")}"`) as string;
  } catch (cause) {
    throw new UpstreamUnavailableError(
      "youtube",
      `YouTube Music ${path} search document has invalid hydration escapes`,
      cause,
    );
  }
}

function parseHydration(html: string, path: "search" | "browse"): unknown {
  for (const match of html.matchAll(HYDRATION_ENTRY_PATTERN)) {
    if (decodeHydrationString(match[1], path) !== `/${path}`) continue;
    const decoded = decodeHydrationString(match[3], path);
    try {
      return JSON.parse(decoded) as unknown;
    } catch (cause) {
      throw new UpstreamUnavailableError(
        "youtube",
        `YouTube Music ${path} search document has invalid hydration JSON`,
        cause,
      );
    }
  }
  throw new UpstreamUnavailableError(
    "youtube",
    `YouTube Music ${path} search document lacks its expected hydration entry`,
  );
}

async function fetchMusicPage(url: string, id: string, operation: Operation): Promise<string> {
  const response = await fetchWithTimeout(
    url,
    { headers: { "User-Agent": SCRAPER_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" } },
    5000,
  );
  if (!response.ok) throw serviceHttpError(Service.YouTube, response.status, ResourceKind.Album, id, operation);
  return readProviderHtml(response, Service.YouTube, `YouTube Music album ${operation}`);
}

function textRuns(value: YouTubeText | undefined): TextRun[] {
  if (value?.runs) return value.runs;
  return value?.simpleText ? [{ text: value.simpleText }] : [];
}

function artistNames(value: YouTubeText | undefined): string[] {
  return textRuns(value)
    .filter(
      (run) =>
        run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
          ?.pageType === "MUSIC_PAGE_TYPE_ARTIST",
    )
    .map((run) => run.text?.trim() ?? "")
    .filter(Boolean);
}

function releaseYear(value: YouTubeText | undefined): string | undefined {
  return textRuns(value)
    .map((run) => run.text?.trim())
    .find((text) => text && /^\d{4}$/.test(text));
}

function collectPlaylistIds(value: unknown, ids = new Set<string>()): Set<string> {
  visitObjects(value, (object) => {
    const endpoint = object.watchPlaylistEndpoint;
    if (!isObject(endpoint) || typeof endpoint.playlistId !== "string") return;
    if (ALBUM_ID_PATTERN.test(endpoint.playlistId)) ids.add(endpoint.playlistId);
  });
  return ids;
}

function searchCandidates(data: unknown): AlbumCandidate[] {
  const candidates: AlbumCandidate[] = [];
  visitObjects(data, (object) => {
    for (const key of ["musicCardShelfRenderer", "musicResponsiveListItemRenderer"] as const) {
      const renderer = object[key];
      if (!isObject(renderer)) continue;
      const typed = renderer as Renderer;
      const subtitle = typed.subtitle ?? typed.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text;
      if (textRuns(subtitle)[0]?.text !== "Album") continue;
      const titleText = typed.title ?? typed.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text;
      const title = textRuns(titleText)[0]?.text?.trim();
      const artists = artistNames(subtitle);
      const playlistIds = [...collectPlaylistIds(renderer)];
      if (!title || artists.length === 0 || playlistIds.length !== 1) continue;
      candidates.push({
        sourceId: playlistIds[0],
        title,
        artists,
        releaseDate: releaseYear(subtitle),
      });
    }
  });
  return [...new Map(candidates.map((candidate) => [candidate.sourceId, candidate])).values()];
}

function albumIdentityMatches(query: AlbumSearchQuery, candidate: AlbumCandidate): boolean {
  if (isFreeTextSearch(query)) return true;
  if (stringSimilarity(query.title, candidate.title) < MATCH_MIN_CONFIDENCE) return false;
  const wantedArtists = artistIdentityNames(query.artist).slice(0, PRIMARY_ARTIST_NAME_COUNT);
  return wantedArtists.some((wanted) =>
    candidate.artists.some((actual) => calculateArtistNameConfidence(wanted, actual) >= MIN_ALBUM_ARTIST_CONFIDENCE),
  );
}

function requireSearchRoot(data: unknown): void {
  if (!isObject(data) || !isObject(data.contents) || !isObject(data.contents.tabbedSearchResultsRenderer)) {
    throw new UpstreamUnavailableError("youtube", "YouTube Music search document lacks its expected result root");
  }
  const tabs = data.contents.tabbedSearchResultsRenderer.tabs;
  if (!Array.isArray(tabs)) {
    throw new UpstreamUnavailableError("youtube", "YouTube Music search document lacks its result tabs");
  }
  const hasResultContents = tabs.some((tab) => {
    if (!isObject(tab) || !isObject(tab.tabRenderer) || !isObject(tab.tabRenderer.content)) return false;
    const sectionList = tab.tabRenderer.content.sectionListRenderer;
    return isObject(sectionList) && Array.isArray(sectionList.contents);
  });
  if (!hasResultContents) {
    throw new UpstreamUnavailableError("youtube", "YouTube Music search document lacks its result collections");
  }
}

async function playlistDetails(ids: string[], operation: Operation): Promise<PlaylistResource[]> {
  const response = await youtubeFetch(`/playlists?part=snippet,contentDetails&id=${encodeURIComponent(ids.join(","))}`);
  if (!response.ok)
    throw serviceHttpError(Service.YouTube, response.status, ResourceKind.Album, ids.join(","), operation);
  let data: { items?: PlaylistResource[] };
  try {
    data = (await response.json()) as { items?: PlaylistResource[] };
  } catch (cause) {
    throw new UpstreamUnavailableError("youtube", "YouTube playlist detail request answered with invalid JSON", cause);
  }
  return requireProviderCollection(data.items, Service.YouTube, "YouTube playlist detail");
}

function validDetailMap(items: PlaylistResource[]): Map<string, number> {
  const details = new Map<string, number>();
  for (const item of items) {
    if (
      typeof item.id === "string" &&
      ALBUM_ID_PATTERN.test(item.id) &&
      typeof item.contentDetails?.itemCount === "number" &&
      Number.isInteger(item.contentDetails.itemCount) &&
      item.contentDetails.itemCount >= 0
    ) {
      details.set(item.id, item.contentDetails.itemCount);
    }
  }
  return details;
}

function albumUrl(albumId: string): string {
  return `https://www.youtube.com/playlist?list=${albumId}`;
}

function musicAlbumUrl(albumId: string): string {
  return `https://music.youtube.com/playlist?list=${albumId}&gl=US&hl=en`;
}

/** Retrieves album identity from its first-party page and validates its size through the Data API. */
export async function getYouTubeAlbum(albumId: string): Promise<NormalizedAlbum> {
  if (!ALBUM_ID_PATTERN.test(albumId)) throw serviceNotFoundError(Service.YouTube, ResourceKind.Album, albumId);
  const [html, items] = await Promise.all([
    fetchMusicPage(musicAlbumUrl(albumId), albumId, Operation.Fetch),
    playlistDetails([albumId], Operation.Fetch),
  ]);
  if (items.length === 0) throw serviceNotFoundError(Service.YouTube, ResourceKind.Album, albumId);
  const details = validDetailMap(items);
  const totalTracks = details.get(albumId);
  if (totalTracks === undefined) {
    throw new UpstreamUnavailableError("youtube", "YouTube playlist detail response lacks a valid album item count");
  }

  const data = parseHydration(html, "browse");
  let header: Renderer | undefined;
  visitObjects(data, (object) => {
    if (!header && isObject(object.musicResponsiveHeaderRenderer)) {
      header = object.musicResponsiveHeaderRenderer as Renderer;
    }
  });
  if (!header)
    throw new UpstreamUnavailableError("youtube", "YouTube Music album search document lacks its album header");
  const title = textRuns(header.title)[0]?.text?.trim();
  const artists = artistNames(header.straplineTextOne);
  if (!title || artists.length === 0) {
    throw new UpstreamUnavailableError("youtube", "YouTube Music album search document lacks album identity fields");
  }
  return {
    sourceService: "youtube",
    sourceId: albumId,
    title,
    artists,
    releaseDate: releaseYear(header.subtitle),
    totalTracks,
    webUrl: albumUrl(albumId),
  };
}

/** Finds and scores a YouTube Music album before exposing its canonical YouTube playlist URL. */
export async function searchYouTubeAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
  const searchQuery = encodeURIComponent(searchText(query));
  const html = await fetchMusicPage(
    `https://music.youtube.com/search?q=${searchQuery}&gl=US&hl=en`,
    query.title,
    Operation.Search,
  );
  const data = parseHydration(html, "search");
  requireSearchRoot(data);
  const candidates = searchCandidates(data);
  if (candidates.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

  const details = validDetailMap(
    await playlistDetails(
      candidates.map((candidate) => candidate.sourceId),
      Operation.Search,
    ),
  );

  let best: AlbumCandidate | undefined;
  let bestConfidence = 0;
  let missingDetails = 0;
  for (const candidate of candidates) {
    if (!albumIdentityMatches(query, candidate)) continue;
    const totalTracks = details.get(candidate.sourceId);
    if (totalTracks === undefined) {
      missingDetails++;
      continue;
    }
    const complete = { ...candidate, totalTracks };
    const confidence = scoreAlbumCandidate(query, { ...complete, sourceService: "youtube" });
    if (confidence > bestConfidence) {
      best = complete;
      bestConfidence = confidence;
    }
  }
  if (!best || bestConfidence < MATCH_MIN_CONFIDENCE) {
    if (missingDetails > 0) {
      throw new UpstreamUnavailableError(
        "youtube",
        "YouTube playlist detail response lacks a discovered album or its item count",
      );
    }
    return { found: false, confidence: 0, matchMethod: "search" };
  }
  if (missingDetails > 0) {
    log.deviation({
      adapterId: "youtube",
      component: "YouTube",
      errorCode: "MC-API-0004",
      operation: "album_playlist_details",
      outcome: "positive_partial_details",
      missingDetails,
    });
  }
  return {
    found: true,
    album: {
      sourceService: "youtube",
      sourceId: best.sourceId,
      title: best.title,
      artists: best.artists,
      releaseDate: best.releaseDate,
      totalTracks: best.totalTracks,
      webUrl: albumUrl(best.sourceId),
    },
    confidence: bestConfidence,
    matchMethod: "search",
  };
}
