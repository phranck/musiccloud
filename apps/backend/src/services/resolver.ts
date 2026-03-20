import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import { CACHE_TTL_MS } from "../lib/config.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { isUrl, stripTrackingParams, validateMusicUrl } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import {
  AUTO_SELECT_THRESHOLD,
  CANDIDATE_MIN_CONFIDENCE,
  LINK_QUALITY_THRESHOLD,
  MATCH_MIN_CONFIDENCE,
  MAX_CANDIDATES,
  SEARCH_FALLBACK_CONFIDENCE,
} from "./constants.js";
import { adapters, identifyService } from "./index.js";
import type { MatchResult, NormalizedTrack, SearchCandidate, ServiceAdapter, ServiceId } from "./types.js";
import { isValidServiceId } from "./types.js";

export interface ResolvedLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "isrc" | "search" | "cache";
  /** True when the link is a search URL rather than a direct track link */
  isSearchFallback?: boolean;
  /** Service-specific track ID (e.g. Spotify track ID, Deezer track ID) */
  externalId?: string;
  /** 30-second audio preview URL from this service (if available) */
  previewUrl?: string;
}

export interface ResolutionResult {
  sourceTrack: NormalizedTrack;
  links: ResolvedLink[];
  trackId?: string; // present when loaded from cache
  /** Set when the original input was a short/redirect link (e.g. link.deezer.com/s/…) that was expanded. */
  inputUrl?: string;
}

export interface TextSearchResult {
  kind: "resolved" | "disambiguation";
  result?: ResolutionResult;
  candidates?: SearchCandidate[];
}

function mapCachedLinks(
  links: Array<{ service: string; url: string; confidence: number; matchMethod: string }>,
): ResolvedLink[] {
  return links
    .filter((l) => isValidServiceId(l.service))
    .map((l) => ({
      service: l.service as ServiceId,
      displayName: PLATFORM_CONFIG[l.service as ServiceId].label,
      url: l.url,
      confidence: l.confidence,
      matchMethod: l.matchMethod as "isrc" | "search" | "cache",
    }));
}

/**
 * Try to serve a result from DB cache. Returns null on miss, expired TTL, or errors.
 * Non-fatal: cache errors are logged but never propagate.
 */
async function tryCache(lookup: { url?: string; isrc?: string }): Promise<ResolutionResult | null> {
  try {
    const repo = await getRepository();
    let cached = lookup.url ? await repo.findTrackByUrl(lookup.url) : null;
    if (!cached && lookup.isrc) cached = await repo.findTrackByIsrc(lookup.isrc);
    if (!cached) return null;

    const age = Date.now() - cached.updatedAt;
    if (age > CACHE_TTL_MS) {
      log.debug("Resolver", `Cache expired: age=${Math.round(age / 3600000)}h`);
      return null;
    }

    const links = mapCachedLinks(cached.links);
    log.debug("Resolver", `Cache hit: ${links.length} links, age=${Math.round(age / 60000)}min`);

    return { sourceTrack: cached.track, links, trackId: cached.trackId };
  } catch (error) {
    log.error("Resolver", `Cache read failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function fillMissingServices(cached: ResolutionResult): Promise<ResolutionResult> {
  const coveredServices = new Set(cached.links.map((l) => l.service));

  const missingAdapters = adapters.filter(
    (a) => a.isAvailable() && !coveredServices.has(a.id) && a.id !== cached.sourceTrack.sourceService,
  );

  // When the cached track has no preview URL, also re-fetch Deezer (even if already covered)
  // to get a fresh permanent CDN preview URL. Skip if Deezer is the source service
  // (it already had a chance to return one) or is already in missingAdapters.
  const needsPreview = !cached.sourceTrack.previewUrl;
  const deezerAdapter = needsPreview
    ? adapters.find(
        (a) =>
          a.id === "deezer" &&
          a.isAvailable() &&
          a.id !== cached.sourceTrack.sourceService &&
          !missingAdapters.some((m) => m.id === "deezer"),
      )
    : undefined;

  const adaptersToFetch = deezerAdapter ? [...missingAdapters, deezerAdapter] : missingAdapters;

  if (adaptersToFetch.length === 0) return cached;

  log.debug(
    "Resolver",
    `Gap-filling ${adaptersToFetch.length} services for cached track${deezerAdapter ? " (incl. Deezer for preview)" : ""}`,
  );

  const results = await Promise.allSettled(adaptersToFetch.map((a) => resolveOnService(a, cached.sourceTrack)));

  const newLinks: ResolvedLink[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      newLinks.push(result.value);
    }
  }

  if (newLinks.length === 0) return cached;

  // Only persist genuinely new service links (not Deezer re-fetched for preview only)
  const genuinelyNewLinks = newLinks.filter((l) => !coveredServices.has(l.service));
  if (cached.trackId && genuinelyNewLinks.length > 0) {
    try {
      const repo = await getRepository();
      await repo.addLinksToTrack(
        cached.trackId,
        genuinelyNewLinks.map((l) => ({
          service: l.service,
          url: l.url,
          confidence: l.confidence,
          matchMethod: l.matchMethod,
          externalId: l.externalId,
        })),
      );
    } catch (error) {
      log.error("Resolver", `Failed to persist gap-fill links: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Don't add Deezer twice to allLinks if it was only re-fetched for preview
  const allLinks = [...cached.links, ...genuinelyNewLinks].sort((a, b) => b.confidence - a.confidence);

  // Always prefer a fresh Deezer preview URL — Deezer CDN URLs are permanent,
  // Spotify preview URLs expire after ~30-60 days. Overwrite any existing value.
  let sourceTrack = cached.sourceTrack;
  const deezerGapLink = newLinks.find((l) => l.service === "deezer" && l.previewUrl);
  const anyGapPreview = deezerGapLink ?? newLinks.find((l) => l.previewUrl);
  if (anyGapPreview?.previewUrl) {
    sourceTrack = { ...sourceTrack, previewUrl: anyGapPreview.previewUrl };
  }

  return { sourceTrack, links: allLinks, trackId: cached.trackId };
}

/**
 * Confidence scoring constants (unified strategy).
 *
 * MATCH_MIN_CONFIDENCE: Minimum score for an adapter to consider a result "found".
 * LINK_QUALITY_THRESHOLD: Minimum score for inclusion in final cross-service results.
 * AUTO_SELECT_THRESHOLD: Above this, text search auto-selects without disambiguation.
 * CANDIDATE_MIN_CONFIDENCE: Minimum score to appear in disambiguation list.
 * CACHE_CONFIDENCE: Confidence assigned to DB-cached search results.
 * SEARCH_FALLBACK_CONFIDENCE: Confidence for generic "search on X" fallback links.
 */
export { LINK_QUALITY_THRESHOLD, MATCH_MIN_CONFIDENCE };

// CACHE_TTL_MS imported from ../lib/constants.js

/** Hosts that serve redirect short links pointing to canonical music platform URLs. */
const SHORT_LINK_HOSTS = new Set(["link.deezer.com"]);

/**
 * If `url` is a known short link, follows the redirect (HEAD) and returns the
 * final canonical URL. Falls back to the original URL on network failure.
 */
async function expandShortLink(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!SHORT_LINK_HOSTS.has(parsed.hostname)) return url;
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" });
    if (res.url && res.url !== url) return res.url;
  } catch {
    // Network failure – fall through so the caller can surface a meaningful error
  }
  return url;
}

/**
 * Main entry point: accepts a URL or free-text query, returns cross-service links.
 */
export async function resolveQuery(input: string): Promise<ResolutionResult> {
  const trimmed = input.trim();

  if (isUrl(trimmed)) {
    // Validate URL for unsupported content types
    const validation = validateMusicUrl(trimmed);
    if (!validation.valid) {
      throw new ResolveError(validation.code, validation.message);
    }
    // Pass the raw URL – resolveUrl handles tracking-param stripping and short-link expansion
    return resolveUrl(trimmed);
  }

  return resolveTextSearch(trimmed);
}

export async function resolveUrl(inputUrl: string): Promise<ResolutionResult> {
  // Strip tracking params, then expand short links (e.g. link.deezer.com/s/…)
  const strippedInput = stripTrackingParams(inputUrl);
  const expandedUrl = await expandShortLink(strippedInput);
  const cleanUrl = stripTrackingParams(expandedUrl); // strip again in case expanded URL carries UTMs
  const wasExpanded = cleanUrl !== strippedInput;

  // Helper: attach the original short-link URL so the route handler can save it as an alias
  const withAlias = (r: ResolutionResult): ResolutionResult => (wasExpanded ? { ...r, inputUrl: strippedInput } : r);

  // 1. Cache lookup by URL (try canonical first; fall back to the short link as alias)
  const cachedByCanonical = await tryCache({ url: cleanUrl });
  if (cachedByCanonical) return withAlias(await fillMissingServices(cachedByCanonical));
  if (wasExpanded) {
    const cachedByAlias = await tryCache({ url: strippedInput });
    if (cachedByAlias) return withAlias(await fillMissingServices(cachedByAlias));
  }

  // 2. Identify which service the URL belongs to
  const sourceAdapter = identifyService(cleanUrl);
  if (!sourceAdapter) {
    throw new ResolveError("NOT_MUSIC_LINK", "Unrecognized music service URL");
  }

  const trackId = sourceAdapter.detectUrl(cleanUrl);
  if (!trackId) {
    throw new ResolveError("INVALID_URL", "Could not extract track ID from URL");
  }

  // 3. Fetch metadata
  let sourceTrack: NormalizedTrack;
  try {
    sourceTrack = await sourceAdapter.getTrack(trackId);
  } catch (error) {
    if (!sourceAdapter.isAvailable()) {
      return withAlias(await resolveUrlViaScrape(cleanUrl, sourceAdapter.id));
    }
    throw error;
  }

  // 3b. Cache lookup by ISRC (in case same track was resolved via different URL)
  if (sourceTrack.isrc) {
    const cachedByIsrc = await tryCache({ isrc: sourceTrack.isrc });
    if (cachedByIsrc) return withAlias(await fillMissingServices(cachedByIsrc));
  }

  // 4. Resolve on all other services in parallel
  const links = await resolveAcrossServices(sourceTrack, sourceAdapter);

  // 5. Add the source service link
  links.unshift({
    service: sourceAdapter.id,
    displayName: sourceAdapter.displayName,
    url: sourceTrack.webUrl,
    confidence: 1.0,
    matchMethod: "isrc",
    externalId: sourceTrack.sourceId,
    previewUrl: sourceTrack.previewUrl,
  });

  // 6. Always prefer a stable Deezer preview URL over any other service.
  // Deezer CDN URLs are permanent; Spotify preview URLs expire after ~30-60 days.
  const deezerLink = links.find((l) => l.service === "deezer" && l.previewUrl);
  const bestPreviewUrl =
    deezerLink?.previewUrl ?? links.find((l) => l.previewUrl)?.previewUrl ?? sourceTrack.previewUrl;
  if (bestPreviewUrl !== sourceTrack.previewUrl) {
    sourceTrack = { ...sourceTrack, previewUrl: bestPreviewUrl };
  }

  return withAlias({ sourceTrack, links });
}

export async function resolveTextSearch(query: string): Promise<ResolutionResult> {
  // Service search: try all available adapters
  const searchAdapters = adapters.filter((a): a is ServiceAdapter => Boolean(a?.isAvailable?.()));
  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack({
        title: query,
        artist: query,
      });

      if (result.found && result.track) {
        // Cache lookup by ISRC before full cross-service resolve
        if (result.track.isrc) {
          const cached = await tryCache({ isrc: result.track.isrc });
          if (cached) return fillMissingServices(cached);
        }

        const links = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: result.track.sourceId,
        });

        return { sourceTrack: result.track, links };
      }
    } catch {}
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No track found for the search query");
}

/**
 * Text search with disambiguation support.
 * Returns candidates for user selection when no single result has high enough confidence.
 * Auto-selects when top result confidence > 0.9.
 */
export async function resolveTextSearchWithDisambiguation(query: string): Promise<TextSearchResult> {
  log.debug("Resolver", "resolveTextSearchWithDisambiguation called with:", query);

  // Service search: try adapters that support searchTrackWithCandidates, then fall back
  const searchAdapters = adapters.filter((a): a is ServiceAdapter => Boolean(a?.isAvailable?.()));

  for (const adapter of searchAdapters) {
    try {
      // Use searchTrackWithCandidates if available (e.g. Spotify)
      if (adapter.searchTrackWithCandidates) {
        const searchResult = await adapter.searchTrackWithCandidates({
          title: query,
          artist: query,
        });

        if (searchResult.candidates.length === 0) continue;

        const topCandidate = searchResult.candidates[0];

        // Auto-select when confidence is high enough
        if (topCandidate.confidence >= AUTO_SELECT_THRESHOLD) {
          // Cache lookup by ISRC before full resolve
          if (topCandidate.track.isrc) {
            const cached = await tryCache({ isrc: topCandidate.track.isrc });
            if (cached) return { kind: "resolved", result: cached };
          }

          const links = await resolveAcrossServices(topCandidate.track, adapter);
          links.unshift({
            service: adapter.id,
            displayName: adapter.displayName,
            url: topCandidate.track.webUrl,
            confidence: topCandidate.confidence,
            matchMethod: "search",
            externalId: topCandidate.track.sourceId,
          });

          return { kind: "resolved", result: { sourceTrack: topCandidate.track, links } };
        }

        // Return candidates for disambiguation
        const candidates: SearchCandidate[] = searchResult.candidates
          .filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE)
          .slice(0, MAX_CANDIDATES)
          .map((c) => ({
            id: `${c.track.sourceService}:${c.track.sourceId}`,
            title: c.track.title,
            artists: c.track.artists,
            albumName: c.track.albumName,
            artworkUrl: c.track.artworkUrl,
            durationMs: c.track.durationMs,
            confidence: c.confidence,
          }));

        return { kind: "disambiguation", candidates };
      }

      // Fallback: use regular searchTrack
      const result = await adapter.searchTrack({
        title: query,
        artist: query,
      });

      if (result.found && result.track) {
        // Cache lookup by ISRC before full resolve
        if (result.track.isrc) {
          const cached = await tryCache({ isrc: result.track.isrc });
          if (cached) return { kind: "resolved", result: cached };
        }

        const links = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: result.track.sourceId,
        });

        return { kind: "resolved", result: { sourceTrack: result.track, links } };
      }
    } catch {}
  }

  throw new ResolveError("TRACK_NOT_FOUND", "No track found for the search query");
}

/**
 * Resolves a specific Spotify track by ID (after user selects from disambiguation list).
 */
export async function resolveSelectedCandidate(candidateId: string): Promise<ResolutionResult> {
  // candidateId format: "spotify:trackId"
  const [service, trackId] = candidateId.split(":", 2);
  if (!service || !trackId) {
    throw new ResolveError("INVALID_URL", "Invalid candidate ID format");
  }

  const adapter = adapters.find((a) => a.id === service);
  if (!adapter || !adapter.isAvailable()) {
    throw new ResolveError("SERVICE_DOWN", `${service} is not available`);
  }

  const sourceTrack = await adapter.getTrack(trackId);

  // Cache lookup by ISRC before full cross-service resolve
  if (sourceTrack.isrc) {
    const cached = await tryCache({ isrc: sourceTrack.isrc });
    if (cached) return cached;
  }

  const links = await resolveAcrossServices(sourceTrack, adapter);

  links.unshift({
    service: adapter.id,
    displayName: adapter.displayName,
    url: sourceTrack.webUrl,
    confidence: 1.0,
    matchMethod: "search",
    externalId: sourceTrack.sourceId,
  });

  return { sourceTrack, links };
}

async function resolveAcrossServices(
  sourceTrack: NormalizedTrack,
  excludeAdapter: ServiceAdapter,
): Promise<ResolvedLink[]> {
  const targetAdapters = adapters.filter((a): a is ServiceAdapter => {
    if (!a) {
      log.error("Resolver", "resolveAcrossServices: undefined entry in adapter registry");
      return false;
    }
    return a.id !== excludeAdapter.id && a.isAvailable();
  });

  const ADAPTER_TIMEOUT_MS = 10_000;

  const withTimeout = (adapter: ServiceAdapter): Promise<ResolvedLink | null> =>
    Promise.race([
      resolveOnService(adapter, sourceTrack),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ADAPTER_TIMEOUT_MS}ms`)), ADAPTER_TIMEOUT_MS),
      ),
    ]);

  // Resolve on each target service in parallel
  const results = await Promise.allSettled(targetAdapters.map((adapter) => withTimeout(adapter)));

  const links: ResolvedLink[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const adapter = targetAdapters[i];

    if (result.status === "fulfilled" && result.value) {
      log.debug("Resolver", `[${adapter.id}] matched: confidence=${result.value.confidence}`);
      links.push(result.value);
    } else if (result.status === "fulfilled") {
      log.debug("Resolver", `[${adapter.id}] no match found`);
    } else {
      log.error(
        "Resolver",
        `[${adapter.id}] resolve failed: ${result.reason instanceof Error ? result.reason.message : result.reason}`,
      );
    }
  }

  // Derive YouTube Music link from YouTube result (same video ID, different domain)
  const youtubeLink = links.find((l) => l.service === "youtube");
  if (youtubeLink && !links.some((l) => l.service === "youtube-music")) {
    const videoIdMatch = /[?&]v=([^&]+)/.exec(youtubeLink.url);
    if (videoIdMatch) {
      links.push({
        service: "youtube-music",
        displayName: "YouTube Music",
        url: `https://music.youtube.com/watch?v=${videoIdMatch[1]}`,
        confidence: youtubeLink.confidence,
        matchMethod: youtubeLink.matchMethod,
        externalId: youtubeLink.externalId,
      });
    }
  }

  // For services with no match, add YouTube search fallback
  const coveredServices = new Set([excludeAdapter.id, ...links.map((l) => l.service)]);

  if (!coveredServices.has("youtube") && sourceTrack.title && sourceTrack.artists.length > 0) {
    const searchQuery = encodeURIComponent(`${sourceTrack.artists[0]} ${sourceTrack.title}`);
    links.push({
      service: "youtube",
      displayName: "YouTube",
      url: `https://music.youtube.com/search?q=${searchQuery}`,
      confidence: SEARCH_FALLBACK_CONFIDENCE,
      matchMethod: "search",
      isSearchFallback: true,
    });
  }

  // Sort by confidence (highest first)
  links.sort((a, b) => b.confidence - a.confidence);

  // Filter out low-confidence matches (but keep search fallbacks)
  return links.filter((l) => l.confidence >= LINK_QUALITY_THRESHOLD || l.isSearchFallback);
}

async function resolveOnService(adapter: ServiceAdapter, sourceTrack: NormalizedTrack): Promise<ResolvedLink | null> {
  // Strategy 1: ISRC lookup (most reliable)
  if (adapter.capabilities.supportsIsrc && sourceTrack.isrc) {
    if (adapter.id === "youtube") {
      // YouTube doesn't support ISRC anyway, but just in case
      return resolveViaSearch(adapter, sourceTrack);
    }

    const track = await adapter.findByIsrc(sourceTrack.isrc);
    if (track) {
      return {
        service: adapter.id,
        displayName: adapter.displayName,
        url: track.webUrl,
        confidence: 1.0,
        matchMethod: "isrc",
        externalId: track.sourceId,
        previewUrl: track.previewUrl,
      };
    }
  }

  // Strategy 2: Text search (fallback)
  return resolveViaSearch(adapter, sourceTrack);
}

async function resolveViaSearch(adapter: ServiceAdapter, sourceTrack: NormalizedTrack): Promise<ResolvedLink | null> {
  const result: MatchResult = await adapter.searchTrack({
    title: sourceTrack.title,
    artist: sourceTrack.artists[0] ?? "",
    album: sourceTrack.albumName,
  });

  if (!result.found || !result.track) return null;

  return {
    service: adapter.id,
    displayName: adapter.displayName,
    url: result.track.webUrl,
    confidence: result.confidence,
    matchMethod: result.matchMethod,
    externalId: result.track.sourceId,
    previewUrl: result.track.previewUrl,
  };
}

/**
 * Scrape OG meta tags from a music service page to extract title and artist.
 * Used as fallback when the source adapter has no API credentials.
 *
 * Supports formats:
 *   - English: "Title by Artist on Service"
 *   - German: "„Title" von Artist bei Service"
 *   - French: "Title par Artist sur Service"
 *   - Generic fallback: split on common separators
 */
async function scrapeTrackFromPage(
  url: string,
): Promise<{ title: string; artist: string; artworkUrl?: string } | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          // Bot UA gets server-rendered OG tags (SPA shells don't include them)
          "User-Agent": "facebookexternalhit/1.1",
        },
        redirect: "follow",
      },
      8000,
    );

    if (!response.ok) return null;

    const html = await response.text();

    // Extract og:title
    const ogTitleMatch = /<meta\s+property="og:title"\s+content="([^"]*)"/i.exec(html);
    if (!ogTitleMatch?.[1]) return null;

    const ogTitle = ogTitleMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/\u201E|\u201C|\u201D/g, ""); // Remove „ " " quotes

    // Extract og:image for artwork
    const ogImageMatch = /<meta\s+property="og:image"\s+content="([^"]*)"/i.exec(html);
    const artworkUrl = ogImageMatch?.[1] || undefined;

    // Try locale-aware patterns: "Title by Artist on Service", "Title von Artist bei Service"
    const patterns = [
      /^(.+?)\s+by\s+(.+?)\s+on\s+.+$/i, // English
      /^(.+?)\s+von\s+(.+?)\s+bei\s+.+$/i, // German
      /^(.+?)\s+par\s+(.+?)\s+sur\s+.+$/i, // French
      /^(.+?)\s+di\s+(.+?)\s+su\s+.+$/i, // Italian
      /^(.+?)\s+de\s+(.+?)\s+en\s+.+$/i, // Spanish
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(ogTitle);
      if (match?.[1] && match?.[2]) {
        return { title: match[1].trim(), artist: match[2].trim(), artworkUrl };
      }
    }

    // Fallback: use og:title as free-text query (strip " on/bei/sur ServiceName")
    const stripped = ogTitle
      .replace(
        /\s+(on|bei|sur|su|en)\s+(Apple Music|Spotify|Deezer|Tidal|YouTube|SoundCloud|Qobuz|Pandora|Napster|Audius).*$/i,
        "",
      )
      .trim();

    if (stripped && stripped !== ogTitle) {
      // "Title - Artist" or "Title by Artist" without service suffix
      const dashSplit = stripped.split(/\s+[-–—]\s+/);
      if (dashSplit.length >= 2) {
        return { title: dashSplit[0].trim(), artist: dashSplit[1].trim(), artworkUrl };
      }
    }

    // Last resort: use the cleaned title as both title and artist (free-text search)
    if (stripped && !stripped.toLowerCase().includes("web player")) {
      return { title: stripped, artist: stripped, artworkUrl };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback resolver for URLs where the source adapter has no API credentials.
 * Scrapes the page for OG metadata, then does a cross-service text search.
 */
async function resolveUrlViaScrape(url: string, sourceServiceId: ServiceId): Promise<ResolutionResult> {
  const scraped = await scrapeTrackFromPage(url);
  if (!scraped) {
    throw new ResolveError(
      "SERVICE_DOWN",
      `Cannot resolve ${sourceServiceId} URL: adapter not configured and page scrape failed`,
    );
  }

  log.debug("Resolver", `Scraped from page: "${scraped.title}" by ${scraped.artist}`);

  // Search across all available adapters
  const searchAdapters = adapters.filter((a) => a.isAvailable());
  const query = { title: scraped.title, artist: scraped.artist };

  let bestSourceTrack: NormalizedTrack | null = null;
  let bestAdapter: ServiceAdapter | null = null;
  let bestConfidence = 0;

  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack(query);
      if (result.found && result.track && result.confidence > bestConfidence) {
        bestSourceTrack = result.track;
        bestAdapter = adapter;
        bestConfidence = result.confidence;
      }
    } catch {}
  }

  if (!bestSourceTrack || !bestAdapter) {
    throw new ResolveError("TRACK_NOT_FOUND", `Track not found: "${scraped.title}" by ${scraped.artist}`);
  }

  // ISRC cache check
  if (bestSourceTrack.isrc) {
    const cached = await tryCache({ isrc: bestSourceTrack.isrc });
    if (cached) return cached;
  }

  // Resolve across all other services
  const links = await resolveAcrossServices(bestSourceTrack, bestAdapter);

  // Add the source adapter's match
  links.unshift({
    service: bestAdapter.id,
    displayName: bestAdapter.displayName,
    url: bestSourceTrack.webUrl,
    confidence: bestConfidence,
    matchMethod: "search",
    externalId: bestSourceTrack.sourceId,
  });

  // Add the original URL as a link for the source service
  links.unshift({
    service: sourceServiceId,
    displayName: PLATFORM_CONFIG[sourceServiceId].label,
    url,
    confidence: 0.9,
    matchMethod: "search",
  });

  // Use scraped artwork if the source track doesn't have one
  if (!bestSourceTrack.artworkUrl && scraped.artworkUrl) {
    bestSourceTrack = { ...bestSourceTrack, artworkUrl: scraped.artworkUrl };
  }

  return { sourceTrack: bestSourceTrack, links };
}
