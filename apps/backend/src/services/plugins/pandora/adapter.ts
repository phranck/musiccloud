import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
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
} from "../../types";
import { splitArtistNames } from "../_shared/artists.js";
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

/**
 * @file Pandora adapter: internal API + page-scrape hybrid.
 *
 * Keyless (always available in terms of config). Pandora restricts
 * non-US IPs: the homepage of a non-US client redirects to `/restricted`
 * and sets no `csrftoken` cookie. The search answers such a client anyway,
 * without the CSRF pair (checked from Austria on 2026-10-12).
 *
 * ## A failure is not a miss
 *
 * An empty search answers 200 with an empty `results` list and an empty
 * `annotations` map, and a page for an id Pandora does not have answers
 * 404. Only those two mean "nothing". An error status, a body that is not
 * that envelope and a page without its data block all throw, because the
 * resolver skips a service for a month after a returned miss.
 *
 * ## CSRF token from homepage cookie
 *
 * The search endpoint (`/api/v3/sod/search`) is a POST that requires
 * a CSRF token supplied BOTH in the `X-CsrfToken` header AND in a
 * `Cookie: csrftoken=...` value. The token itself is minted from the
 * `set-cookie` response when hitting the homepage, then cached for
 * 24h. `fetchCsrfToken` is coalesced through `csrfTokenPromise` so
 * concurrent requests share one homepage fetch.
 *
 * ## Two resolution paths
 *
 * `getTrack` first tries the embedded `storeData` JSON from the
 * track page (`extractFromStore`), then falls back to JSON-LD
 * (`extractFromJsonLd`). `storeData` is richer (ISRC, explicitness,
 * duration) but only present for logged-out crawler views; JSON-LD
 * is a cross-browser floor.
 *
 * ## URL format: four-part slug
 *
 * Pandora track URLs have four slug segments:
 * `pandora.com/artist/{artist}/{album}/{track}/TR{trackId}`. The
 * track ID is the `TR`-prefixed last segment; `detectUrl` captures
 * everything after `/artist/` which is what the scrape endpoint
 * wants back.
 *
 * ## Artwork URL: relative paths
 *
 * Pandora's `icon.artUrl` can be either a full URL or a relative
 * path that needs prepending with `content-images.p-cdn.com/`.
 * `buildArtworkUrl` handles both.
 *
 * ## No ISRC-lookup endpoint
 *
 * Pandora has ISRC metadata per track but no ISRC-to-track endpoint
 * is reachable without an authenticated subscriber session.
 * `findByIsrc` is not implemented; the resolver falls back to text
 * search.
 */

// URL format: pandora.com/artist/{artist}/{album}/{track}/{trackId}
const PANDORA_TRACK_REGEX =
  /^https?:\/\/(?:www\.)?pandora\.com\/artist\/([^/]+\/[^/]+\/[^/]+\/TR[a-zA-Z0-9]+)(?:\?.*)?$/;
// Pandora album URL format: pandora.com/artist/{artist}/{album}/AL{id}
const PANDORA_ALBUM_REGEX = /^https?:\/\/(?:www\.)?pandora\.com\/artist\/([^/]+\/[^/]+\/AL[a-zA-Z0-9]+)(?:\?.*)?$/;

const PANDORA_BASE = "https://www.pandora.com";

const IMG_BASE = "https://content-images.p-cdn.com/";

// --- CSRF token management ---

let cachedCsrfToken: string | null = null;
let csrfTokenFetchedAt = 0;
let csrfTokenPromise: Promise<string | null> | null = null;
const CSRF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getCsrfToken(): Promise<string | null> {
  if (cachedCsrfToken && Date.now() - csrfTokenFetchedAt < CSRF_TOKEN_TTL_MS) {
    return cachedCsrfToken;
  }

  // Promise coalescing: prevent parallel requests from each fetching independently
  if (csrfTokenPromise) return csrfTokenPromise;
  csrfTokenPromise = fetchCsrfToken().finally(() => {
    csrfTokenPromise = null;
  });
  return csrfTokenPromise;
}

async function fetchCsrfToken(): Promise<string | null> {
  try {
    const response = await pandoraFetch(PANDORA_BASE, 5000);
    // set-cookie headers need special handling across environments
    const setCookies = response.headers.getSetCookie?.() ?? [];
    const setCookie = setCookies.join("; ") || response.headers.get("set-cookie") || "";
    const match = /csrftoken=([^;]+)/.exec(setCookie);

    if (match?.[1]) {
      cachedCsrfToken = match[1];
      csrfTokenFetchedAt = Date.now();
      log.debug("Pandora", "Refreshed CSRF token");
    }

    return cachedCsrfToken;
  } catch {
    log.debug("Pandora", "Failed to refresh CSRF token");
    return cachedCsrfToken;
  }
}

// --- Fetch helpers ---

async function pandoraFetch(url: string, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(url, { headers: { "User-Agent": SCRAPER_USER_AGENT } }, timeoutMs);
}

async function pandoraApiFetch(endpoint: string, body: unknown): Promise<Response> {
  // The pair goes along when the homepage handed one out. Where it does not,
  // such as a restricted region, the search still answers without it.
  const csrfToken = await getCsrfToken();
  const csrfHeaders: Record<string, string> = csrfToken
    ? { "X-CsrfToken": csrfToken, Cookie: `csrftoken=${csrfToken}` }
    : {};

  return fetchWithTimeout(
    `${PANDORA_BASE}${endpoint}`,
    {
      method: "POST",
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
        "Content-Type": "application/json",
        ...csrfHeaders,
      },
      body: JSON.stringify(body),
    },
    8000,
  );
}

// --- Track data types ---

interface PandoraTrackData {
  name?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  durationMillis?: number;
  isrc?: string;
  trackNumber?: number;
  icon?: { artUrl?: string };
  shareableUrlPath?: string;
  pandoraId?: string;
  explicitness?: string;
  type?: string;
}

interface JsonLdMusicRecording {
  "@type"?: string;
  "@id"?: string;
  name?: string;
  byArtist?: { name?: string };
  image?: string;
  url?: string;
}

interface PandoraAlbumData {
  name?: string;
  artistName?: string;
  releaseDate?: string;
  trackCount?: number;
  icon?: { artUrl?: string };
  shareableUrlPath?: string;
  pandoraId?: string;
  label?: string;
  upc?: string;
  type?: string;
}

interface PandoraSearchResponse {
  results?: string[];
  annotations?: Record<string, PandoraTrackData | PandoraAlbumData>;
}

/**
 * Runs Pandora's catalog search for one kind of object.
 *
 * @param query - The search text.
 * @param type - `TR` for tracks, `AL` for albums.
 * @param kind - What the search is for, which an error names.
 * @returns The ids found and their annotations. A search without results
 *   answers an empty `results` list, so an empty list is an answer.
 * @throws When the request fails, answers with an error status, carries a
 *   body that is not JSON, or lacks the `results` list or the `annotations`
 *   map that every answer has, because each of those is a failure rather
 *   than an answer.
 */
async function pandoraSearch(
  query: string,
  type: "TR" | "AL",
  kind: ResourceKind,
): Promise<Required<PandoraSearchResponse>> {
  const response = await pandoraApiFetch("/api/v3/sod/search", { query, types: [type], count: 5 });
  if (!response.ok) throw serviceHttpError(Service.Pandora, response.status, kind, query, Operation.Search);

  let body: PandoraSearchResponse | null;
  try {
    body = (await response.json()) as PandoraSearchResponse | null;
  } catch (error) {
    throw new UpstreamUnavailableError("pandora", `search for "${query}" answered with a body that is not JSON`, error);
  }
  if (!body || !Array.isArray(body.results) || !body.annotations || typeof body.annotations !== "object") {
    throw new UpstreamUnavailableError("pandora", `search for "${query}" answered without results and annotations`);
  }
  return { results: body.results, annotations: body.annotations };
}

// --- Track data mapping ---

function buildArtworkUrl(artUrl: string | undefined): string | undefined {
  if (!artUrl) return undefined;
  if (artUrl.startsWith("http")) return artUrl;
  return `${IMG_BASE}${artUrl}`;
}

function mapTrackData(data: PandoraTrackData, sourceId: string): NormalizedTrack {
  const webPath = data.shareableUrlPath ?? `/artist/${sourceId}`;
  const artists = splitArtistNames(data.artistName);

  return {
    sourceService: "pandora",
    sourceId,
    isrc: data.isrc || undefined,
    title: data.name ?? "Unknown",
    artists,
    albumName: data.albumName,
    durationMs: data.durationMillis ?? (data.duration ? data.duration * 1000 : undefined),
    isExplicit: data.explicitness === "EXPLICIT" ? true : undefined,
    artworkUrl: buildArtworkUrl(data.icon?.artUrl),
    webUrl: `${PANDORA_BASE}${webPath}`,
  };
}

function mapJsonLdTrack(jsonLd: JsonLdMusicRecording, sourceId: string): NormalizedTrack {
  const artists = splitArtistNames(jsonLd.byArtist?.name);

  return {
    sourceService: "pandora",
    sourceId,
    title: jsonLd.name ?? "Unknown",
    artists,
    artworkUrl: jsonLd.image,
    webUrl: jsonLd.url ?? `${PANDORA_BASE}/artist/${sourceId}`,
  };
}

// --- HTML scraping for getTrack ---

function extractFromStore(html: string): PandoraTrackData | null {
  const storeMatch = /var\s+storeData\s*=\s*(\{[\s\S]*?\});\s*(?:var\s|<\/script>)/m.exec(html);
  if (!storeMatch) return null;

  try {
    const store = JSON.parse(storeMatch[1]) as Record<string, unknown>;
    const annotations = store["v4/catalog/annotateObjects"];
    if (!Array.isArray(annotations) || annotations.length === 0) return null;

    const catalog = annotations[0] as Record<string, PandoraTrackData>;
    const trackEntry = Object.entries(catalog).find(([key]) => key.startsWith("TR:"));
    if (!trackEntry) return null;

    return trackEntry[1];
  } catch {
    log.debug("Pandora", "Failed to parse storeData");
    return null;
  }
}

function extractFromJsonLd(html: string): JsonLdMusicRecording | null {
  const match = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]) as JsonLdMusicRecording;
    if (data["@type"] === "MusicRecording") return data;
    return null;
  } catch {
    log.debug("Pandora", "Failed to parse JSON-LD");
    return null;
  }
}

// --- Album helpers ---

function mapAlbumData(data: PandoraAlbumData, sourceId: string): NormalizedAlbum {
  const webPath = data.shareableUrlPath ?? `/artist/${sourceId}`;
  const artists = data.artistName
    ? data.artistName
        .split(/[,&]/)
        .map((a) => a.trim())
        .filter(Boolean)
    : ["Unknown Artist"];

  return {
    sourceService: "pandora",
    sourceId,
    upc: data.upc,
    title: data.name ?? "Unknown",
    artists,
    label: data.label,
    artworkUrl: buildArtworkUrl(data.icon?.artUrl),
    releaseDate: data.releaseDate,
    totalTracks: data.trackCount,
    webUrl: `${PANDORA_BASE}${webPath}`,
  };
}

/**
 * Reads an album from its Pandora page.
 *
 * @param albumPath - The path after `/artist/`.
 * @returns The album, or `null` when Pandora answers 404 for it.
 * @throws When Pandora answers with another error status, or with a page that
 *   carries no album data.
 */
async function fetchAlbumByPath(albumPath: string): Promise<NormalizedAlbum | null> {
  const pageUrl = `${PANDORA_BASE}/artist/${albumPath}`;
  const response = await pandoraFetch(pageUrl);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Pandora, response.status, ResourceKind.Album, albumPath);

  const html = await response.text();

  // Try storeData first
  const storeMatch = /var\s+storeData\s*=\s*(\{[\s\S]*?\});\s*(?:var\s|<\/script>)/m.exec(html);
  if (storeMatch) {
    try {
      const store = JSON.parse(storeMatch[1]) as Record<string, unknown>;
      const annotations = store["v4/catalog/annotateObjects"];
      if (Array.isArray(annotations) && annotations.length > 0) {
        const catalog = annotations[0] as Record<string, PandoraAlbumData>;
        const albumEntry = Object.entries(catalog).find(([key]) => key.startsWith("AL:"));
        if (albumEntry?.[1]?.name) {
          return mapAlbumData(albumEntry[1], albumPath);
        }
      }
    } catch {
      log.debug("Pandora", "Failed to parse storeData for album");
    }
  }

  // Try JSON-LD for MusicAlbum
  const match = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (match) {
    try {
      const ldData = JSON.parse(match[1]) as {
        "@type"?: string;
        name?: string;
        byArtist?: { name?: string };
        image?: string;
        url?: string;
      };
      if (ldData["@type"] === "MusicAlbum" && ldData.name) {
        const artists = ldData.byArtist?.name
          ? ldData.byArtist.name
              .split(/[,&]/)
              .map((a) => a.trim())
              .filter(Boolean)
          : ["Unknown Artist"];
        return {
          sourceService: "pandora",
          sourceId: albumPath,
          title: ldData.name,
          artists,
          artworkUrl: ldData.image,
          webUrl: ldData.url ?? pageUrl,
        };
      }
    } catch {
      log.debug("Pandora", "Failed to parse JSON-LD for album");
    }
  }

  // Pandora answers 404 for an album it does not have, so a page that loaded
  // without an album in it is not an answer about this album.
  throw new UpstreamUnavailableError("pandora", `album page ${albumPath} carried no album data`);
}

// --- Adapter ---

export const pandoraAdapter = {
  id: "pandora",
  displayName: getPlatformLabel("pandora"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = PANDORA_TRACK_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getTrack(trackPath: string): Promise<NormalizedTrack> {
    const pageUrl = `${PANDORA_BASE}/artist/${trackPath}`;
    const response = await pandoraFetch(pageUrl);

    if (!response.ok) {
      throw new Error(`Pandora page fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const store = extractFromStore(html);
    if (store?.name) {
      return mapTrackData(store, trackPath);
    }

    const jsonLd = extractFromJsonLd(html);
    if (jsonLd?.name) {
      return mapJsonLdTrack(jsonLd, trackPath);
    }

    throw new Error("Pandora: Could not extract track title from page");
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    // Pandora has no public ISRC lookup endpoint
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const result = await pandoraSearch(q, "TR", ResourceKind.Track);
    const trackIds = result.results.filter((id) => id.startsWith("TR:"));
    const annotations = result.annotations;

    if (trackIds.length === 0) {
      log.debug("Pandora", "Search returned no tracks for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Pandora", `Search returned ${trackIds.length} tracks for: ${q}`);

    let bestMatch: NormalizedTrack | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < trackIds.length; i++) {
      const data = annotations[trackIds[i]];
      if (!data?.name) continue;

      const urlPath = data.shareableUrlPath?.replace(/^\/artist\//, "") ?? `search-${i}`;
      const track = mapTrackData(data, urlPath);
      const confidence = scoreSearchCandidate(query, track, i);

      log.debug(
        "Pandora",
        `  [${i}] "${track.title}" by ${track.artists.join(", ")} → confidence=${confidence.toFixed(3)}`,
      );

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = track;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      log.debug("Pandora", `Best confidence ${bestConfidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }

    return {
      found: true,
      track: bestMatch,
      confidence: bestConfidence,
      matchMethod: "search",
    };
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = PANDORA_ALBUM_REGEX.exec(url);
    return match?.[1] ?? null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumByPath(albumId);
    if (!album) throw serviceNotFoundError(Service.Pandora, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;

    const result = await pandoraSearch(q, "AL", ResourceKind.Album);
    const albumIds = result.results.filter((id) => id.startsWith("AL:"));
    const annotations = result.annotations;

    if (albumIds.length === 0) {
      log.debug("Pandora", "Album search returned no albums for:", q);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    log.debug("Pandora", `Album search returned ${albumIds.length} albums for: ${q}`);

    let bestMatch: NormalizedAlbum | null = null;
    let bestConfidence = 0;

    for (let i = 0; i < albumIds.length; i++) {
      const data = annotations[albumIds[i]] as PandoraAlbumData | undefined;
      if (!data?.name) continue;

      const urlPath = (data.shareableUrlPath ?? "").replace(/^\/artist\//, "");
      const album = mapAlbumData(data, urlPath || `search-${i}`);
      const confidence = scoreAlbumCandidate(query, album);
      log.debug("Pandora", `  "${data.name}" -> confidence=${confidence.toFixed(3)}`);
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = album;
      }
    }

    if (!bestMatch || bestConfidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence: bestConfidence, matchMethod: "search" };
    }
    return { found: true, album: bestMatch, confidence: bestConfidence, matchMethod: "search" };
  },
} satisfies ServiceAdapter & Record<string, unknown>;

// Export for testing
export function _resetCsrfTokenCache(): void {
  cachedCsrfToken = null;
  csrfTokenFetchedAt = 0;
}

export function _setCsrfTokenForTest(token: string): void {
  cachedCsrfToken = token;
  csrfTokenFetchedAt = Date.now();
}
