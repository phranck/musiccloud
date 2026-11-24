import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { ExpiringValueCache, throwOnEmpty } from "../../../lib/infra/expiring-value-cache";
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
import { fetchProviderPage, type ProviderPageOptions } from "../_shared/browser-fetch.js";
import { scoreAlbumCandidate, scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { JSON_LD_ALBUM_TYPE, JSON_LD_RECORDING_TYPE, JSON_LD_SCRIPT_PATTERN, readJsonLd } from "../_shared/json-ld.js";
import { readProviderJson } from "../_shared/provider-response.js";
import {
  logCandidateScore,
  pickBestCandidate,
  pickBestTrack,
  searchMatchResult,
  trackScoreLogger,
} from "../_shared/rank.js";

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
 * 24h. `fetchCsrfToken` is coalesced through the `csrfToken` cache so
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

/** How long a CSRF token is reused before the homepage is read again: 24 hours. */
const CSRF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** The CSRF token. A failed homepage read answers the token from before, however old. */
const csrfToken = new ExpiringValueCache<string>({
  load: throwOnEmpty(fetchCsrfToken, "Pandora CSRF token"),
  timeToLiveMs: CSRF_TOKEN_TTL_MS,
  keepStaleOnFailure: true,
});

/**
 * Answers the CSRF token, reading the homepage when there is none or it has aged out.
 *
 * @returns The token, the one from before when a read fails, or `null` when
 *   no read has produced one yet, as in a restricted region. Never throws,
 *   because `fetchCsrfToken` reports every failure as `null`.
 */
function getCsrfToken(): Promise<string | null> {
  return csrfToken.get().catch(() => null);
}

/**
 * Reads a CSRF token from the `csrftoken` cookie the homepage sets.
 *
 * @returns The token, or `null` when the request fails or sets no such cookie.
 *   Failures are never thrown.
 */
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const response = await fetchProviderPage(PANDORA_BASE, PANDORA_HOMEPAGE_REQUEST);
    // set-cookie headers need special handling across environments
    const setCookies = response.headers.getSetCookie?.() ?? [];
    const setCookie = setCookies.join("; ") || response.headers.get("set-cookie") || "";
    const match = /csrftoken=([^;]+)/.exec(setCookie);

    if (!match?.[1]) return null;
    log.debug("Pandora", "Refreshed CSRF token");
    return match[1];
  } catch {
    log.debug("Pandora", "Failed to refresh CSRF token");
    return null;
  }
}

// --- Fetch helpers ---

/** How long the homepage fetch for the CSRF token may take, 5 s, shorter than the default page timeout. */
const PANDORA_HOMEPAGE_TIMEOUT_MS = 5000;

/** How the homepage is requested for its CSRF cookie: with the user agent alone, within {@link PANDORA_HOMEPAGE_TIMEOUT_MS}. */
const PANDORA_HOMEPAGE_REQUEST: ProviderPageOptions = { timeoutMs: PANDORA_HOMEPAGE_TIMEOUT_MS };

async function pandoraApiFetch(endpoint: string, body: unknown): Promise<Response> {
  // The pair goes along when the homepage handed one out. Where it does not,
  // such as a restricted region, the search still answers without it.
  const token = await getCsrfToken();
  const csrfHeaders: Record<string, string> = token ? { "X-CsrfToken": token, Cookie: `csrftoken=${token}` } : {};

  return fetchProviderPage(`${PANDORA_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json", ...csrfHeaders },
    init: { method: "POST", body: JSON.stringify(body) },
  });
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

  const body = await readProviderJson<PandoraSearchResponse | null>(response, Service.Pandora, `search for "${query}"`);
  if (!body || !Array.isArray(body.results) || !body.annotations || typeof body.annotations !== "object") {
    throw new UpstreamUnavailableError(
      Service.Pandora,
      `search for "${query}" answered without results and annotations`,
    );
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

/** The `var storeData = {...};` assignment a Pandora page embeds, with the object literal captured. */
const PANDORA_STORE_DATA_PATTERN = /var\s+storeData\s*=\s*(\{[\s\S]*?\});\s*(?:var\s|<\/script>)/m;

/** The `storeData` key whose first element maps catalog ids to their annotations. */
const PANDORA_STORE_ANNOTATIONS_KEY = "v4/catalog/annotateObjects";

/** Catalog id prefix of a track annotation in `storeData`: `TR:`. */
const PANDORA_TRACK_KEY_PREFIX = "TR:";

/** Catalog id prefix of an album annotation in `storeData`: `AL:`. */
const PANDORA_ALBUM_KEY_PREFIX = "AL:";

/**
 * Reads the first annotation of one kind out of a page's embedded `storeData`.
 *
 * @param html - A Pandora track or album page.
 * @param keyPrefix - Catalog id prefix of the wanted annotation, {@link PANDORA_TRACK_KEY_PREFIX} or {@link PANDORA_ALBUM_KEY_PREFIX}.
 * @param parseFailureMessage - Debug message logged when `storeData` or `map` throws.
 * @param map - Turns the found annotation into the result; it runs inside the same guard as the parse, so a throw becomes `null`.
 * @returns What `map` returns, or `null` when the page has no `storeData`, it holds no annotation with that prefix, or the parse or `map` throws.
 */
function readStoreEntry<T, R>(
  html: string,
  keyPrefix: string,
  parseFailureMessage: string,
  map: (entry: T) => R | null,
): R | null {
  const storeMatch = PANDORA_STORE_DATA_PATTERN.exec(html);
  if (!storeMatch) return null;

  try {
    const store = JSON.parse(storeMatch[1]) as Record<string, unknown>;
    const annotations = store[PANDORA_STORE_ANNOTATIONS_KEY];
    if (!Array.isArray(annotations) || annotations.length === 0) return null;

    const catalog = annotations[0] as Record<string, T>;
    const entry = Object.entries(catalog).find(([key]) => key.startsWith(keyPrefix));
    if (!entry) return null;

    return map(entry[1]);
  } catch {
    log.debug("Pandora", parseFailureMessage);
    return null;
  }
}

/**
 * Reads a track page's `storeData` track annotation.
 *
 * @param html - A Pandora track page.
 * @returns The annotation, or `null` when the page has none or `storeData` is not JSON.
 */
function extractFromStore(html: string): PandoraTrackData | null {
  return readStoreEntry<PandoraTrackData, PandoraTrackData>(
    html,
    PANDORA_TRACK_KEY_PREFIX,
    "Failed to parse storeData",
    (entry) => entry,
  );
}

/**
 * Reads a track page's `MusicRecording` block, logging a block that is not JSON.
 *
 * @param html - A Pandora track page.
 * @returns The block, or `null` when the page has none, it is not JSON, or it
 *   is not a recording block.
 */
function extractFromJsonLd(html: string): JsonLdMusicRecording | null {
  return readJsonLd<JsonLdMusicRecording>(html, JSON_LD_RECORDING_TYPE, {
    pattern: JSON_LD_SCRIPT_PATTERN,
    onInvalid: () => log.debug("Pandora", "Failed to parse JSON-LD"),
  });
}

// --- Album helpers ---

function mapAlbumData(data: PandoraAlbumData, sourceId: string): NormalizedAlbum {
  const webPath = data.shareableUrlPath ?? `/artist/${sourceId}`;
  const artists = splitArtistNames(data.artistName);

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
  const response = await fetchProviderPage(pageUrl);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.Pandora, response.status, ResourceKind.Album, albumPath);

  const html = await response.text();

  // Try storeData first
  const storeAlbum = readStoreEntry<PandoraAlbumData | undefined, NormalizedAlbum>(
    html,
    PANDORA_ALBUM_KEY_PREFIX,
    "Failed to parse storeData for album",
    (entry) => (entry?.name ? mapAlbumData(entry, albumPath) : null),
  );
  if (storeAlbum) return storeAlbum;

  // Try JSON-LD for MusicAlbum
  const ldData = readJsonLd<{
    "@type"?: string;
    name?: string;
    byArtist?: { name?: string };
    image?: string;
    url?: string;
  }>(html, JSON_LD_ALBUM_TYPE, {
    pattern: JSON_LD_SCRIPT_PATTERN,
    onInvalid: () => log.debug("Pandora", "Failed to parse JSON-LD for album"),
  });
  if (ldData?.name) {
    return {
      sourceService: "pandora",
      sourceId: albumPath,
      title: ldData.name,
      artists: splitArtistNames(ldData.byArtist?.name),
      artworkUrl: ldData.image,
      webUrl: ldData.url ?? pageUrl,
    };
  }

  // Pandora answers 404 for an album it does not have, so a page that loaded
  // without an album in it is not an answer about this album.
  throw new UpstreamUnavailableError(Service.Pandora, `album page ${albumPath} carried no album data`);
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
    const response = await fetchProviderPage(pageUrl);

    if (!response.ok) {
      throw serviceHttpError(Service.Pandora, response.status, ResourceKind.Track, trackPath);
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

    // Pandora answers 404 for a track it does not have, so a page that loads
    // without track data is a failure rather than a miss.
    throw new UpstreamUnavailableError(Service.Pandora, `track page ${trackPath} carried no track data`);
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

    // A hit without a name is skipped, and the others keep their position in `trackIds`.
    const named = trackIds.flatMap((id, index) => {
      const data = annotations[id];
      if (!data?.name) return [];
      const urlPath = data.shareableUrlPath?.replace(/^\/artist\//, "") ?? `search-${index}`;
      return [{ track: mapTrackData(data, urlPath), index }];
    });
    const { best, confidence } = pickBestTrack(
      named,
      (track, index) => scoreSearchCandidate(query, track, index),
      trackScoreLogger("Pandora", "→"),
    );

    const match = searchMatchResult("track", best, confidence);
    if (!match.found) {
      log.debug("Pandora", `Best confidence ${confidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
    }
    return match;
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

    // A hit without a name is skipped, and the others keep their position in `albumIds`.
    const named = albumIds.flatMap((id, index) => {
      const data = annotations[id] as PandoraAlbumData | undefined;
      const name = data?.name;
      if (!data || !name) return [];
      const urlPath = (data.shareableUrlPath ?? "").replace(/^\/artist\//, "");
      return [{ name, album: mapAlbumData(data, urlPath || `search-${index}`) }];
    });
    const { best, confidence } = pickBestCandidate(
      named,
      ({ album }) => scoreAlbumCandidate(query, album),
      ({ name }, _index, score) => logCandidateScore("Pandora", `"${name}"`, score),
    );
    return searchMatchResult("album", best?.album, confidence);
  },
} satisfies ServiceAdapter & Record<string, unknown>;

// Export for testing
/** Drops the cached CSRF token, so the next search reads the homepage again. Test-only. */
export function _resetCsrfTokenCache(): void {
  csrfToken.invalidate();
}

/**
 * Stores a CSRF token as if the homepage had just handed it out. Test-only.
 *
 * @param token - The token the next searches send.
 */
export function _setCsrfTokenForTest(token: string): void {
  csrfToken.set(token);
}
