/**
 * @file YouTube Music page parsing.
 *
 * Fetches first-party YouTube Music search and album pages with US metadata,
 * decodes their hydration as data, and extracts album candidates and header
 * renderers. No youtubei endpoint, browser cookie, or JavaScript evaluation is
 * involved. The album lookup and ranking that consume this live in `album.ts`.
 */
import { type Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
import { readProviderHtml } from "../_shared/provider-response.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

/** Matches the playlist id of a YouTube Music album, which always starts with `OLAK5uy_`. */
export const ALBUM_ID_PATTERN = /^OLAK5uy_[a-zA-Z0-9_-]+$/;

/** Matches one `initialData.push({path, params, data})` hydration call in a YouTube Music page. */
const HYDRATION_ENTRY_PATTERN =
  /initialData\.push\(\{path: '((?:\\.|[^'])*)', params: JSON\.parse\('((?:\\.|[^'])*)'\), data: '((?:\\.|[^'])*)'\}\);/g;

/** A plain JSON object whose values are not yet inspected. */
type JsonObject = Record<string, unknown>;

/** One run of a YouTube text, optionally linking to a browse page such as an artist. */
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

/** A YouTube text, either a plain string or a list of runs. */
interface YouTubeText {
  simpleText?: string;
  runs?: TextRun[];
}

/** The fields of a YouTube Music renderer that album parsing reads. */
export interface Renderer {
  title?: YouTubeText;
  subtitle?: YouTubeText;
  straplineTextOne?: YouTubeText;
  flexColumns?: Array<{
    musicResponsiveListItemFlexColumnRenderer?: { text?: YouTubeText };
  }>;
}

/** An album found on a YouTube Music search page, before its item count is known. */
export interface AlbumCandidate {
  sourceId: string;
  title: string;
  artists: string[];
  releaseDate?: string;
  totalTracks?: number;
}

/**
 * Tells whether a value is a non-null, non-array object.
 *
 * @param value - Any parsed JSON value.
 * @returns `true` for a plain object.
 */
export function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Walks a parsed JSON document depth first and calls `visit` for every object in it, the root included.
 *
 * @param value - Parsed JSON value to walk.
 * @param visit - Callback that receives each object.
 */
export function visitObjects(value: unknown, visit: (object: JsonObject) => void): void {
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

/**
 * Decodes a JavaScript string literal body from a hydration call, including `\xNN` escapes.
 *
 * @param value - Literal body without its quotes.
 * @param path - Hydration path the string belongs to, named in the error.
 * @returns The decoded string.
 * @throws {UpstreamUnavailableError} When the escapes are invalid.
 */
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

/**
 * Extracts and parses the hydration entry for one path from a YouTube Music page.
 *
 * @param html - Page HTML.
 * @param path - Hydration path to read, `search` or `browse`.
 * @returns The parsed hydration document.
 * @throws {UpstreamUnavailableError} When the entry is missing or its escapes or JSON are invalid.
 */
export function parseHydration(html: string, path: "search" | "browse"): unknown {
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

/**
 * Fetches a YouTube Music page with a US English request and checks that it is an HTML document.
 *
 * @param url - Page URL.
 * @param id - Album id or query named in an HTTP error.
 * @param operation - Operation named in errors.
 * @returns The page HTML.
 * @throws {Error} For a non-OK status or a non-HTML body.
 */
export async function fetchMusicPage(url: string, id: string, operation: Operation): Promise<string> {
  const response = await fetchWithTimeout(
    url,
    { headers: { "User-Agent": SCRAPER_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" } },
    5000,
  );
  if (!response.ok) throw serviceHttpError(Service.YouTube, response.status, ResourceKind.Album, id, operation);
  return readProviderHtml(response, Service.YouTube, `YouTube Music album ${operation}`);
}

/**
 * Returns the runs of a YouTube text, treating a plain string as one run.
 *
 * @param value - YouTube text, possibly absent.
 * @returns The runs, empty when there is no text.
 */
export function textRuns(value: YouTubeText | undefined): TextRun[] {
  if (value?.runs) return value.runs;
  return value?.simpleText ? [{ text: value.simpleText }] : [];
}

/**
 * Returns the names of the runs that link to an artist page.
 *
 * @param value - YouTube text, possibly absent.
 * @returns Trimmed, non-empty artist names in text order.
 */
export function artistNames(value: YouTubeText | undefined): string[] {
  return textRuns(value)
    .filter(
      (run) =>
        run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
          ?.pageType === "MUSIC_PAGE_TYPE_ARTIST",
    )
    .map((run) => run.text?.trim() ?? "")
    .filter(Boolean);
}

/**
 * Returns the first run that is a four-digit year.
 *
 * @param value - YouTube text, possibly absent.
 * @returns The year string, or `undefined` when no run is one.
 */
export function releaseYear(value: YouTubeText | undefined): string | undefined {
  return textRuns(value)
    .map((run) => run.text?.trim())
    .find((text) => text && /^\d{4}$/.test(text));
}

/**
 * Collects the album playlist ids that watch endpoints inside a document point to.
 *
 * @param value - Parsed JSON value to search.
 * @param ids - Set to add to. Defaults to a new empty set.
 * @returns The set holding every `OLAK5uy_` playlist id found.
 */
function collectPlaylistIds(value: unknown, ids = new Set<string>()): Set<string> {
  visitObjects(value, (object) => {
    const endpoint = object.watchPlaylistEndpoint;
    if (!isObject(endpoint) || typeof endpoint.playlistId !== "string") return;
    if (ALBUM_ID_PATTERN.test(endpoint.playlistId)) ids.add(endpoint.playlistId);
  });
  return ids;
}

/**
 * Extracts the albums a search document lists, one per playlist id.
 *
 * @param data - Parsed `search` hydration document.
 * @returns Candidates with title, artists and release year, deduplicated by playlist id.
 */
export function searchCandidates(data: unknown): AlbumCandidate[] {
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

/**
 * Checks that a search document has the result structure, so an empty result is a miss and not a changed page.
 *
 * @param data - Parsed `search` hydration document.
 * @throws {UpstreamUnavailableError} When the result root, tabs or collections are missing.
 */
export function requireSearchRoot(data: unknown): void {
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
