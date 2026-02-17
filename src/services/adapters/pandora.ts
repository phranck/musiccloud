import { fetchWithTimeout } from "../../lib/fetch.js";
import { log } from "../../lib/logger";
import { calculateConfidence } from "../../lib/normalize";
import { MATCH_MIN_CONFIDENCE } from "../resolver.js";
import type { MatchResult, NormalizedTrack, SearchQuery, ServiceAdapter } from "../types";

/**
 * Pandora Scrape Adapter
 *
 * Uses Pandora's internal REST API (www.pandora.com/api/v3/sod/search) with a
 * CSRF token extracted from the homepage cookie. Falls back to HTML scraping
 * for direct track resolution.
 *
 * Supports: URL detection, track resolution (scrape + API), search (internal API)
 * No auth needed - CSRF token is public and extracted on demand.
 * Note: Pandora is US-only. Requests from non-US IPs may be blocked.
 * On Vercel (us-east-1) this works fine.
 */

// URL format: pandora.com/artist/{artist}/{album}/{track}/{trackId}
const PANDORA_TRACK_REGEX =
  /^https?:\/\/(?:www\.)?pandora\.com\/artist\/([^/]+\/[^/]+\/[^/]+\/TR[a-zA-Z0-9]+)(?:\?.*)?$/;

const PANDORA_BASE = "https://www.pandora.com";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } }, timeoutMs);
}

async function pandoraApiFetch(endpoint: string, body: unknown): Promise<Response> {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) throw new Error("Pandora: No CSRF token available");

  return fetchWithTimeout(
    `${PANDORA_BASE}${endpoint}`,
    {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        "X-CsrfToken": csrfToken,
        Cookie: `csrftoken=${csrfToken}`,
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

interface PandoraSearchResponse {
  results?: string[];
  annotations?: Record<string, PandoraTrackData>;
}

// --- Track data mapping ---

function buildArtworkUrl(artUrl: string | undefined): string | undefined {
  if (!artUrl) return undefined;
  if (artUrl.startsWith("http")) return artUrl;
  return `${IMG_BASE}${artUrl}`;
}

function mapTrackData(data: PandoraTrackData, sourceId: string): NormalizedTrack {
  const webPath = data.shareableUrlPath ?? `/artist/${sourceId}`;

  // Split combined artist names (e.g. "A, B & C") into individual entries
  const artists = data.artistName
    ? data.artistName
        .split(/[,&]/)
        .map((a) => a.trim())
        .filter(Boolean)
    : ["Unknown Artist"];

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
  const artists = jsonLd.byArtist?.name
    ? jsonLd.byArtist.name
        .split(/[,&]/)
        .map((a) => a.trim())
        .filter(Boolean)
    : ["Unknown Artist"];

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

// --- Adapter ---

export const pandoraAdapter = {
  id: "pandora",
  displayName: "Pandora",
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true;
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
    const q = query.title === query.artist ? query.title : `${query.artist} ${query.title}`;

    try {
      const response = await pandoraApiFetch("/api/v3/sod/search", {
        query: q,
        types: ["TR"],
        count: 5,
      });

      if (!response.ok) {
        log.debug("Pandora", "Search API failed:", response.status);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      const result = (await response.json()) as PandoraSearchResponse;
      const trackIds = (result.results ?? []).filter((id) => id.startsWith("TR:"));
      const annotations = result.annotations ?? {};

      if (trackIds.length === 0) {
        log.debug("Pandora", "Search returned no tracks for:", q);
        return { found: false, confidence: 0, matchMethod: "search" };
      }

      log.debug("Pandora", `Search returned ${trackIds.length} tracks for: ${q}`);

      const isFreeText = query.title === query.artist;
      let bestMatch: NormalizedTrack | null = null;
      let bestConfidence = 0;

      for (let i = 0; i < trackIds.length; i++) {
        const data = annotations[trackIds[i]];
        if (!data?.name) continue;

        const urlPath = data.shareableUrlPath?.replace(/^\/artist\//, "") ?? `search-${i}`;
        const track = mapTrackData(data, urlPath);
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
    } catch (error) {
      log.debug("Pandora", "Search failed:", error instanceof Error ? error.message : error);
      return { found: false, confidence: 0, matchMethod: "search" };
    }
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
